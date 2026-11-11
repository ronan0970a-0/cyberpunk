import { supabase } from './supabase';

// Chama a Edge Function "ia" (o login é enviado automaticamente)
export async function chamar(nome, corpo) {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });
  if (error) {
    let msg = 'Não foi possível falar com a IA.';
    const r = error.context;
    if (r && typeof r.json === 'function') {
      try {
        const j = await r.json();
        msg = j.erro || `${msg} (erro ${r.status}: ${j.message || j.msg || 'sem detalhes'})`;
      } catch {
        msg += ` (erro ${r.status})`;
      }
    } else {
      msg += ' (a função não respondeu: confira se ela foi criada no Supabase com o nome certo)';
    }
    throw new Error(msg);
  }
  return data;
}

export const pedirIA = corpo => chamar('ia', corpo);

// Resumo curto da ficha, enviado como contexto para a IA
export function contextoFicha(d) {
  const nomes = l => (l || []).map(i => i.nome).filter(Boolean).join(', ') || '—';
  const attrs = Object.entries(d).filter(([k, v]) => k.includes('.') && Number(v) > 0)
    .map(([k, v]) => `${k}: ${v}`).join('; ') || '—';
  return [
    `Nome: ${d.nome || '—'} | Sexo: ${d.sexo || '—'} | Idade: ${d.idade || '—'} | Peso: ${d.peso || '—'} | Altura: ${d.altura || '—'}`,
    `Atributos: ${attrs}`,
    `Implantes: ${nomes(d.implantes)}`,
    `Equipamento: ${nomes(d.equipamento)}`,
    `Vantagens: ${nomes(d.vantagem)}`,
    `Desvantagens: ${nomes(d.desvantagem)}`,
    d.background ? `Background: ${String(d.background).slice(0, 800)}` : ''
  ].filter(Boolean).join('\n');
}
