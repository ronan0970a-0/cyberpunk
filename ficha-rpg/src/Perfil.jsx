import { useState } from 'react';
import { supabase } from './supabase';
import Foto, { urlFoto, apagarFoto } from './Foto.jsx';
import { fmt } from './conta.js';
import Notificacoes from './Notificacoes.jsx';

const PAPEIS = [['neon', 'Neon'], ['noite', 'Noite'], ['grade', 'Grade'], ['sangue', 'Sangue'], ['aurora', 'Aurora'], ['chuva', 'Chuva']];

export function Avatar({ perfil, tam = 40 }) {
  const cor = (perfil && perfil.cor) || '#00e5ff';
  if (perfil && perfil.avatar) return <img className="avatar" src={urlFoto(perfil.avatar)} alt="" style={{ width: tam, height: tam, borderColor: cor }} />;
  return <span className="avatar" style={{ width: tam, height: tam, borderColor: cor, color: cor, fontSize: tam * 0.45 }}>{((perfil && perfil.nome) || '?')[0].toUpperCase()}</span>;
}

export default function Perfil({ user, conta }) {
  const p = conta.perfil;
  const [f, setF] = useState({ nome: (p && p.nome) || '', bio: (p && p.bio) || '', cor: (p && p.cor) || '#00e5ff' });
  const [usuario, setUsuario] = useState('');
  const [msg, setMsg] = useState('');
  const mudar = (k, v) => setF(x => ({ ...x, [k]: v }));

  if (!p) {
    const criar = async () => {
      const { error } = await supabase.rpc('criar_perfil', { p_usuario: usuario, p_nome: f.nome });
      if (error) return setMsg(error.message);
      conta.recarregar();
    };
    return (
      <div className="stack">
        <h2>Bem-vindo</h2>
        <p className="muted">Escolha o seu @usuario. Ele é único e os seus amigos usam para te encontrar. Depois não dá para trocar.</p>
        <label className="f"><span>@usuario</span>
          <input value={usuario} maxLength={20} autoCapitalize="none" autoCorrect="off" onChange={e => setUsuario(e.target.value)} /></label>
        <label className="f"><span>Nome de exibição</span>
          <input value={f.nome} maxLength={30} onChange={e => mudar('nome', e.target.value)} /></label>
        <button type="button" onClick={criar}>Criar perfil</button>
        {msg && <p className="erro" role="alert">{msg}</p>}
      </div>
    );
  }

  const salvar = async patch => {
    const { error } = await supabase.from('perfis').update(patch).eq('user_id', user.id);
    setMsg(error ? error.message : 'Salvo');
    if (!error) conta.recarregar();
  };

  return (
    <div className="stack">
      <div className="row">
        <Foto pasta={`${user.id}/perfil`} valor={p.avatar} rotulo="Foto de perfil" onChange={path => salvar({ avatar: path || null })} />
        <div><strong>@{p.usuario}</strong><br /><span className="muted">DINHEIRO ◆ {fmt(conta.saldo)}</span></div>
      </div>
      <label className="f"><span>Nome de exibição</span>
        <input value={f.nome} maxLength={30} onChange={e => mudar('nome', e.target.value)} /></label>
      <label className="f"><span>Bio</span>
        <textarea rows={3} maxLength={200} value={f.bio} onChange={e => mudar('bio', e.target.value)} /></label>
      <label className="f"><span>Cor do seu celular</span>
        <input type="color" value={f.cor} onChange={e => mudar('cor', e.target.value)} /></label>
      <Notificacoes uid={user.id} />
      <div className="f"><span>Papel de parede</span>
        <div className="row">
          {PAPEIS.map(([k, r]) => {
            const sel = p.papel === k && !p.papel_foto;
            return <button type="button" key={k} className={'papel pp-' + k + (sel ? ' sel' : '')} aria-pressed={sel}
              onClick={() => { apagarFoto(p.papel_foto); salvar({ papel: k, papel_foto: null }); }}>{r}</button>;
          })}
        </div>
        <Foto pasta={`${user.id}/papel`} valor={p.papel_foto} rotulo="Minha imagem" onChange={path => salvar({ papel_foto: path || null })} />
      </div>
      <button type="button" onClick={() => salvar({ nome: f.nome.trim() || p.usuario, bio: f.bio, cor: f.cor })}>Salvar perfil</button>
      {msg && <p className="muted" role="status">{msg}</p>}
      <button type="button" className="ghost" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
    </div>
  );
}
