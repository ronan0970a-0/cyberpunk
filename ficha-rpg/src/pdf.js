import { urlFoto } from './Foto.jsx';
import { maximos, iniciativa, defesa, totalGrupo, humanidadeEfetiva, carga, capacidade } from './calc.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Abre uma folha limpa (clara, própria para imprimir) e chama a impressão: escolha "Salvar como PDF".
export function exportarPDF(d, grupos) {
  const mx = maximos(d);
  const img = (p, c) => (p ? `<img class="${c}" src="${esc(urlFoto(p))}" alt="">` : '');
  const bloco = (t, itens, extra) => `<section><h2>${t}</h2>${itens && itens.length
    ? itens.map(i => `<div class="it">${img(i.foto, 'mini')}<div><b>${esc(i.nome)}</b> ${extra ? `<small>${esc(extra(i))}</small>` : ''}<p>${esc(i.descricao)}</p></div></div>`).join('')
    : '<p class="vz">Nada registrado.</p>'}</section>`;
  const texto = (t, v) => (v ? `<section><h2>${t}</h2><p class="pre">${esc(v)}</p></section>` : '');
  const conds = Array.isArray(d.condicoes) ? d.condicoes : [];

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.nome)} - Ficha</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}
body{font:12px/1.45 system-ui,Segoe UI,sans-serif;color:#111;margin:0}
h1{margin:0;font-size:26px}h2{font-size:14px;margin:16px 0 6px;padding-left:8px;border-left:4px solid #0a8a99}h3{margin:0 0 4px;font-size:12px;display:flex;justify-content:space-between}
.top{display:flex;gap:14px;align-items:flex-start}.ret{width:110px;height:140px;object-fit:cover;border:2px solid #0a8a99}
.sub{color:#555;margin:2px 0 8px}.vit{display:flex;gap:10px;flex-wrap:wrap}.vit div,.der div{border:1px solid #bbb;padding:6px 10px;min-width:110px}
.vit b,.der b{display:block;font-size:17px}.grupos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.g{border:1px solid #bbb;padding:6px 8px;break-inside:avoid}.a{display:flex;justify-content:space-between;border-top:1px solid #eee;padding:1px 0}
.it{display:flex;gap:8px;margin:6px 0;break-inside:avoid}.mini{width:48px;height:48px;object-fit:cover;border:1px solid #999;flex:none}
p{margin:2px 0}.pre{white-space:pre-wrap}.vz{color:#888}small{color:#555}.cd{display:inline-block;border:1px solid #c0314e;color:#c0314e;padding:1px 8px;margin:0 4px 4px 0}
</style></head><body>
<div class="top">${img(d.foto, 'ret')}<div><h1>${esc(d.nome)}</h1>
<div class="sub">${[d.sexo, d.idade ? d.idade + ' anos' : '', d.peso, d.altura].filter(Boolean).map(esc).join(' · ')}</div>
<div class="vit"><div><b>${esc(d.resistencia)}%</b>Resistência</div><div><b>${esc(d.hp)} / ${mx.hp}</b>HP</div><div><b>${esc(d.san)} / ${mx.san}</b>Sanidade</div></div></div></div>
<div class="der" style="display:flex;gap:10px;margin-top:10px"><div><b>${iniciativa(d)}</b>Iniciativa</div><div><b>${defesa(d)}</b>Defesa</div>
<div><b>${humanidadeEfetiva(d)}</b>Humanidade efetiva</div><div><b>${carga(d)} / ${capacidade(d)} kg</b>Carga</div></div>
${conds.length ? `<section><h2>Condições</h2>${conds.map(c => `<span class="cd">${esc(c.nome)}${c.nota ? ' (' + esc(c.nota) + ')' : ''}</span>`).join('')}</section>` : ''}
<section><h2>Atributos</h2><div class="grupos">${grupos.map(([g, itens]) => `<div class="g"><h3>${g} <span>${totalGrupo(d, g, itens)}</span></h3>${itens.map(i => `<div class="a"><span>${i}</span><b>${esc(d[`${g}.${i}`] ?? 0)}</b></div>`).join('')}</div>`).join('')}</div></section>
${bloco('Implantes', d.implantes, i => `custo de humanidade ${i.humanidade ?? 0}`)}
${bloco('Equipamento', d.equipamento, i => `${i.qtd ?? 1} un. · ${i.peso ?? 0} kg`)}
${bloco('Vantagem', d.vantagem)}${bloco('Desvantagem', d.desvantagem)}
${texto('Ganha', d.ganha)}${texto('Background', d.background)}${texto('Lore', d.lore)}
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return alert('O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.');
  w.document.write(html);
  w.document.close();
  let t = 0;
  const espera = setInterval(() => {
    t += 1;
    if ([...w.document.images].every(i => i.complete) || t > 32) { clearInterval(espera); w.focus(); w.print(); }
  }, 250);
}
