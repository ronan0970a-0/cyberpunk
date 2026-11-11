import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { chamar } from './ia.js';
import { Icones } from './Icones.jsx';

export default function Clove({ uid, perfil }) {
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const fim = useRef();

  useEffect(() => {
    supabase.from('clove_msgs').select('id,papel,texto').eq('user_id', uid).order('id', { ascending: false }).limit(50)
      .then(({ data }) => setMsgs((data || []).reverse()));
  }, [uid]);
  useEffect(() => { if (fim.current) fim.current.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);

  const enviar = async () => {
    const t = txt.trim();
    if (!t || busy) return;
    setTxt('');
    setErro('');
    setBusy(true);
    setMsgs(m => [...m, { id: 'u' + Date.now(), papel: 'user', texto: t }]);
    try {
      const r = await chamar('clove', { texto: t });
      setMsgs(m => [...m, { id: 'c' + Date.now(), papel: 'clove', texto: r.texto }]);
    } catch (e) {
      setErro(e.message);
    }
    setBusy(false);
  };
  const limpar = async () => {
    if (!confirm('Apagar toda a conversa com a CLOVE?')) return;
    await supabase.from('clove_msgs').delete().eq('user_id', uid);
    setMsgs([]);
  };

  return (
    <div className="conversa">
      <div className="conv-topo">
        <span className="clove-ico">{Icones.clove}</span>
        <strong>CLOVE</strong>
        <button type="button" className="ghost mini" style={{ marginLeft: 'auto' }} onClick={limpar}>Limpar</button>
      </div>
      <div className="msgs">
        <div className="bolha clove">Seja bem-vindo, {perfil.nome}.</div>
        {msgs.map(m => <div key={m.id} className={'bolha' + (m.papel === 'user' ? ' eu' : ' clove')}>{m.texto}</div>)}
        {busy && <div className="digitando">CLOVE está escrevendo…</div>}
        <div ref={fim} />
      </div>
      {erro && <p className="erro" role="alert" style={{ margin: '0 14px' }}>{erro}</p>}
      <div className="envio">
        <input placeholder="Fale com a CLOVE" maxLength={1500} value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} />
        <button type="button" onClick={enviar} disabled={busy}>Enviar</button>
      </div>
    </div>
  );
}
