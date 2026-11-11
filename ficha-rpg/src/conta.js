import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export const fmt = n => Number(n || 0).toLocaleString('pt-BR');

// Perfil, saldo e permissões da conta logada (saldo atualiza em tempo real)
export function useConta(uid) {
  const [c, setC] = useState({ carregando: true });
  const [avisos, setAvisos] = useState({ porConversa: {}, pedidos: 0 });
  const carregar = useCallback(async () => {
    const [p, w, k] = await Promise.all([
      supabase.from('perfis').select('*').eq('user_id', uid).maybeSingle(),
      supabase.from('carteiras').select('saldo').eq('user_id', uid).maybeSingle(),
      supabase.from('controle').select('is_admin,clove_liberada,pode_vender,is_mestre').eq('user_id', uid).maybeSingle()
    ]);
    setC({ carregando: false, perfil: p.data, saldo: w.data ? w.data.saldo : 0, admin: !!(k.data && k.data.is_admin), clove: !!(k.data && k.data.clove_liberada), vendedor: !!(k.data && k.data.pode_vender), mestre: !!(k.data && k.data.is_mestre) });
  }, [uid]);
  // Mensagens não lidas por conversa e pedidos de amizade pendentes
  const carregarAvisos = useCallback(async () => {
    const [nl, ped] = await Promise.all([
      supabase.rpc('nao_lidas'),
      supabase.from('amizades').select('id', { count: 'exact', head: true }).eq('status', 'pendente').eq('para', uid)
    ]);
    setAvisos({ porConversa: Object.fromEntries((nl.data || []).map(x => [x.amizade_id, x.qtd])), pedidos: ped.count || 0 });
  }, [uid]);
  useEffect(() => {
    carregar();
    carregarAvisos();
    const ch = supabase.channel('conta-' + uid)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'carteiras', filter: `user_id=eq.${uid}` }, carregar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, carregarAvisos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'amizades' }, carregarAvisos)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, carregar, carregarAvisos]);
  return { ...c, avisos, recarregar: carregar, recarregarAvisos: carregarAvisos };
}

// Amizades, aliados marcados e perfis dos amigos, atualizados em tempo real
export function useAmigos(uid) {
  const [dados, setDados] = useState({ am: [], perfis: {}, aliados: new Set() });
  const canal = useRef('amigos-' + Math.random().toString(36).slice(2));
  const carregar = useCallback(async () => {
    const { data: am } = await supabase.from('amizades').select('*').order('criado_em', { ascending: false });
    const ids = [...new Set((am || []).flatMap(a => [a.de, a.para]))].filter(i => i !== uid);
    const { data: ps } = ids.length
      ? await supabase.from('perfis').select('user_id,usuario,nome,avatar,cor').in('user_id', ids)
      : { data: [] };
    const { data: al } = await supabase.from('aliados').select('aliado_id');
    setDados({ am: am || [], perfis: Object.fromEntries((ps || []).map(p => [p.user_id, p])), aliados: new Set((al || []).map(x => x.aliado_id)) });
  }, [uid]);
  useEffect(() => {
    carregar();
    const ch = supabase.channel(canal.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'amizades' }, carregar)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [carregar]);
  return { ...dados, recarregar: carregar };
}
