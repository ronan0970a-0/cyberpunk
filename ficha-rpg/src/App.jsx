import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import Login from './Login.jsx';
import Lista from './Lista.jsx';
import Ficha from './Ficha.jsx';
import Celular from './Celular.jsx';

export default function App() {
  const [sessao, setSessao] = useState(undefined); // undefined = carregando
  const [id, setIdState] = useState(() => location.hash.slice(1) || null);

  // O id da ficha fica no endereço (#id), então recarregar a página mantém a ficha aberta
  const setId = v => {
    history.replaceState(null, '', v ? '#' + v : location.pathname);
    setIdState(v);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSessao(s);
      if (!s) setId(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (sessao === undefined) return <main className="muted">Carregando…</main>;
  if (!sessao) return <Login />;
  return (
    <>
      {id ? <Ficha id={id} uid={sessao.user.id} onVoltar={() => setId(null)} /> : <Lista onAbrir={setId} uid={sessao.user.id} />}
      <Celular user={sessao.user} onAbrirFicha={setId} />
    </>
  );
}
