import { useState } from 'react';
import { pedirIA } from './ia.js';

// corpo: função que devolve o pedido atual; onTexto: recebe o texto gerado
export default function BotaoIA({ rotulo = 'Gerar com IA', corpo, onTexto }) {
  const [aberto, setAberto] = useState(false);
  const [instr, setInstr] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const gerar = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await pedirIA({ ...corpo(), instrucao: instr });
      onTexto(r.texto);
      setMsg(`Pronto. Usos da IA hoje: ${r.usos}/${r.limite}`);
      setAberto(false);
      setInstr('');
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="ia">
      {aberto ? (
        <div className="ia-painel">
          <input placeholder="Orientação (opcional): tom, tema, o que incluir…" maxLength={500} value={instr}
            onChange={e => setInstr(e.target.value)} onKeyDown={e => e.key === 'Enter' && !busy && gerar()} />
          <button type="button" onClick={gerar} disabled={busy}>{busy ? 'Gerando…' : 'Gerar'}</button>
          <button type="button" className="ghost" onClick={() => setAberto(false)} disabled={busy}>Cancelar</button>
        </div>
      ) : (
        <button type="button" className="ia-btn mini" onClick={() => setAberto(true)}>{rotulo}</button>
      )}
      {msg && <span className="ia-msg" role="status">{msg}</span>}
    </div>
  );
}
