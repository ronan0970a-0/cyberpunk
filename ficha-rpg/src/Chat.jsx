import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAmigos, fmt } from './conta.js';
import { Avatar } from './Perfil.jsx';
import { PixForm } from './Pix.jsx';
import { Icones } from './Icones.jsx';
import { chamar } from './ia.js';

const JANELA = 10 * 60 * 1000; // editar/apagar: 10 minutos (o banco confere de novo)

function Conversa({ am, outro, uid, saldo, onSaldo, onVoltar, clove, onLida }) {
  const [msgs, setMsgs] = useState([]);
  const [txt, setTxt] = useState('');
  const [pix, setPix] = useState(false);
  const [erro, setErro] = useState('');
  const [edit, setEdit] = useState(null);
  const [mais, setMais] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const [an, setAn] = useState(false);
  const [pergunta, setPergunta] = useState('');
  const [qtd, setQtd] = useState(200);
  const [res, setRes] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erroAn, setErroAn] = useState('');
  const fim = useRef();
  const rolar = useRef(true);

  const mesclar = novas => setMsgs(a => {
    const m = new Map(a.map(x => [x.id, x]));
    novas.forEach(x => m.set(x.id, x));
    return [...m.values()].sort((x, y) => x.id - y.id);
  });
  const carregar = async () => {
    const { data } = await supabase.from('mensagens').select('*').eq('amizade_id', am.id).order('id', { ascending: false }).limit(100);
    mesclar(data || []);
    return (data || []).length;
  };
  const antigas = async () => {
    if (!msgs.length) return;
    const { data } = await supabase.from('mensagens').select('*').eq('amizade_id', am.id)
      .lt('id', msgs[0].id).order('id', { ascending: false }).limit(100);
    rolar.current = false;
    mesclar(data || []);
    setMais((data || []).length === 100);
  };

  useEffect(() => {
    carregar().then(n => setMais(n === 100));
    const ch = supabase.channel('chat-' + am.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens', filter: `amizade_id=eq.${am.id}` },
        e => { if (e.new && e.new.id) { mesclar([e.new]); if (e.eventType === 'INSERT' && e.new.tipo === 'pix') onSaldo(); } })
      .subscribe();
    const t = setInterval(() => setAgora(Date.now()), 20000); // some o Editar/Apagar quando passa de 10 min
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [am.id]);
  useEffect(() => {
    if (rolar.current && fim.current) fim.current.scrollIntoView({ block: 'end' });
    rolar.current = true;
  }, [msgs.length, pix]);
  useEffect(() => { supabase.rpc('marcar_lida', { p_amizade: am.id }).then(() => onLida()); }, [msgs.length]);

  const dentro = m => m.de === uid && m.tipo === 'texto' && !m.apagada && agora - new Date(m.criado_em).getTime() < JANELA;

  const enviar = async () => {
    const t = txt.trim();
    if (!t) return;
    setErro('');
    const { error } = edit
      ? await supabase.rpc('editar_mensagem', { p_id: edit, p_texto: t })
      : await supabase.rpc('enviar_mensagem', { p_amizade: am.id, p_texto: t });
    if (error) return setErro(error.message);
    setTxt('');
    setEdit(null);
    carregar();
  };
  const apagar = async id => {
    if (!confirm('Apagar esta mensagem para os dois lados?')) return;
    const { error } = await supabase.rpc('apagar_mensagem', { p_id: id });
    if (error) setErro(error.message); else carregar();
  };
  const analisar = async () => {
    setOcupado(true);
    setErroAn('');
    setRes('');
    try {
      const r = await chamar('clove', { texto: pergunta, conversa: { amizade_id: am.id, limite: Number(qtd) || 200 } });
      setRes(r.texto);
    } catch (e) {
      setErroAn(e.message);
    }
    setOcupado(false);
  };

  return (
    <div className="conversa">
      <div className="conv-topo">
        <button type="button" className="ghost mini" onClick={onVoltar} aria-label="Voltar para as conversas">‹</button>
        <Avatar perfil={outro} tam={32} />
        <strong>{outro ? outro.nome : '…'}</strong>
        <span className="muted">@{outro && outro.usuario}</span>
        {clove && <button type="button" className="ghost mini" style={{ marginLeft: 'auto' }} onClick={() => setAn(v => !v)}>Analisar</button>}
      </div>
      {clove && <p className="aviso-conv">Conversas podem ser analisadas pela CLOVE a pedido de um dos participantes.</p>}
      {an && (
        <div className="analise">
          <textarea rows={2} maxLength={1500} placeholder="Pergunte algo (opcional). Ex.: o que ficou combinado? O que ele quis dizer?" value={pergunta} onChange={e => setPergunta(e.target.value)} />
          <label className="f"><span>Ler as últimas (opcional)</span>
            <input type="number" min="10" max="300" inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value)} /></label>
          <div className="row">
            <button type="button" onClick={analisar} disabled={ocupado}>{ocupado ? 'Analisando…' : 'Analisar'}</button>
            <button type="button" className="ghost" onClick={() => setAn(false)}>Fechar</button>
          </div>
          {erroAn && <p className="erro" role="alert">{erroAn}</p>}
          {res && <div className="bolha clove">{res}<br /><small className="muted">Só você vê esta análise. Ela fica no seu histórico com a CLOVE.</small></div>}
        </div>
      )}
      <div className="msgs">
        {mais && <button type="button" className="ghost mini mais" onClick={antigas}>Carregar mensagens anteriores</button>}
        {msgs.map(m => {
          const eu = m.de === uid;
          if (m.tipo === 'pix') return <div key={m.id} className={'bolha pix' + (eu ? ' eu' : '')}>Pix de ◆ {fmt(m.valor)} {eu ? 'enviado' : 'recebido'}</div>;
          if (m.apagada) return <div key={m.id} className={'bolha apagada' + (eu ? ' eu' : '')}>Mensagem apagada</div>;
          return (
            <div key={m.id} className={'bolha' + (eu ? ' eu' : '')}>
              {m.texto}{m.editada && <small className="muted"> (editada)</small>}
              {dentro(m) && (
                <div className="acoes">
                  <button type="button" className="link" onClick={() => { setEdit(m.id); setTxt(m.texto); }}>Editar</button>
                  <button type="button" className="link" onClick={() => apagar(m.id)}>Apagar</button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      {pix && <PixForm amizadeId={am.id} nome={outro && outro.nome} saldo={saldo} onCancelar={() => setPix(false)}
        onFeito={() => { setPix(false); onSaldo(); carregar(); }} />}
      {erro && <p className="erro" role="alert" style={{ margin: '0 14px' }}>{erro}</p>}
      {edit && <div className="editando"><span>Editando mensagem</span>
        <button type="button" className="link" onClick={() => { setEdit(null); setTxt(''); }}>Cancelar</button></div>}
      <div className="envio">
        <button type="button" className="ghost pix-btn" aria-label="Enviar Pix" onClick={() => setPix(true)}>{Icones.pix}</button>
        <input placeholder="Mensagem" maxLength={1000} value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} />
        <button type="button" onClick={enviar}>{edit ? 'Salvar' : 'Enviar'}</button>
      </div>
    </div>
  );
}

export default function Chat({ uid, saldo, onSaldo, clove, avisos = {}, onLida }) {
  const { am, perfis, aliados, recarregar } = useAmigos(uid);
  const [aberta, setAberta] = useState(null);
  const [alvo, setAlvo] = useState('');
  const [msg, setMsg] = useState('');
  const outroDe = a => perfis[a.de === uid ? a.para : a.de];

  const rpc = async (nome, args, ok) => {
    const { error } = await supabase.rpc(nome, args);
    setMsg(error ? error.message : ok || '');
    if (!error) recarregar();
    return !error;
  };
  const pedir = async () => { if (alvo.trim() && await rpc('pedir_amizade', { p_usuario: alvo }, 'Pedido enviado.')) setAlvo(''); };

  const conversa = am.find(a => a.id === aberta && a.status === 'aceita');
  if (conversa) return <Conversa key={conversa.id} am={conversa} outro={outroDe(conversa)} uid={uid} saldo={saldo} onSaldo={onSaldo} clove={clove} onLida={onLida} onVoltar={() => setAberta(null)} />;

  const recebidos = am.filter(a => a.status === 'pendente' && a.para === uid);
  const enviados = am.filter(a => a.status === 'pendente' && a.de === uid);
  const amigos = am.filter(a => a.status === 'aceita');
  const bloqueados = am.filter(a => a.status === 'bloqueada' && a.bloqueado_por === uid);
  const Linha = ({ a, children }) => (
    <div className="am"><Avatar perfil={outroDe(a)} /><div className="grow"><strong>{outroDe(a) ? outroDe(a).nome : '…'}</strong><br />
      <span className="muted">@{outroDe(a) && outroDe(a).usuario}</span></div>{children}</div>
  );

  return (
    <div className="stack">
      <div className="row">
        <input style={{ flex: 1 }} placeholder="@usuario do amigo" autoCapitalize="none" value={alvo} onChange={e => setAlvo(e.target.value)} onKeyDown={e => e.key === 'Enter' && pedir()} />
        <button type="button" onClick={pedir}>Adicionar</button>
      </div>
      {msg && <p className="muted" role="status">{msg}</p>}

      {recebidos.length > 0 && <><h2>Pedidos recebidos</h2>
        {recebidos.map(a => <Linha key={a.id} a={a}>
          <button type="button" className="mini" onClick={() => rpc('responder_amizade', { p_id: a.id, p_aceitar: true })}>Aceitar</button>
          <button type="button" className="danger mini" onClick={() => rpc('responder_amizade', { p_id: a.id, p_aceitar: false })}>Recusar</button>
        </Linha>)}</>}

      <h2>Amigos</h2>
      {!amigos.length && <p className="muted">Nenhum amigo ainda. Adicione alguém pelo @usuario.</p>}
      {amigos.map(a => {
        const oid = a.de === uid ? a.para : a.de;
        const ali = aliados.has(oid);
        return (
        <div className="am" key={a.id}>
          <button type="button" className="ghost am-abrir" onClick={() => setAberta(a.id)}>
            <Avatar perfil={outroDe(a)} /><span><strong>{outroDe(a) ? outroDe(a).nome : '…'}</strong><br />
              <span className="muted">@{outroDe(a) && outroDe(a).usuario}</span></span>
            {avisos[a.id] > 0 && <i className="selo st">{avisos[a.id]}</i>}
          </button>
          <button type="button" className={'mini' + (ali ? '' : ' ghost')} aria-pressed={ali}
            title="Aliados aparecem no painel Equipe"
            onClick={() => rpc('marcar_aliado', { p_alvo: oid, p_marcar: !ali })}>{ali ? '★ Aliado' : '☆ Aliado'}</button>
          <button type="button" className="ghost mini"
            onClick={() => confirm('Bloquear? A conversa some para os dois e a pessoa não poderá te adicionar de novo.') && rpc('bloquear_usuario', { p_id: a.id })}>Bloquear</button>
          <button type="button" className="danger mini" aria-label="Remover amigo"
            onClick={() => confirm('Remover este amigo? A conversa será apagada.') && rpc('remover_amizade', { p_id: a.id })}>×</button>
        </div>
        );
      })}

      {enviados.length > 0 && <><h2>Pedidos enviados</h2>
        {enviados.map(a => <Linha key={a.id} a={a}>
          <button type="button" className="ghost mini" onClick={() => rpc('remover_amizade', { p_id: a.id })}>Cancelar</button>
        </Linha>)}</>}

      {bloqueados.length > 0 && <><h2>Bloqueados</h2>
        {bloqueados.map(a => <Linha key={a.id} a={a}>
          <button type="button" className="ghost mini"
            onClick={() => confirm('Desbloquear? A conversa antiga continua apagada.') && rpc('desbloquear_usuario', { p_id: a.id })}>Desbloquear</button>
        </Linha>)}</>}
    </div>
  );
}
