import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import Foto, { urlFoto } from './Foto.jsx';
import { fmt } from './conta.js';

const VAZIO = { nome: '', descricao: '', categoria: 'equipamento', preco: '', estoque: '', humanidade: 0, peso: 0, foto: '' };

function Comprar({ uid, saldo, onSaldo }) {
  const [itens, setItens] = useState(null);
  const [vend, setVend] = useState({});
  const [fichas, setFichas] = useState([]);
  const [sel, setSel] = useState(null);
  const [ficha, setFicha] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const carregar = async () => {
    const { data } = await supabase.from('loja_itens').select('*').eq('ativo', true).order('criado_em', { ascending: false });
    setItens(data || []);
    const ids = [...new Set((data || []).map(i => i.vendedor_id))];
    if (ids.length) {
      const { data: ps } = await supabase.from('perfis').select('user_id,usuario').in('user_id', ids);
      setVend(Object.fromEntries((ps || []).map(p => [p.user_id, p.usuario])));
    }
  };
  useEffect(() => {
    carregar();
    supabase.from('fichas').select('id,nome').eq('user_id', uid).order('updated_at', { ascending: false })
      .then(({ data }) => { setFichas(data || []); if (data && data[0]) setFicha(data[0].id); });
  }, []);

  const comprar = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('comprar_item', { p_item: sel.id, p_ficha: ficha });
    setBusy(false);
    if (error) return setMsg(error.message);
    setMsg(`"${sel.nome}" foi entregue na sua ficha.`);
    setSel(null);
    onSaldo();
    carregar();
  };

  if (sel) {
    return (
      <div className="stack">
        <h2>{sel.nome}</h2>
        <p className="preco">◆ {fmt(sel.preco)} <span className="muted">(seu saldo: ◆ {fmt(saldo)})</span></p>
        {!fichas.length ? <p className="erro">Você precisa ter uma ficha para receber o item.</p> : (
          <label className="f"><span>Receber na ficha</span>
            <select value={ficha} onChange={e => setFicha(e.target.value)}>{fichas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
        )}
        <p className="aviso-pix">Comprar por ◆ {fmt(sel.preco)}? Não dá para desfazer.</p>
        <div className="row">
          <button type="button" onClick={comprar} disabled={busy || !ficha}>{busy ? 'Comprando…' : 'Confirmar compra'}</button>
          <button type="button" className="ghost" onClick={() => setSel(null)} disabled={busy}>Voltar</button>
        </div>
        {msg && <p className="erro" role="alert">{msg}</p>}
      </div>
    );
  }
  return (
    <div className="stack">
      {msg && <p className="muted" role="status">{msg}</p>}
      {!itens && <p className="muted">Carregando…</p>}
      {itens && !itens.length && <p className="muted">O mercado negro está vazio por enquanto.</p>}
      {itens && itens.map(i => (
        <div className="prod" key={i.id}>
          {i.foto ? <img src={urlFoto(i.foto)} alt="" /> : <span className="semfoto" />}
          <div className="grow">
            <strong>{i.nome}</strong> <span className="muted">{i.categoria} · @{vend[i.vendedor_id] || '…'}</span>
            <p className="muted">{i.descricao}</p>
            <span className="preco">◆ {fmt(i.preco)}</span>{i.estoque !== null && <span className="muted"> · restam {i.estoque}</span>}
          </div>
          {i.vendedor_id === uid
            ? <span className="muted">Seu item</span>
            : <button type="button" className="mini" onClick={() => { setMsg(''); setSel(i); }}>Comprar</button>}
        </div>
      ))}
    </div>
  );
}

