// Supabase Edge Function "ia": recebe o pedido do site, confere o login e o limite diário
// e chama o Gemini. A chave GEMINI_API_KEY fica só aqui (secret), nunca no navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const LIMITE = Number(Deno.env.get('IA_LIMITE_DIARIO') ?? '30'); // usos da IA por pessoa por dia
const MODELO = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite';
const cortar = (v: unknown, n: number) => String(v ?? '').slice(0, n);

const SISTEMA = `Você é um assistente de criação para fichas de RPG de mesa em um cenário cyberpunk sombrio: alta tecnologia, baixa qualidade de vida, implantes cibernéticos, perda de humanidade e de sanidade. Escreva sempre em português do Brasil, com tom imersivo e original. Entregue somente o texto pedido, sem títulos, sem markdown e sem comentários sobre você. Não invente regras nem números de jogo, a menos que peçam. Respeite o que o jogador já escreveu.`;

const GUIA: Record<string, string> = {
  implante: 'um implante cibernético: aparência, como funciona e um custo ou efeito colateral para o corpo ou a mente',
  equipamento: 'um item de equipamento: aparência, uso e uma peculiaridade ou limitação',
  vantagem: 'uma vantagem (traço positivo) do personagem: como surgiu e como o ajuda, de forma narrativa',
  desvantagem: 'uma desvantagem (traço negativo) do personagem: a origem e como o atrapalha, de forma narrativa'
};

function montar(b: any): string {
  const ctx = cortar(b.contexto, 4000);
  const instr = cortar(b.instrucao, 500);
  const texto = cortar(b.texto, 6000);
  const orient = instr ? `\n\nOrientação do jogador: ${instr}` : '';

  if (b.tarefa === 'lore' || b.tarefa === 'background') {
    const alvo = b.tarefa === 'lore' ? 'lore (história e mundo do personagem)' : 'background (passado do personagem)';
    const pedido = texto
      ? `Texto atual do ${alvo}:\n${texto}\n\nContinue e desenvolva este texto mantendo estilo e fatos. Escreva de 2 a 4 parágrafos novos, sem repetir o que já existe.`
      : `Escreva o ${alvo} deste personagem em 2 a 4 parágrafos.`;
    return `Ficha do personagem:\n${ctx}\n\n${pedido}${orient}`;
  }
  if (b.tarefa === 'item' && GUIA[b.tipo]) {
    const nome = cortar(b.nome, 100) || 'sem nome';
    const atual = texto ? `\nDescrição atual (melhore e expanda mantendo a ideia): ${texto}` : '';
    return `Ficha do personagem:\n${ctx}\n\nEscreva a descrição de ${GUIA[b.tipo]}, chamado(a) "${nome}".${atual}\nUse de 2 a 4 frases.${orient}`;
  }
  return '';
}

const RESERVA = Deno.env.get('GEMINI_MODEL_RESERVA') ?? 'gemini-3.5-flash';
// Tenta o modelo principal e, se ele estiver fora do ar ou sem cota, o modelo reserva
async function geminiFetch(init: RequestInit): Promise<Response> {
  let r!: Response;
  for (const m of [MODELO, RESERVA].filter((x, i, a) => x && a.indexOf(x) === i)) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, init);
    if (r.ok || ![404, 429, 500, 503].includes(r.status)) return r;
    console.error('Gemini', m, r.status);
  }
  return r;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ erro: 'Faça login para usar a IA.' }, 401);

    // Porteiro: só quem a KILL JOY liberou pode usar a IA
    const { data: ctl } = await sb.from('controle').select('clove_liberada').eq('user_id', user.id).maybeSingle();
    if (!ctl?.clove_liberada) return json({ erro: 'A IA ainda não foi liberada para a sua conta pela KILL JOY.' }, 403);

    const prompt = montar(await req.json());
    if (!prompt) return json({ erro: 'Pedido inválido.' }, 400);

    const { data: uso, error: eUso } = await sb.rpc('ia_consumir', { p_limite: LIMITE });
    if (eUso) return json({ erro: 'Não foi possível verificar o limite diário. Rodou o schema.sql atualizado?' }, 500);
    const u = Array.isArray(uso) ? uso[0] : uso;
    if (!u.ok) return json({ erro: `Você atingiu o limite de ${LIMITE} usos da IA por hoje. Volte amanhã.` }, 429);

    const r = await geminiFetch({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SISTEMA }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2000 }
      })
    });
    if (!r.ok) {
      console.error('Gemini', r.status, await r.text());
      return json({ erro: r.status === 429 ? 'A cota gratuita da IA acabou por agora. Tente em alguns minutos.' : 'A IA não respondeu. Tente de novo.' }, 502);
    }
    const dados = await r.json();
    const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
    if (!texto) return json({ erro: 'A IA não gerou texto (pode ter sido bloqueado). Tente reformular a orientação.' }, 502);
    return json({ texto, usos: u.total, limite: LIMITE });
  } catch (e) {
    console.error(e);
    return json({ erro: 'Erro inesperado.' }, 500);
  }
});
