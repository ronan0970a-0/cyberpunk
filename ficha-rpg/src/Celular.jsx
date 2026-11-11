import { useEffect, useState } from 'react';
import { useConta, fmt } from './conta.js';
import { Icones } from './Icones.jsx';
import Perfil from './Perfil.jsx';
import Chat from './Chat.jsx';
import PixApp from './Pix.jsx';
import Clove from './Clove.jsx';
import Admin from './Admin.jsx';
import Loja from './Loja.jsx';
import Equipe from './Equipe.jsx';
import Mestre from './Mestre.jsx';
import { urlFoto } from './Foto.jsx';

const TITULOS = { perfil: 'Perfil', chat: 'Bate-papo', pix: 'Pix', equipe: 'Equipe', mestre: 'Mestre', loja: 'Mercado Negro', clove: 'CLOVE', admin: 'KILL JOY' };

export default function Celular({ user, onAbrirFicha }) {
  const conta = useConta(user.id);
  const [aberto, setAberto] = useState(false);
  const [app, setApp] = useState('home');

  useEffect(() => {
    if (!aberto) return;
    const h = e => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aberto]);

  const p = conta.perfil;
  const total = Object.values(conta.avisos.porConversa).reduce((a, b) => a + b, 0) + conta.avisos.pedidos;
  const atual = !p ? 'perfil' : app; // sem @usuario, só a tela de criar perfil
  const apps = ['perfil', 'chat', 'equipe', 'pix', 'loja', ...(conta.clove ? ['clove'] : []), ...(conta.mestre ? ['mestre'] : []), ...(conta.admin ? ['admin'] : [])];

  let conteudo = null;
  if (atual === 'perfil') conteudo = <Perfil user={user} conta={conta} />;
  if (atual === 'chat') conteudo = <Chat uid={user.id} saldo={conta.saldo} onSaldo={conta.recarregar} clove={conta.clove} avisos={conta.avisos.porConversa} onLida={conta.recarregarAvisos} />;
  if (atual === 'pix') conteudo = <PixApp uid={user.id} saldo={conta.saldo} onSaldo={conta.recarregar} />;
  if (atual === 'equipe') conteudo = <Equipe uid={user.id} />;
  if (atual === 'loja') conteudo = <Loja uid={user.id} saldo={conta.saldo} vendedor={conta.vendedor} onSaldo={conta.recarregar} />;
  if (atual === 'clove') conteudo = <Clove uid={user.id} perfil={p} />;
  if (atual === 'admin') conteudo = <Admin />;
  if (atual === 'mestre') conteudo = <Mestre uid={user.id} onAbrir={fid => { setAberto(false); onAbrirFicha(fid); }} />;

  return (
    <>
      <button type="button" className="cel-fab" onClick={() => setAberto(true)} aria-label={total ? `Abrir celular, ${total} avisos` : 'Abrir celular'}>{Icones.celular}{total > 0 && <i className="selo">{total > 99 ? '99+' : total}</i>}</button>
      {aberto && (
        <div className="cel-fundo" onClick={() => setAberto(false)}>
          <div className={'cel pp-' + ((p && p.papel) || 'neon')} role="dialog" aria-modal="true" aria-label="Celular"
            style={{ '--dest': (p && p.cor) || '#00e5ff', ...(p && p.papel_foto ? { background: `linear-gradient(rgba(7,7,12,.6),rgba(7,7,12,.85)), url(${urlFoto(p.papel_foto)}) center/cover` } : {}) }} onClick={e => e.stopPropagation()}>
            <div className="cel-barra">
              <span className="muted">{conta.carregando ? '…' : `DINHEIRO ◆ ${fmt(conta.saldo)}`}</span>
              <button type="button" className="ghost mini" onClick={() => setAberto(false)}>Fechar</button>
            </div>
            {conta.carregando ? <p className="muted" style={{ padding: 14 }}>Carregando…</p> : atual === 'home' ? (
              <div className="home">
                <div className="widget"><span className="muted">Olá, {p.nome}</span><b>◆ {fmt(conta.saldo)}</b><span className="muted">DINHEIRO</span></div>
                <div className="apps">
                  {apps.map(k => (
                    <button type="button" key={k} className={'app' + (k === 'clove' ? ' clove' : '')} onClick={() => setApp(k)}>
                      {Icones[k]}<span>{TITULOS[k]}</span>{k === 'chat' && total > 0 && <i className="selo">{total > 99 ? '99+' : total}</i>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="cel-topo">
                  {p && <button type="button" className="ghost mini" onClick={() => setApp('home')}>Início</button>}
                  <strong>{TITULOS[atual]}</strong>
                </div>
                <div className="cel-conteudo">{conteudo}</div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
