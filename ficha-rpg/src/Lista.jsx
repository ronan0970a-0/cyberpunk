import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PADRAO } from './Ficha.jsx';

export default function Lista({ onAbrir, uid }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    supabase.from('fichas').select('id,nome,updated_at').eq('user_id', uid).order('updated_at', { ascending: false })
      .then(({ data, error }) => (error ? setErro(error.message) : setItens(data)));
  }, []);

  const nova = async () => {
    const nome = 'Novo personagem';
    const { data, error } = await supabase.from('fichas')
      .insert({ nome, data: { ...PADRAO, nome } }).select('id').single();
    if (error) return setErro(error.message);
    onAbrir(data.id);
  };

  return (
    <main>
      <header className="top">
        <h1>Minhas fichas</h1>
        <div className="row">
          <button onClick={nova}>Nova ficha</button>
          <button className="ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </header>
      {erro && <p className="muted">Erro: {erro}</p>}
      {!erro && !itens && <p className="muted">Carregando…</p>}
      {itens && !itens.length && <p className="muted">Você ainda não tem fichas. Toque em "Nova ficha" para criar a primeira.</p>}
      {itens && itens.map(r => (
        <button key={r.id} className="item" onClick={() => onAbrir(r.id)}>
          <strong>{r.nome}</strong>
          <span className="muted">{new Date(r.updated_at).toLocaleString('pt-BR')}</span>
        </button>
      ))}
    </main>
  );
}
