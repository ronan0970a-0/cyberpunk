import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export default function Historico({ fichaId, onFechar, onRestaurar }) {
  const [v, setV] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    supabase.from('fichas_versoes').select('id,nome,criado_em').eq('ficha_id', fichaId).order('id', { ascending: false }).limit(30)
      .then(({ data, error }) => (error ? setErro(error.message) : setV(data)));
  }, [fichaId]);

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Histórico de versões" onClick={e => e.stopPropagation()}>
        <div className="card-h"><h2>Histórico de versões</h2><button type="button" className="ghost mini" onClick={onFechar}>Fechar</button></div>
        <p className="muted">Uma versão é guardada antes de cada sessão de edição (no máximo uma a cada 10 minutos). Ao restaurar, o estado atual também fica salvo aqui.</p>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {!v && !erro && <p className="muted">Carregando…</p>}
        {v && !v.length && <p className="muted">Ainda não há versões anteriores.</p>}
        {v && v.map(x => (
          <div className="am" key={x.id}>
            <div className="grow"><strong>{x.nome}</strong><br /><span className="muted">{new Date(x.criado_em).toLocaleString('pt-BR')}</span></div>
            <button type="button" className="mini" onClick={() => confirm('Restaurar esta versão? As edições não salvas serão guardadas no histórico.') && onRestaurar(x.id)}>Restaurar</button>
          </div>
        ))}
      </div>
    </div>
  );
}
