import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { urlFoto } from './Foto.jsx';

const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0));

function Barra({ rot, a, b, cor, suf = '' }) {
  return (
    <div className="eq-barra">
      <div className="eq-rot"><span>{rot}</span><b>{a}{b ? ` / ${b}` : ''}{suf}</b></div>
      <div className="bar" style={{ '--c': cor }}><i style={{ width: pct(a, b || 100) + '%' }} /></div>
    </div>
  );
}

function Cartao({ r, nome, eu }) {
  const critico = r.hp_max > 0 && r.hp / r.hp_max <= 0.25;
  return (
    <div className={'eq-card' + (critico ? ' critico' : '')} aria-label={critico ? `${nome}: estado crítico` : undefined}>
      {r.foto ? <img className="eq-foto" src={urlFoto(r.foto)} alt="" /> : <span className="eq-foto">{(r.personagem || '?')[0]}</span>}
      <div className="eq-corpo">
        <div><strong>{r.personagem || 'Sem ficha'}</strong> <span className="muted">{eu ? 'Você' : '@' + nome}</span></div>
        <Barra rot="HP" a={r.hp} b={r.hp_max} cor="var(--hp)" />
        <Barra rot="Resistência" a={r.resistencia} cor="var(--res)" suf="%" />
        <Barra rot="Sanidade" a={r.san} b={r.san_max} cor="var(--san)" />
        {Array.isArray(r.condicoes) && r.condicoes.length > 0 && (
          <div className="row">{r.condicoes.map((c, i) => <span className="cond" key={i}>{c}</span>)}</div>
        )}
      </div>
    </div>
  );
}

export default function Equipe({ uid }) {
  const [linhas, setLinhas] = useState(null);
  const [nomes, setNomes] = useState({});
  const [fichas, setFichas] = useState([]);
  const [msg, setMsg] = useState('');

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('mesa_status').select('*');
    setLinhas(data || []);
    const ids = (data || []).map(r => r.user_id);
    if (ids.length) {
      const { data: ps } = await supabase.from('perfis').select('user_id,usuario').in('user_id', ids);
      setNomes(Object.fromEntries((ps || []).map(p => [p.user_id, p.usuario])));
    }
  }, []);

  useEffect(() => {
    carregar();
    supabase.from('fichas').select('id,nome').eq('user_id', uid).order('updated_at', { ascending: false }).then(({ data }) => setFichas(data || []));
    const ch = supabase.channel('equipe-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_status' }, carregar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);

  const rpc = async (nome, args, ok) => {
    const { error } = await supabase.rpc(nome, args);
    setMsg(error ? error.message : ok);
    if (!error) carregar();
  };

  const eu = (linhas || []).find(r => r.user_id === uid);
  const outros = (linhas || []).filter(r => r.user_id !== uid && r.ficha_id);

  return (
    <div className="stack">
      <div className="stack eq-config">
        <label className="f"><span>Minha ficha na mesa</span>
          <select value={(eu && eu.ficha_id) || ''} onChange={e => e.target.value && rpc('definir_ficha_ativa', { p_ficha: e.target.value }, 'Ficha da mesa atualizada.')}>
            <option value="">Escolha uma ficha</option>
            {fichas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select></label>
        <label className="auto">
          <input type="checkbox" checked={!!(eu && eu.compartilhar)} style={{ width: 18, height: 18 }}
            onChange={e => rpc('mesa_compartilhar', { p_on: e.target.checked }, e.target.checked ? 'Seus sinais vitais estão visíveis.' : 'Seus sinais vitais estão ocultos.')} />
          <span>Mostrar meus sinais vitais aos amigos que me marcarem como aliado</span>
        </label>
        <p className="muted">Mostra só o nome e a foto do personagem, HP, Resistência, Sanidade e condições da ficha escolhida.</p>
        {msg && <p className="muted" role="status">{msg}</p>}
      </div>

      {eu && eu.ficha_id && <Cartao r={eu} nome="" eu />}
      <h2>Aliados</h2>
      {!linhas && <p className="muted">Carregando…</p>}
      {linhas && !outros.length && (
        <p className="muted">Nenhum aliado aparece aqui ainda. Marque amigos como aliados no Bate-papo (★ Aliado). Eles precisam ter escolhido uma ficha e ativado o compartilhamento.</p>
      )}
      {outros.map(r => <Cartao key={r.user_id} r={r} nome={nomes[r.user_id] || '…'} />)}
    </div>
  );
}
