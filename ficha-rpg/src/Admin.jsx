import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { fmt } from './conta.js';

function Linha({ u, aviso, recarregar }) {
  const [v, setV] = useState('');
  const mover = async sinal => {
    const valor = Math.floor(Number(v)) * sinal;
    if (!valor) return aviso('Digite um valor.');
    const { error } = await supabase.rpc('admin_dar_dinheiro', { p_user: u.user_id, p_valor: valor });
    aviso(error ? error.message : `Feito: @${u.usuario} ${valor > 0 ? '+' : '−'}${fmt(Math.abs(valor))}`);
    setV('');
    recarregar();
  };
  const alternar = async () => {
    const { error } = await supabase.rpc('admin_liberar_clove', { p_user: u.user_id, p_liberar: !u.clove_liberada });
    aviso(error ? error.message : `CLOVE ${u.clove_liberada ? 'bloqueada' : 'liberada'} para @${u.usuario}`);
    recarregar();
  };
  const alternarV = async () => {
    const { error } = await supabase.rpc('admin_liberar_vendedor', { p_user: u.user_id, p_liberar: !u.pode_vender });
    aviso(error ? error.message : `@${u.usuario} ${u.pode_vender ? 'não vende mais' : 'agora pode vender'}`);
    recarregar();
  };
  return (
    <div className="am adm">
      <div className="grow"><strong>@{u.usuario}</strong> <span className="muted">{u.nome}</span><br />DINHEIRO ◆ {fmt(u.saldo)}</div>
      <div className="row">
        <input type="number" min="1" placeholder="Valor" aria-label={`Valor para ${u.usuario}`} value={v} onChange={e => setV(e.target.value)} style={{ width: 90 }} />
        <button type="button" className="mini" onClick={() => mover(1)}>Dar</button>
        <button type="button" className="danger mini" onClick={() => mover(-1)}>Tirar</button>
      </div>
      <button type="button" className={'mini ' + (u.clove_liberada ? '' : 'ghost')} onClick={alternar}>
        CLOVE: {u.clove_liberada ? 'liberada' : 'bloqueada'}
      </button>
      <button type="button" className={'mini ' + (u.pode_vender ? '' : 'ghost')} onClick={alternarV}>
        Vendedor: {u.pode_vender ? 'sim' : 'não'}
      </button>
    </div>
  );
}

function Jogadores() {
  const [lista, setLista] = useState([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = async () => {
    const { data, error } = await supabase.rpc('admin_listar');
    if (error) setMsg(error.message); else setLista(data);
  };
  useEffect(() => { carregar(); }, []);
  const vis = lista.filter(u => `${u.usuario} ${u.nome}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <input placeholder="Buscar jogador" value={q} onChange={e => setQ(e.target.value)} />
      {msg && <p className="muted" role="status">{msg}</p>}
      {vis.map(u => <Linha key={u.user_id} u={u} aviso={setMsg} recarregar={carregar} />)}
    </div>
  );
}

function Extrato() {
  const [lista, setLista] = useState([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    supabase.rpc('admin_extrato', { p_limite: 200 }).then(({ data, error }) => (error ? setMsg(error.message) : setLista(data)));
  }, []);
  const vis = lista.filter(t => `${t.de_usuario} ${t.para_usuario}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <input placeholder="Filtrar por @usuario" value={q} onChange={e => setQ(e.target.value)} />
      {msg && <p className="muted" role="status">{msg}</p>}
      {vis.map(t => (
        <div className="ext" key={t.id}>
          <span>{t.tipo === 'admin' ? `KILL JOY → @${t.para_usuario}` : t.tipo === 'loja' ? `@${t.de_usuario} → @${t.para_usuario} (mercado negro: ${t.nota})` : `@${t.de_usuario} → @${t.para_usuario}`}<br />
            <small className="muted">{new Date(t.criado_em).toLocaleString('pt-BR')}</small></span>
          <b className={t.tipo === 'admin' && t.valor < 0 ? 'neg' : 'pos'}>{t.tipo === 'admin' && t.valor < 0 ? '−' : ''}◆ {fmt(Math.abs(t.valor))}</b>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [aba, setAba] = useState('jogadores');
  return (
    <div className="stack">
      <div className="row">
        <button type="button" className={aba === 'jogadores' ? 'mini' : 'ghost mini'} onClick={() => setAba('jogadores')}>Jogadores</button>
        <button type="button" className={aba === 'extrato' ? 'mini' : 'ghost mini'} onClick={() => setAba('extrato')}>Extrato geral</button>
      </div>
      {aba === 'jogadores' ? <Jogadores /> : <Extrato />}
    </div>
  );
}
