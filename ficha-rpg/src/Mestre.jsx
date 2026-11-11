import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const num = v => Number(v) || 0;
const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0));

// Painel do mestre: todas as fichas dos jogadores, atualizadas em tempo real. Toque para abrir (somente leitura).
export default function Mestre({ uid, onAbrir }) {
  const [linhas, setLinhas] = useState(null);
  const [donos, setDonos] = useState({});
  const [q, setQ] = useState('');
  const [erro, setErro] = useState('');
  const tm = useRef();

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('fichas')
      .select('id,nome,user_id,updated_at,hp:data->>hp,hpMax:data->>hpMax,san:data->>san,sanMax:data->>sanMax')
      .neq('user_id', uid).order('updated_at', { ascending: false }).limit(300);
    if (error) return setErro(error.message);
    setLinhas(data);
    const ids = [...new Set(data.map(f => f.user_id))];
    if (ids.length) {
      const { data: ps } = await supabase.from('perfis').select('user_id,usuario,nome').in('user_id', ids);
      setDonos(Object.fromEntries((ps || []).map(p => [p.user_id, p])));
    }
  }, [uid]);

  useEffect(() => {
    carregar();
    const ch = supabase.channel('mestre-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fichas' }, () => {
        clearTimeout(tm.current);
        tm.current = setTimeout(carregar, 600); // agrupa os salvamentos automáticos
      })
      .subscribe();
    return () => { clearTimeout(tm.current); supabase.removeChannel(ch); };
  }, [carregar]);

  const vis = (linhas || []).filter(f => {
    const d = donos[f.user_id];
    return `${f.nome} ${d ? d.usuario + ' ' + d.nome : ''}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="stack">
      <input placeholder="Buscar jogador ou personagem" value={q} onChange={e => setQ(e.target.value)} />
      {erro && <p className="erro" role="alert">{erro}</p>}
      {!linhas && !erro && <p className="muted">Carregando…</p>}
      {linhas && !vis.length && <p className="muted">Nenhuma ficha encontrada.</p>}
      {vis.map(f => {
        const d = donos[f.user_id];
        return (
          <div className="am adm" key={f.id}>
            <div className="grow">
              <strong>{f.nome}</strong> <span className="muted">{d ? `@${d.usuario}` : '…'}</span>
              <div className="eq-barra"><div className="eq-rot"><span>HP</span><b>{num(f.hp)} / {num(f.hpMax)}</b></div>
                <div className="bar" style={{ '--c': 'var(--hp)' }}><i style={{ width: pct(num(f.hp), num(f.hpMax)) + '%' }} /></div></div>
              <div className="eq-barra"><div className="eq-rot"><span>Sanidade</span><b>{num(f.san)} / {num(f.sanMax)}</b></div>
                <div className="bar" style={{ '--c': 'var(--san)' }}><i style={{ width: pct(num(f.san), num(f.sanMax)) + '%' }} /></div></div>
            </div>
            <button type="button" className="mini" onClick={() => onAbrir(f.id)}>Abrir</button>
          </div>
        );
      })}
    </div>
  );
}
