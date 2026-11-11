import Foto, { apagarFoto } from './Foto.jsx';
import BotaoIA from './BotaoIA.jsx';

// Lista de itens com nome, descrição, campos extras e foto opcional.
// onChange recebe uma função (lista atual -> nova lista) para não perder edições durante o upload.
export default function ListaItens({ titulo, itens, onChange, pasta, foto, extras = [], vazio, ia, larga }) {
  const mudar = (id, k, v) => onChange(l => l.map(i => (i.id === id ? { ...i, [k]: v } : i)));
  const novo = () => onChange(l => [...l, {
    id: crypto.randomUUID(), nome: '', descricao: '',
    ...Object.fromEntries(extras.map(e => [e.k, e.padrao ?? '']))
  }]);
  const remover = i => {
    if (!confirm(`Remover "${i.nome || 'item sem nome'}"?`)) return;
    apagarFoto(i.foto);
    onChange(l => l.filter(x => x.id !== i.id));
  };

  return (
    <section className="card">
      <div className="card-h"><h2>{titulo}</h2><button type="button" onClick={novo}>Adicionar</button></div>
      {!itens.length && <p className="muted">{vazio}</p>}
      <div className={'itens' + (larga ? ' larga' : '')}>
        {itens.map(i => (
          <article className="item-card" key={i.id}>
            {foto && <Foto pasta={pasta} valor={i.foto} onChange={p => mudar(i.id, 'foto', p)} />}
            <div className="item-campos">
              <input placeholder="Nome" aria-label="Nome" value={i.nome} onChange={e => mudar(i.id, 'nome', e.target.value)} />
              {extras.length > 0 && (
                <div className="extras">
                  {extras.map(x => (
                    <label className="f" key={x.k}><span>{x.rot}</span>
                      <input type="number" value={i[x.k] ?? ''}
                        onChange={e => mudar(i.id, x.k, e.target.value === '' ? '' : Number(e.target.value))} />
                    </label>
                  ))}
                </div>
              )}
              <textarea rows={larga ? 5 : 2} placeholder="Descrição" aria-label="Descrição" value={i.descricao} onChange={e => mudar(i.id, 'descricao', e.target.value)} />
              {ia && (
                <BotaoIA rotulo="Descrever com IA"
                  corpo={() => ({ tarefa: 'item', tipo: ia.tipo, nome: i.nome, texto: i.descricao, contexto: ia.contexto() })}
                  onTexto={t => mudar(i.id, 'descricao', t)} />
              )}
            </div>
            <button type="button" className="danger mini" aria-label="Remover item" onClick={() => remover(i)}>×</button>
          </article>
        ))}
      </div>
    </section>
  );
}
