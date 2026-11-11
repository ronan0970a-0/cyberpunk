import { supabase } from './supabase';

const PUB = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const chave = s => {
  const r = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(r, c => c.charCodeAt(0));
};

export const pushSuportado = () =>
  !!PUB && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function pushAtivo() {
  if (!pushSuportado() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  return !!(await reg.pushManager.getSubscription());
}

export async function ativarPush(uid) {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do navegador.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave(PUB) }));
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subs')
    .upsert({ user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
}

export async function desativarPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subs').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
