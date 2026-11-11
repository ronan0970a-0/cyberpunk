// Fórmulas da ficha. Edite aqui para ajustar às regras da sua mesa.
const n = v => Number(v) || 0;
export const attr = (d, g, i) => n(d[`${g}.${i}`]);

// Vida e Sanidade máximas são sempre as que você digita na ficha: os atributos NÃO somam pontos nelas.
export const maximos = d => ({ hp: n(d.hpMax), san: n(d.sanMax) });

export const iniciativa = d => attr(d, 'Físico', 'Agilidade') + attr(d, 'Mental', 'Destreza');
export const defesa = d => attr(d, 'Combate', 'Esquiva') + attr(d, 'Combate', 'Bloqueio');
export const totalGrupo = (d, g, itens) => itens.reduce((s, i) => s + attr(d, g, i), 0);

// Cada implante tem um custo de humanidade que reduz a Humanidade do Techno
export const humanidadeEfetiva = d =>
  attr(d, 'Techno', 'Humanidade') - (d.implantes || []).reduce((s, x) => s + n(x.humanidade), 0);

// Carga = soma de peso × quantidade; capacidade = 10 + 3 × Força
export const carga = d => (d.equipamento || []).reduce((s, x) => s + n(x.peso) * (x.qtd === '' ? 0 : n(x.qtd)), 0);
export const capacidade = d => 10 + attr(d, 'Físico', 'Força') * 3;
