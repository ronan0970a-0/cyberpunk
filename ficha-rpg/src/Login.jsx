import { useState } from 'react';
import { supabase } from './supabase';

// Mensagens do Supabase em português, com a dica do que fazer
const traduzir = e => {
  const m = (e.message || '').toLowerCase();
  if (e.status === 429 || m.includes('rate limit'))
    return 'Limite de envio de e-mails do Supabase atingido. Quem administra o site precisa desativar "Confirm email" ou configurar um SMTP próprio no painel do Supabase.';
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('not confirmed')) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (m.includes('already registered')) return 'Este e-mail já tem conta. Toque em "Entrar".';
  if (m.includes('password')) return 'A senha precisa ter pelo menos 6 caracteres.';
  return e.message;
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState('');

  const entrar = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setMsg(traduzir(error));
  };
  const criar = async () => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
    if (error) return setMsg(traduzir(error));
    if (!data.session) setMsg('Conta criada. Confirme o e-mail que enviamos e depois entre.');
  };

  return (
    <main className="auth">
      <h1>Ficha de RPG</h1>
      <p className="muted">Entre para acessar as suas fichas.</p>
      <input type="email" placeholder="E-mail" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Senha (mínimo 6 caracteres)" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
      <div className="row">
        <button onClick={entrar}>Entrar</button>
        <button className="ghost" onClick={criar}>Criar conta</button>
      </div>
      <p className="muted" role="status">{msg}</p>
    </main>
  );
}
