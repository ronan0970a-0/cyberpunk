import { useEffect, useState } from 'react';
import { ativarPush, desativarPush, pushAtivo, pushSuportado } from './push.js';

export default function Notificacoes({ uid }) {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushAtivo().then(setOn); }, []);

  if (!pushSuportado()) {
    return <p className="muted">Notificações com o app fechado não estão disponíveis neste aparelho. No iPhone, abra o site no Safari, toque em Compartilhar e em "Adicionar à Tela de Início", e abra por lá.</p>;
  }
  const alternar = async () => {
    setBusy(true);
    setMsg('');
    try {
      if (on) { await desativarPush(); setOn(false); } else { await ativarPush(uid); setOn(true); }
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };
  return (
    <div className="f">
      <span>Notificações</span>
      <button type="button" className={on ? 'ghost' : ''} onClick={alternar} disabled={busy}>{on ? 'Desativar neste aparelho' : 'Ativar neste aparelho'}</button>
      <p className="muted">Avisa de mensagens, Pix e pedidos de amizade, sem mostrar o conteúdo da mensagem.</p>
      {msg && <p className="erro" role="alert">{msg}</p>}
    </div>
  );
}
