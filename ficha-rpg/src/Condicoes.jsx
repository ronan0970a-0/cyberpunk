import { useState } from 'react';

const PRESETS = ['Ferido', 'Sangrando', 'Atordoado', 'Envenenado', 'Em chamas', 'Exausto', 'Hackeado', 'Ciberpsicose'];

export default function Condicoes({ lista, onChange }) {
  const [nome, setNome] = useState('');
  const add = n => {
    const t = n.trim();
    if (t) onChange(l => [...(Array.isArray(l) ? l : []), { id: crypto.randomUUID(), nome: t, nota: '' }]);
    setNome('');
  };
  const nota = (id, v) => onChange(l => l.map(c => (c.id === id ? { ...c, nota: v } : c)));

  return (
    <section className="card">
      <h2>Condições</h2>
      {!lista.length && <p className="muted">Nenhuma condição ativa.</p>}
      <div className="chips">
        {lista.map(c => (
          <div className="chip" key={c.id}>
            <strong>{c.nome}</strong>
            <input placeholder="Nota (ex.: 3 turnos)" aria-label={`Nota de ${c.nome}`} maxLength={60} value={c.nota} onChange={e => nota(c.id, e.target.value)} />
            <button type="button" className="danger mini" aria-label={`Remover ${c.nome}`} onClick={() => onChange(l => l.filter(x => x.id !== c.id))}>×</button>
          </div>
        ))}
      </div>
      <div className="row presets" style={{ margin: '12px 0' }}>
        {PRESETS.map(p => <button type="button" key={p} className="ghost mini" onClick={() => add(p)}>+ {p}</button>)}
      </div>
      <div className="row addcond">
        <input style={{ flex: 1 }} placeholder="Outra condição" maxLength={30} value={nome} onChange={e => setNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && add(nome)} />
        <button type="button" onClick={() => add(nome)}>Adicionar</button>
      </div>
    </section>
  );
}
