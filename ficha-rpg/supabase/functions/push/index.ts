// Edge Function "push": chamada por Database Webhooks (INSERT em mensagens e em amizades).
// Envia uma notificação ao destinatário, sem o conteúdo da mensagem. Usa a service role só aqui.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const ok = () => new Response('ok');

Deno.serve(async req => {
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('PUSH_WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });
  try {
    const { type, table, record } = await req.json();
    if (type !== 'INSERT' || !record) return ok();

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let destino = '', remetente = '', corpo = '', tag = '';

    if (table === 'mensagens') {
      if (record.apagada) return ok();
      const { data: am } = await sb.from('amizades').select('de,para,status').eq('id', record.amizade_id).maybeSingle();
      if (!am || am.status !== 'aceita') return ok();
      destino = am.de === record.de ? am.para : am.de;
      remetente = record.de;
      corpo = record.tipo === 'pix' ? `Enviou um Pix de ◆ ${record.valor}` : 'Enviou uma mensagem';
      tag = 'conv-' + record.amizade_id;
    } else if (table === 'amizades') {
      if (record.status !== 'pendente') return ok();
      destino = record.para;
      remetente = record.de;
      corpo = 'Quer ser seu amigo';
      tag = 'pedido-' + record.id;
    } else {
      return ok();
    }

    const { data: p } = await sb.from('perfis').select('nome').eq('user_id', remetente).maybeSingle();
    const { data: subs } = await sb.from('push_subs').select('id,endpoint,p256dh,auth').eq('user_id', destino);
    if (!subs?.length) return ok();

    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
      Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
    const payload = JSON.stringify({ titulo: p?.nome ?? 'Aliado', corpo, tag, url: '/' });

    await Promise.all(subs.map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e: any) {
        console.error('push', e?.statusCode, e?.body);
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subs').delete().eq('id', s.id); // aparelho não existe mais
      }
    }));
    return ok();
  } catch (e) {
    console.error(e);
    return new Response('erro', { status: 500 });
  }
});
