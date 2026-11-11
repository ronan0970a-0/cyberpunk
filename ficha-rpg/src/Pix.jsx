import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { useAmigos, fmt } from './conta.js';

export function PixForm({ amizadeId, nome, saldo, onFeito, onCancelar }) {
  const [v, setV] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(false);
  const valor = Math.floor(Number(v));
  const revisar = () => {
    if (!(valor > 0)) return setErro('Digite um valor maior que zero.');
    if (valor > saldo) return setErro('Saldo insuficiente.');
    setErro('');
    setRev(true);
  };

  const enviar = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('pix_enviar', { p_amizade: amizadeId, p_valor: valor });
    setBusy(false);
    if (error) { setRev(false); return setErro(error.message); }
    onFeito();
  };

  return (
    <div className="pix-form">
      <strong>Pix para {nome}</strong>
      <span className="muted">Seu saldo: ◆ {fmt(saldo)}</span>
      <input type="number" inputMode="numeric" min="1" placeholder="Valor" aria-label="Valor do Pix" disabled={rev} value={v} onChange={e => setV(e.target.value)} />
      {erro && <p className="erro" role="alert">{erro}</p>}
      {rev && <p className="aviso-pix">Enviar ◆ {fmt(valor)} para {nome}? Seu saldo ficará ◆ {fmt(saldo - valor)}. Não dá para desfazer.</p>}
      <div className="row">
        {rev ? (
          <>
            <button type="button" onClick={enviar} disabled={busy}>{busy ? 'Enviando…' : 'Confirmar Pix'}</button>
            <button type="button" className="ghost" onClick={() => setRev(false)} disabled={busy}>Voltar</button>
          </>
        ) : (
          <>
            <button type="button" onClick={revisar}>Revisar</button>
            {onCancelar && <button type="button" className="ghost" onClick={onCancelar}>Cancelar</button>}
          </>
        )}
      </div>
    </div>
  );
}

export default function PixApp({ uid, saldo, onSaldo }) {
  const { am, perfis } = useAmigos(uid);
  const [alvo, setAlvo] = useState('');
  const [ext, setExt] = useState([]);
  const amigos = am.filter(a => a.status === 'aceita');
  const nomeDe = id => (perfis[id] ? '@' + perfis[id].usuario : 'ex-amigo');

  useEffect(() => {
    supabase.from('transferencias').select('*').order('id', { ascending: false }).limit(40).then(({ data }) => setExt(data || []));
  }, [saldo]);

  const a = amigos.find(x => x.id === alvo);
  const outro = a && perfis[a.de === uid ? a.para : a.de];

  return (
    <div className="stack">
      <div className="widget"><span className="muted">Saldo</span><b>◆ {fmt(saldo)}</b></div>
      {!amigos.length ? <p className="muted">Adicione amigos no Bate-papo para enviar Pix.</p> : (
        <label className="f"><span>Enviar Pix para</span>
          <select value={alvo} onChange={e => setAlvo(e.target.value)}>
            <option value="">Escolha um amigo</option>
            {amigos.map(x => { const o = perfis[x.de === uid ? x.para : x.de]; return <option key={x.id} value={x.id}>{o ? `${o.nome} (@${o.usuario})` : '…'}</option>; })}
          </select></label>
      )}
      {a && outro && <PixForm key={alvo} amizadeId={alvo} nome={outro.nome} saldo={saldo} onFeito={() => { setAlvo(''); onSaldo(); }} />}
      <h2>Extrato</h2>
      {!ext.length && <p className="muted">Nenhuma movimentação ainda.</p>}
      {ext.map(t => {
        const admin = t.tipo === 'admin';
        const entrou = admin ? t.valor > 0 : t.para === uid;
        const sinal = entrou ? '+' : '−';
        return (
          <div className="ext" key={t.id}>
            <span>{admin ? 'KILL JOY' : t.tipo === 'loja' ? `${entrou ? 'Venda' : 'Compra'}: ${t.nota}` : entrou ? `Pix de ${nomeDe(t.de)}` : `Pix para ${nomeDe(t.para)}`}<br />
              <small className="muted">{new Date(t.criado_em).toLocaleString('pt-BR')}</small></span>
            <b className={entrou ? 'pos' : 'neg'}>{sinal} {fmt(Math.abs(t.valor))}</b>
          </div>
        );
      })}
    </div>
  );
}