function Vender({ uid }) {
  const [f, setF] = useState(VAZIO);
  const [meus, setMeus] = useState([]);
  const [msg, setMsg] = useState('');
  const mudar = (k, v) => setF(x => ({ ...x, [k]: v }));
  const carregar = () => supabase.from('loja_itens').select('*').eq('vendedor_id', uid).order('criado_em', { ascending: false }).then(({ data }) => setMeus(data || []));
  useEffect(() => { carregar(); }, []);

  const publicar = async () => {
    const preco = Math.floor(Number(f.preco));
    if (!f.nome.trim() || !(preco > 0)) return setMsg('Informe o nome e um preço maior que zero.');
    const { error } = await supabase.from('loja_itens').insert({
      categoria: f.categoria, nome: f.nome.trim(), descricao: f.descricao, preco, foto: f.foto || null,
      humanidade: Number(f.humanidade) || 0, peso: Number(f.peso) || 0,
      estoque: f.estoque === '' ? null : Math.max(0, Math.floor(Number(f.estoque)))
    });
    if (error) return setMsg(error.code === '42501' ? 'Você não tem permissão para vender. Peça à KILL JOY.' : error.message);
    setF(VAZIO);
    setMsg('Item publicado.');
    carregar();
  };
  const alternar = async i => {
    const { error } = await supabase.from('loja_itens').update({ ativo: !i.ativo }).eq('id', i.id);
    if (error) setMsg(error.message); else carregar();
  };

  return (
    <div className="stack">
      <h2>Novo item</h2>
      <div className="row">
        <Foto pasta={`${uid}/loja`} valor={f.foto} rotulo="Foto do item" onChange={p => mudar('foto', p)} />
        <div className="grow stack">
          <input placeholder="Nome" maxLength={60} value={f.nome} onChange={e => mudar('nome', e.target.value)} />
          <select value={f.categoria} onChange={e => mudar('categoria', e.target.value)}>
            <option value="equipamento">Equipamento</option><option value="implante">Implante</option>
          </select>
        </div>
      </div>
      <textarea rows={3} maxLength={500} placeholder="Descrição" value={f.descricao} onChange={e => mudar('descricao', e.target.value)} />
      <div className="extras">
        <label className="f"><span>Preço ◆</span><input type="number" min="1" value={f.preco} onChange={e => mudar('preco', e.target.value)} /></label>
        <label className="f"><span>Estoque (vazio = ilimitado)</span><input type="number" min="0" value={f.estoque} onChange={e => mudar('estoque', e.target.value)} /></label>
        {f.categoria === 'implante'
          ? <label className="f"><span>Custo de humanidade</span><input type="number" value={f.humanidade} onChange={e => mudar('humanidade', e.target.value)} /></label>
          : <label className="f"><span>Peso (kg)</span><input type="number" min="0" value={f.peso} onChange={e => mudar('peso', e.target.value)} /></label>}
      </div>
      <button type="button" onClick={publicar}>Publicar no mercado negro</button>
      {msg && <p className="muted" role="status">{msg}</p>}
      <h2>Meus itens</h2>
      {!meus.length && <p className="muted">Você ainda não anunciou nada.</p>}
      {meus.map(i => (
        <div className="am" key={i.id}>
          <div className="grow"><strong>{i.nome}</strong><br /><span className="muted">◆ {fmt(i.preco)} · {i.estoque === null ? 'ilimitado' : `restam ${i.estoque}`}</span></div>
          <button type="button" className={'mini' + (i.ativo ? ' ghost' : '')} onClick={() => alternar(i)}>{i.ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      ))}
    </div>
  );
}

export default function Loja({ uid, saldo, vendedor, onSaldo }) {
  const [aba, setAba] = useState('comprar');
  return (
    <div className="stack">
      {vendedor && (
        <div className="row">
          <button type="button" className={aba === 'comprar' ? 'mini' : 'ghost mini'} onClick={() => setAba('comprar')}>Comprar</button>
          <button type="button" className={aba === 'vender' ? 'mini' : 'ghost mini'} onClick={() => setAba('vender')}>Vender</button>
        </div>
      )}
      {aba === 'vender' && vendedor ? <Vender uid={uid} /> : <Comprar uid={uid} saldo={saldo} onSaldo={onSaldo} />}
    </div>
  );
}
