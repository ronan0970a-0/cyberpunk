import { useRef, useState } from 'react';
import { supabase } from './supabase';

export const BUCKET = 'fichas-fotos';
export const urlFoto = p => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
export const apagarFoto = p => { if (p) supabase.storage.from(BUCKET).remove([p]); };

// Reduz a imagem (máx. 800 px, JPEG) antes de enviar: upload rápido e pouco espaço usado
function reduzir(file, max = 800) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob(b => (b ? ok(b) : erro(new Error('Imagem inválida'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => erro(new Error('Não foi possível ler a imagem'));
    img.src = URL.createObjectURL(file);
  });
}

export default function Foto({ pasta, valor, onChange, rotulo = 'Foto', className = '' }) {
  const ref = useRef();
  const [envio, setEnvio] = useState(false);
  const [erro, setErro] = useState('');

  const escolher = async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setEnvio(true);
    setErro('');
    try {
      const blob = await reduzir(file);
      const path = `${pasta}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      apagarFoto(valor);
      onChange(path);
    } catch (x) {
      setErro(x.message);
    }
    setEnvio(false);
  };

  return (
    <div className={'foto ' + className}>
      <button type="button" className="foto-area" onClick={() => ref.current.click()}
        aria-label={(valor ? 'Trocar ' : 'Adicionar ') + rotulo.toLowerCase()}>
        {valor ? <img src={urlFoto(valor)} alt={rotulo} /> : <span>{envio ? 'Enviando…' : '+ ' + rotulo}</span>}
        {envio && valor && <span className="foto-envio">Enviando…</span>}
      </button>
      {valor && <button type="button" className="foto-x" aria-label={'Remover ' + rotulo.toLowerCase()}
        onClick={() => { apagarFoto(valor); onChange(''); }}>×</button>}
      <input ref={ref} type="file" accept="image/*" hidden onChange={escolher} />
      {erro && <small className="erro">{erro}</small>}
    </div>
  );
}
