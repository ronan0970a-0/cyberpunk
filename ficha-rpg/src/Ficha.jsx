import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import Foto, { BUCKET } from './Foto.jsx';
import ListaItens from './ListaItens.jsx';
import Condicoes from './Condicoes.jsx';
import Historico from './Historico.jsx';
import { exportarPDF } from './pdf.js';
import BotaoIA from './BotaoIA.jsx';
import { contextoFicha } from './ia.js';
import { attr, maximos, iniciativa, defesa, totalGrupo, humanidadeEfetiva, carga, capacidade } from './calc.js';

export const PADRAO = { resistencia: 100, hp: 150, hpMax: 150, san: 100, sanMax: 100 };

const GRUPOS = [
  ['Físico', ['Agilidade', 'Corpo', 'Força', 'Resistência']],
  ['Mental', ['Autocontrole', 'Destreza', 'Inteligência', 'Sabedoria']],
  ['Combate', ['Bloqueio', 'Briga', 'Esquiva', 'Foco']],
  ['Techno', ['Aceitação', 'Humanidade', 'Invasão', 'Proteção']],
  ['Social', ['Atributo social', 'Persuasão', 'Expressão', 'Intimidação']]
];

// Fichas antigas guardavam estes campos como texto; viram um item para não perder nada
const LISTAS = ['implantes', 'equipamento', 'vantagem', 'desvantagem'];
const lista = v => (Array.isArray(v) ? v : v ? [{ id: crypto.randomUUID(), nome: 'Anotação anterior', descricao: v }] : []);

const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? ((Number(a) || 0) / b) * 100 : 0));

const Campo = ({ rot, tipo = 'text', cls = '', ...p }) => (
  <label className={'f ' + cls}><span>{rot}</span><input type={tipo} {...p} /></label>
);
const Area = ({ rot, rows = 4, ...p }) => (
  <label className="f"><span>{rot}</span><textarea rows={rows} {...p} /></label>
);
// Área de texto que aumenta/diminui por botões (e também por arraste no computador)
const AreaRedim = ({ rot, altura, onAltura, rodape, ...p }) => (
  <div className="f">
    <div className="card-h">
      <h2>{rot}</h2>
      <div className="row">
        <button type="button" className="ghost mini" aria-label={'Diminuir ' + rot} onClick={() => onAltura(Math.max(100, altura - 120))}>−</button>
        <button type="button" className="ghost mini" aria-label={'Aumentar ' + rot} onClick={() => onAltura(Math.min(1600, altura + 120))}>+</button>
      </div>
    </div>
    <textarea className="redim" style={{ height: altura }} aria-label={rot} {...p} />
    {rodape}
  </div>
);
const Vital = ({ nome, cor, valor, max, onSet, rodape, children }) => (
  <div className="vital" style={{ '--c': cor }}>
    <div className="vh"><span>{nome}</span><div className="nums">{children}</div></div>
    <div className="bar"><i style={{ width: pct(valor, max) + '%' }} /></div>
    <div className="steps">
      {[-10, -1, 1, 10].map(s => (
        <button type="button" className="ghost" key={s}
          onClick={() => onSet(Math.max(0, Math.min(max, (Number(valor) || 0) + s)))}>{s > 0 ? '+' + s : s}</button>
      ))}
    </div>
    {rodape}
  </div>
);

export default function Ficha({ id, uid, onVoltar }) {
  const [f, setF] = useState(null);
  const [st, setSt] = useState('Salvo');
  const timer = useRef(null);
  const atual = useRef(null);
  const versao = useRef(null); // updated_at conhecido: detecta alteração em outro aparelho
  const fila = useRef(Promise.resolve());
  const [conflito, setConflito] = useState(false);
  const [hist, setHist] = useState(false);

  const carregar = useCallback(() => {
    supabase.from('fichas').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) return onVoltar();
      const dados = { ...PADRAO, nome: data.nome, ...data.data };
      LISTAS.forEach(k => { dados[k] = lista(dados[k]); });
      const ficha = { id: data.id, user_id: data.user_id, nome: data.nome, data: dados };
      atual.current = ficha;
      versao.current = data.updated_at;
      setF(ficha);
      setConflito(false);
      setSt('Salvo');
    });
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  // Salvamentos em fila e só se a ficha ainda estiver na versão que carregamos
  const salvar = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const executar = async () => {
      const x = atual.current;
      if (!x) return;
      setSt('Salvando…');
      const { data: r, error } = await supabase.from('fichas').update({ nome: x.nome, data: x.data })
        .eq('id', x.id).eq('updated_at', versao.current).select('updated_at');
      if (error) return setSt('Erro ao salvar: ' + error.message);
      if (!r.length) { clearTimeout(timer.current); timer.current = null; setConflito(true); return setSt('Conflito'); }
      versao.current = r[0].updated_at;
      setSt('Salvo');
    };
    fila.current = fila.current.then(executar);
    return fila.current;
  }, []);

  // v pode ser um valor ou uma função (valor atual -> novo valor)
  const set = (k, v) => {
    const p = atual.current;
    const val = typeof v === 'function' ? v(p.data[k]) : v;
    const prox = { ...p, nome: k === 'nome' ? String(val).trim() || 'Sem nome' : p.nome, data: { ...p.data, [k]: val } };
    atual.current = prox;
    setF(prox);
    setSt('Alterado…');
    clearTimeout(timer.current);
    timer.current = setTimeout(salvar, 800);
  };

  const bind = (k, tipo) => ({
    value: f.data[k] ?? '',
    onChange: e => set(k, tipo === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)
  });

  useEffect(() => () => { if (timer.current) salvar(); }, [salvar]);
  useEffect(() => {
    const h = e => { if (timer.current) e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const voltar = async () => { if (timer.current) await salvar(); onVoltar(); };
  const excluir = async () => {
    if (!confirm('Excluir esta ficha e todas as fotos? Não dá para desfazer.')) return;
    clearTimeout(timer.current);
    timer.current = null;
    const pasta = `${f.user_id}/${id}`;
    const { data: arq } = await supabase.storage.from(BUCKET).list(pasta);
    if (arq && arq.length) await supabase.storage.from(BUCKET).remove(arq.map(a => `${pasta}/${a.name}`));
    const { error } = await supabase.from('fichas').delete().eq('id', id);
    if (error) return setSt('Erro ao excluir: ' + error.message);
    onVoltar();
  };

  // Ficha de outra pessoa (visão do mestre): somente leitura e atualizada ao vivo
  const ro = !!f && f.user_id !== uid;
  useEffect(() => {
    if (!ro) return;
    const ch = supabase.channel('ficha-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fichas', filter: `id=eq.${id}` }, () => carregar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ro, id, carregar]);

  const restaurar = async vid => {
    if (timer.current) await salvar();
    const { error } = await supabase.rpc('restaurar_versao', { p_id: vid });
    if (error) return setSt('Erro: ' + error.message);
    setHist(false);
    carregar();
  };

  const usarNaMesa = async () => {
    await salvar();
    const { error } = await supabase.rpc('definir_ficha_ativa', { p_ficha: id });
    setSt(error ? 'Erro: ' + error.message : 'Esta ficha agora aparece na Equipe');
  };

  if (!f) return <main className="muted">Carregando…</main>;
  const d = f.data;
  const mx = maximos(d);
  const pasta = `${f.user_id}/${f.id}`;
  const hum = humanidadeEfetiva(d), cg = carga(d), cap = capacidade(d);
  const iaTexto = k => (
    <BotaoIA rotulo={k === 'lore' ? 'Escrever lore com IA' : 'Escrever background com IA'}
      corpo={() => ({ tarefa: k, texto: atual.current.data[k] || '', contexto: contextoFicha(atual.current.data) })}
      onTexto={t => set(k, c => (c ? c + '\n\n' : '') + t)} />
  );
  const iaItem = tipo => ({ tipo, contexto: () => contextoFicha(atual.current.data) });

  return (
    <main>
      <header className="top">
        <button type="button" className="ghost" onClick={voltar}>Voltar</button>
        <span className="muted" role="status">{ro ? 'Somente leitura · ao vivo' : st}</span>
        <div className="row">
          {!ro && <button type="button" className="ghost mini" onClick={() => setHist(true)}>Histórico</button>}
          <button type="button" className="ghost mini" onClick={() => exportarPDF(d, GRUPOS)}>PDF</button>
          {!ro && <button type="button" className="ghost mini" onClick={usarNaMesa}>Usar na mesa</button>}
        </div>
        {!ro && <button type="button" className="danger" onClick={excluir}>Excluir ficha</button>}
      </header>

      {!ro && <p className="aviso-conv" style={{ margin: '0 0 12px', padding: 0 }}>O mestre da mesa pode ver esta ficha em tempo real.</p>}
      {conflito && (
        <div className="conflito" role="alert">
          <span>Esta ficha foi alterada em outro aparelho ou aba, então as suas últimas edições não foram salvas.</span>
          <button type="button" onClick={carregar}>Recarregar a ficha</button>
        </div>
      )}
      <fieldset className={'bloq' + (ro ? ' leitura' : '')} disabled={conflito || ro}>
      <section className="card hero">
        <Foto className="retrato" pasta={pasta} valor={d.foto} rotulo="Foto do personagem" onChange={p => set('foto', p)} />
        <div className="hero-campos">
          <Campo rot="Nome" cls="nome" {...bind('nome')} />
          <div className="grid">
            <Campo rot="Sexo" {...bind('sexo')} />
            <Campo rot="Idade" tipo="number" {...bind('idade', 'number')} />
            <Campo rot="Peso" {...bind('peso')} />
            <Campo rot="Altura" {...bind('altura')} />
          </div>
        </div>
      </section>

      <div className="vitals">
        <Vital nome="Resistência" cor="var(--res)" valor={d.resistencia} max={100} onSet={v => set('resistencia', v)}>
          <input type="number" aria-label="Resistência" {...bind('resistencia', 'number')} />%
        </Vital>
        <Vital nome="HP" cor="var(--hp)" valor={d.hp} max={mx.hp} onSet={v => set('hp', v)}>
          <input type="number" aria-label="HP atual" {...bind('hp', 'number')} />/
          <input type="number" aria-label="HP máximo" {...bind('hpMax', 'number')} />
        </Vital>
        <Vital nome="Sanidade" cor="var(--san)" valor={d.san} max={mx.san} onSet={v => set('san', v)}>
          <input type="number" aria-label="Sanidade atual" {...bind('san', 'number')} />/
          <input type="number" aria-label="Sanidade máxima" {...bind('sanMax', 'number')} />
        </Vital>
      </div>

      <Condicoes lista={Array.isArray(d.condicoes) ? d.condicoes : []} onChange={v => set('condicoes', v)} />

      <section className="card">
        <h2>Derivados</h2>
        <div className="deriv">
          <div><b>{iniciativa(d)}</b><span>Iniciativa</span></div>
          <div><b>{defesa(d)}</b><span>Defesa</span></div>
          <div><b>{hum}<small> / {attr(d, 'Techno', 'Humanidade')}</small></b><span>Humanidade efetiva</span></div>
          <div className={cg > cap ? 'alerta' : ''}><b>{cg}<small> / {cap} kg</small></b><span>Carga</span></div>
        </div>
      </section>

      <div className="grupos">
        {GRUPOS.map(([g, itens]) => (
          <section className="card" key={g}>
            <div className="card-h"><h2>{g}</h2><span className="total" title="Soma do grupo">{totalGrupo(d, g, itens)}</span></div>
            {itens.map(i => (
              <label className="attr" key={i}>
                <span>{i}</span>
                <input type="number" {...bind(`${g}.${i}`, 'number')} />
              </label>
            ))}
          </section>
        ))}
      </div>

      <ListaItens titulo="Implantes" larga ia={iaItem('implante')} itens={d.implantes} onChange={v => set('implantes', v)} pasta={pasta} foto
        extras={[{ k: 'humanidade', rot: 'Custo de humanidade', padrao: 0 }]} vazio="Nenhum implante instalado." />
      <ListaItens titulo="Equipamento" ia={iaItem('equipamento')} itens={d.equipamento} onChange={v => set('equipamento', v)} pasta={pasta} foto
        extras={[{ k: 'qtd', rot: 'Qtd', padrao: 1 }, { k: 'peso', rot: 'Peso (kg)', padrao: 0 }]} vazio="Nenhum equipamento." />

      <div className="duo">
        <ListaItens titulo="Vantagem" ia={iaItem('vantagem')} itens={d.vantagem} onChange={v => set('vantagem', v)} vazio="Nenhuma vantagem." />
        <ListaItens titulo="Desvantagem" ia={iaItem('desvantagem')} itens={d.desvantagem} onChange={v => set('desvantagem', v)} vazio="Nenhuma desvantagem." />
      </div>

      <section className="card"><Area rot="Ganha" rows={3} {...bind('ganha')} /></section>
      <section className="card"><AreaRedim rot="Background" altura={d.backgroundH || 160} onAltura={h => set('backgroundH', h)} rodape={iaTexto('background')} {...bind('background')} /></section>
      <section className="card"><AreaRedim rot="Lore" altura={d.loreH || 280} onAltura={h => set('loreH', h)} rodape={iaTexto('lore')} {...bind('lore')} /></section>
      </fieldset>
      {hist && <Historico fichaId={f.id} onFechar={() => setHist(false)} onRestaurar={restaurar} />}
    </main>
  );
}
