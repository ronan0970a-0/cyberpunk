-- =====================================================================
-- SEM LIMITE DE ACESSOS
-- Este schema NÃO impõe limite de acessos, de usuários nem de fichas:
--   * sem limite de contas: qualquer pessoa pode criar conta e usar o site;
--   * sem limite de fichas por usuário (não há trigger nem constraint de cota);
--   * sem limite de leituras, gravações ou visitas (não há contador nem rate limit no banco);
--   * as políticas RLS só garantem que cada pessoa veja e edite as PRÓPRIAS fichas.
-- A única restrição é o tamanho de cada foto: 2 MB por arquivo (veja o bucket
-- no final). Ela limita o arquivo, não a quantidade de acessos ou de fotos.
-- Os limites reais de uso vêm do plano do Supabase e da Vercel, não deste SQL.
-- =====================================================================

-- Cole no Supabase > SQL Editor > Run
-- Pode ser executado mais de uma vez sem dar erro.

create table if not exists public.fichas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome       text not null default 'Novo personagem',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fichas_user_idx on public.fichas (user_id, updated_at desc);

-- Atualiza updated_at automaticamente a cada edição
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists fichas_updated_at on public.fichas;
create trigger fichas_updated_at
  before update on public.fichas
  for each row execute function public.set_updated_at();

-- Segurança: cada usuário só enxerga e altera as próprias fichas
alter table public.fichas enable row level security;

drop policy if exists "ler proprias fichas"     on public.fichas;
drop policy if exists "criar proprias fichas"   on public.fichas;
drop policy if exists "editar proprias fichas"  on public.fichas;
drop policy if exists "excluir proprias fichas" on public.fichas;

create policy "ler proprias fichas" on public.fichas
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "criar proprias fichas" on public.fichas
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "editar proprias fichas" on public.fichas
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "excluir proprias fichas" on public.fichas
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ===== Fotos (Storage) =====
-- Bucket público de leitura (as fotos abrem por link); só o dono envia, troca e apaga na própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fichas-fotos', 'fichas-fotos', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos: ver proprias"    on storage.objects;
drop policy if exists "fotos: enviar proprias" on storage.objects;
drop policy if exists "fotos: editar proprias" on storage.objects;
drop policy if exists "fotos: apagar proprias" on storage.objects;

create policy "fotos: ver proprias" on storage.objects for select to authenticated
  using (bucket_id = 'fichas-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: enviar proprias" on storage.objects for insert to authenticated
  with check (bucket_id = 'fichas-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: editar proprias" on storage.objects for update to authenticated
  using (bucket_id = 'fichas-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "fotos: apagar proprias" on storage.objects for delete to authenticated
  using (bucket_id = 'fichas-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===== Contas sem confirmação de e-mail =====
-- Libera todas as contas que ficaram presas esperando confirmação por e-mail
-- (por exemplo, quando o limite de envio do Supabase estourou). Pode rodar quantas vezes quiser.
-- OBS.: a opção "Confirm email" (Authentication > Sign In / Providers > Email) é uma
-- configuração do painel e NÃO pode ser alterada por SQL; desligue-a lá para que novos
-- cadastros entrem direto, sem enviar e-mail.
update auth.users
   set email_confirmed_at = now()
 where email_confirmed_at is null;

-- ===== IA (Gemini): contador de usos por pessoa/dia =====
-- Este limite vale SÓ para o uso da IA, para não esgotar a cota gratuita do Gemini.
-- Não limita acessos ao site, contas nem fichas. O teto diário é definido na Edge Function
-- (secret IA_LIMITE_DIARIO, padrão 30). Cada pessoa só enxerga/consome o próprio contador.
create table if not exists public.ia_uso (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dia     date not null,
  usos    int  not null default 0,
  primary key (user_id, dia)
);
alter table public.ia_uso enable row level security; -- sem políticas: só a função abaixo mexe na tabela

create or replace function public.ia_consumir(p_limite int default 30)
returns table (ok boolean, total int, maximo int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usos int;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into public.ia_uso (user_id, dia, usos) values (auth.uid(), v_dia, 0) on conflict do nothing;
  update public.ia_uso set usos = usos + 1
   where user_id = auth.uid() and dia = v_dia and usos < p_limite
  returning usos into v_usos;
  if v_usos is null then
    select u.usos into v_usos from public.ia_uso u where u.user_id = auth.uid() and u.dia = v_dia;
    return query select false, v_usos, p_limite;
  end if;
  return query select true, v_usos, p_limite;
end $$;

revoke all on function public.ia_consumir(int) from public, anon;
grant execute on function public.ia_consumir(int) to authenticated;

-- =====================================================================
-- CELULAR: perfis, DINHEIRO (pontos), amizades, bate-papo, Pix e CLOVE
-- Segurança: o navegador NUNCA altera saldo, amizades ou mensagens diretamente.
-- Tudo isso passa por funções abaixo (security definer), que validam cada regra.
-- O DINHEIRO inicial de cada conta é 1000 (coluna carteiras.saldo, default).
-- Realtime (plano grátis do Supabase): 200 conexões simultâneas e 100 mensagens/s.
-- =====================================================================

create table if not exists public.perfis (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  usuario   text not null unique check (usuario ~ '^[a-z0-9_]{3,20}$'),
  nome      text not null check (char_length(nome) between 1 and 30),
  bio       text not null default '' check (char_length(bio) <= 200),
  cor       text not null default '#00e5ff' check (cor ~ '^#[0-9a-fA-F]{6}$'),
  avatar    text,
  criado_em timestamptz not null default now()
);
create table if not exists public.carteiras (
  user_id uuid primary key references auth.users(id) on delete cascade,
  saldo   bigint not null default 1000 check (saldo >= 0)
);
-- controle: quem é administrador (KILL JOY) e quem pode usar a IA (CLOVE)
create table if not exists public.controle (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  is_admin       boolean not null default false,
  clove_liberada boolean not null default false
);
create table if not exists public.amizades (
  id        uuid primary key default gen_random_uuid(),
  de        uuid not null references auth.users(id) on delete cascade,
  para      uuid not null references auth.users(id) on delete cascade,
  status    text not null default 'pendente' check (status in ('pendente','aceita')),
  criado_em timestamptz not null default now(),
  check (de <> para)
);
create unique index if not exists amizades_par_idx on public.amizades (least(de, para), greatest(de, para));

create table if not exists public.mensagens (
  id         bigint generated always as identity primary key,
  amizade_id uuid not null references public.amizades(id) on delete cascade,
  de         uuid not null references auth.users(id) on delete cascade,
  tipo       text not null default 'texto' check (tipo in ('texto','pix')),
  texto      text check (char_length(texto) <= 1000),
  valor      bigint,
  criado_em  timestamptz not null default now()
);
create index if not exists mensagens_conv_idx on public.mensagens (amizade_id, id desc);

create table if not exists public.transferencias (
  id        bigint generated always as identity primary key,
  de        uuid references auth.users(id) on delete set null,
  para      uuid references auth.users(id) on delete set null,
  valor     bigint not null check (valor <> 0),
  tipo      text not null check (tipo in ('pix','admin')),
  nota      text,
  criado_em timestamptz not null default now(),
  check (tipo <> 'pix' or valor > 0)
);
create index if not exists transf_de_idx on public.transferencias (de, id desc);
create index if not exists transf_para_idx on public.transferencias (para, id desc);

create table if not exists public.clove_msgs (
  id      bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  papel   text not null check (papel in ('user','clove')),
  texto   text not null check (char_length(texto) <= 4000),
  criado_em timestamptz not null default now()
);
create index if not exists clove_msgs_idx on public.clove_msgs (user_id, id desc);
create table if not exists public.clove_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia     date not null,
  usos    int  not null default 0,
  primary key (user_id, dia)
);

alter table public.perfis          enable row level security;
alter table public.carteiras       enable row level security;
alter table public.controle        enable row level security;
alter table public.amizades        enable row level security;
alter table public.mensagens       enable row level security;
alter table public.transferencias  enable row level security;
alter table public.clove_msgs      enable row level security;
alter table public.clove_uso       enable row level security; -- sem políticas: só funções

drop policy if exists "perfis: ver todos"      on public.perfis;
drop policy if exists "perfis: editar proprio" on public.perfis;
drop policy if exists "carteira: ver propria"  on public.carteiras;
drop policy if exists "controle: ver proprio"  on public.controle;
drop policy if exists "amizades: ver minhas"   on public.amizades;
drop policy if exists "mensagens: ver minhas"  on public.mensagens;
drop policy if exists "transf: ver minhas"     on public.transferencias;
drop policy if exists "clove: ver"     on public.clove_msgs;
drop policy if exists "clove: criar"   on public.clove_msgs;
drop policy if exists "clove: apagar"  on public.clove_msgs;

create policy "perfis: ver todos" on public.perfis for select to authenticated using (true);
create policy "perfis: editar proprio" on public.perfis for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "carteira: ver propria" on public.carteiras for select to authenticated using ((select auth.uid()) = user_id);
create policy "controle: ver proprio" on public.controle  for select to authenticated using ((select auth.uid()) = user_id);
create policy "amizades: ver minhas"  on public.amizades for select to authenticated
  using ((select auth.uid()) in (de, para));
create policy "mensagens: ver minhas" on public.mensagens for select to authenticated
  using (exists (select 1 from public.amizades a
                 where a.id = amizade_id and a.status = 'aceita' and (select auth.uid()) in (a.de, a.para)));
create policy "transf: ver minhas" on public.transferencias for select to authenticated
  using ((select auth.uid()) in (de, para));
create policy "clove: ver"    on public.clove_msgs for select to authenticated using ((select auth.uid()) = user_id);
create policy "clove: criar"  on public.clove_msgs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "clove: apagar" on public.clove_msgs for delete to authenticated using ((select auth.uid()) = user_id);

-- Defesa extra: visitantes sem login não tocam em nada; usuários só escrevem onde é seguro
revoke all on public.perfis, public.carteiras, public.controle, public.amizades, public.mensagens,
              public.transferencias, public.clove_msgs, public.clove_uso from anon;
revoke insert, update, delete on public.perfis, public.carteiras, public.controle, public.amizades,
              public.mensagens, public.transferencias from authenticated;
revoke all on public.clove_uso from authenticated;
grant update (nome, bio, cor, avatar) on public.perfis to authenticated;  -- o @usuario não muda

-- ---------- Funções ----------
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.is_admin from public.controle c where c.user_id = auth.uid()), false)
$$;

create or replace function public.criar_perfil(p_usuario text, p_nome text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_u  text := lower(ltrim(trim(coalesce(p_usuario, '')), '@'));
  v_n  text := nullif(trim(coalesce(p_nome, '')), '');
begin
  if v_me is null then raise exception 'não autenticado'; end if;
  if v_u !~ '^[a-z0-9_]{3,20}$' then raise exception 'Use de 3 a 20 letras minúsculas, números ou _'; end if;
  if exists (select 1 from public.perfis where user_id = v_me) then raise exception 'Você já tem um perfil'; end if;
  insert into public.perfis (user_id, usuario, nome) values (v_me, v_u, left(coalesce(v_n, v_u), 30));
  insert into public.carteiras (user_id) values (v_me) on conflict do nothing;
  insert into public.controle (user_id) values (v_me) on conflict do nothing;
exception when unique_violation then
  raise exception 'Esse @usuario já está em uso';
end $$;

create or replace function public.pedir_amizade(p_usuario text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_alvo uuid; v_a public.amizades;
begin
  if v_me is null then raise exception 'não autenticado'; end if;
  if not exists (select 1 from public.perfis where user_id = v_me) then raise exception 'Crie o seu @usuario primeiro'; end if;
  select user_id into v_alvo from public.perfis where usuario = lower(ltrim(trim(coalesce(p_usuario, '')), '@'));
  if v_alvo is null then raise exception 'Usuário não encontrado'; end if;
  if v_alvo = v_me then raise exception 'Você não pode adicionar a si mesmo'; end if;
  select * into v_a from public.amizades
   where least(de, para) = least(v_me, v_alvo) and greatest(de, para) = greatest(v_me, v_alvo);
  if found then
    if v_a.status = 'bloqueada' then raise exception 'Não foi possível enviar o pedido'; end if;
    if v_a.status = 'aceita' then raise exception 'Vocês já são amigos'; end if;
    if v_a.de = v_me then raise exception 'Pedido já enviado'; end if;
    update public.amizades set status = 'aceita' where id = v_a.id; -- a pessoa já tinha pedido: aceita
    return 'aceita';
  end if;
  insert into public.amizades (de, para) values (v_me, v_alvo);
  return 'pendente';
end $$;

create or replace function public.responder_amizade(p_id uuid, p_aceitar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_aceitar then
    update public.amizades set status = 'aceita' where id = p_id and para = auth.uid() and status = 'pendente';
  else
    delete from public.amizades where id = p_id and para = auth.uid() and status = 'pendente';
  end if;
  if not found then raise exception 'Pedido não encontrado'; end if;
end $$;

-- Remove um amigo, recusa ou cancela um pedido (apaga também o histórico da conversa)
create or replace function public.remover_amizade(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.amizades where id = p_id and auth.uid() in (de, para) and status <> 'bloqueada';
  if not found then raise exception 'Amizade não encontrada'; end if;
end $$;

create or replace function public.enviar_mensagem(p_amizade uuid, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t text := trim(coalesce(p_texto, ''));
begin
  if char_length(v_t) not between 1 and 1000 then raise exception 'Mensagem vazia ou longa demais'; end if;
  if not exists (select 1 from public.amizades a
                 where a.id = p_amizade and a.status = 'aceita' and auth.uid() in (a.de, a.para)) then
    raise exception 'Conversa não encontrada';
  end if;
  insert into public.mensagens (amizade_id, de, texto) values (p_amizade, auth.uid(), v_t);
end $$;

-- Pix: transferência atômica entre amigos. Recusa saldo insuficiente, valor <= 0 e quem não é amigo.
create or replace function public.pix_enviar(p_amizade uuid, p_valor bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid(); v_outro uuid; v_saldo bigint;
begin
  if v_me is null then raise exception 'não autenticado'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Valor inválido'; end if;
  select case when a.de = v_me then a.para else a.de end into v_outro
    from public.amizades a where a.id = p_amizade and a.status = 'aceita' and v_me in (a.de, a.para);
  if v_outro is null then raise exception 'Vocês não são amigos'; end if;
  perform 1 from public.carteiras where user_id in (v_me, v_outro) order by user_id for update; -- ordem fixa: sem deadlock
  update public.carteiras set saldo = saldo - p_valor where user_id = v_me and saldo >= p_valor returning saldo into v_saldo;
  if v_saldo is null then raise exception 'Saldo insuficiente'; end if;
  update public.carteiras set saldo = saldo + p_valor where user_id = v_outro;
  if not found then raise exception 'O destinatário ainda não tem carteira'; end if;
  insert into public.transferencias (de, para, valor, tipo) values (v_me, v_outro, p_valor, 'pix');
  insert into public.mensagens (amizade_id, de, tipo, valor) values (p_amizade, v_me, 'pix', p_valor);
  return v_saldo;
end $$;

-- ---------- Funções da KILL JOY (administradora) ----------
drop function if exists public.admin_listar();
create function public.admin_listar()
returns table (user_id uuid, usuario text, nome text, saldo bigint, clove_liberada boolean, pode_vender boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Apenas a KILL JOY pode fazer isso'; end if;
  return query
    select p.user_id, p.usuario, p.nome, coalesce(w.saldo, 0), coalesce(c.clove_liberada, false), coalesce(c.pode_vender, false)
      from public.perfis p
      left join public.carteiras w on w.user_id = p.user_id
      left join public.controle  c on c.user_id = p.user_id
     order by p.usuario limit 500;
end $$;

-- Valor positivo cria dinheiro, negativo retira (o saldo nunca fica negativo)
create or replace function public.admin_dar_dinheiro(p_user uuid, p_valor bigint, p_nota text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_saldo bigint;
begin
  if not public.eh_admin() then raise exception 'Apenas a KILL JOY pode fazer isso'; end if;
  if p_valor is null or p_valor = 0 then raise exception 'Valor inválido'; end if;
  update public.carteiras set saldo = saldo + p_valor where user_id = p_user and saldo + p_valor >= 0 returning saldo into v_saldo;
  if v_saldo is null then raise exception 'Usuário sem carteira ou o saldo ficaria negativo'; end if;
  insert into public.transferencias (de, para, valor, tipo, nota) values (auth.uid(), p_user, p_valor, 'admin', left(p_nota, 100));
  return v_saldo;
end $$;

-- Libera ou bloqueia o uso da IA (CLOVE e botões de IA das fichas) para um usuário
create or replace function public.admin_liberar_clove(p_user uuid, p_liberar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Apenas a KILL JOY pode fazer isso'; end if;
  update public.controle set clove_liberada = p_liberar where user_id = p_user;
  if not found then raise exception 'Usuário não encontrado'; end if;
end $$;

-- Limite diário de mensagens da CLOVE por pessoa (chamada pela Edge Function "clove")
create or replace function public.clove_consumir(p_limite int default 100)
returns table (ok boolean, total int, maximo int)
language plpgsql security definer set search_path = '' as $$
declare v_dia date := (now() at time zone 'America/Sao_Paulo')::date; v_usos int;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into public.clove_uso (user_id, dia, usos) values (auth.uid(), v_dia, 0) on conflict do nothing;
  update public.clove_uso set usos = usos + 1
   where user_id = auth.uid() and dia = v_dia and usos < p_limite returning usos into v_usos;
  if v_usos is null then
    select u.usos into v_usos from public.clove_uso u where u.user_id = auth.uid() and u.dia = v_dia;
    return query select false, v_usos, p_limite;
  end if;
  return query select true, v_usos, p_limite;
end $$;

revoke all on function public.eh_admin(), public.criar_perfil(text, text), public.pedir_amizade(text),
  public.responder_amizade(uuid, boolean), public.remover_amizade(uuid), public.enviar_mensagem(uuid, text),
  public.pix_enviar(uuid, bigint), public.admin_listar(), public.admin_dar_dinheiro(uuid, bigint, text),
  public.admin_liberar_clove(uuid, boolean), public.clove_consumir(int) from public, anon;
grant execute on function public.eh_admin(), public.criar_perfil(text, text), public.pedir_amizade(text),
  public.responder_amizade(uuid, boolean), public.remover_amizade(uuid), public.enviar_mensagem(uuid, text),
  public.pix_enviar(uuid, bigint), public.admin_listar(), public.admin_dar_dinheiro(uuid, bigint, text),
  public.admin_liberar_clove(uuid, boolean), public.clove_consumir(int) to authenticated;

-- Tempo real (mensagens, pedidos de amizade e saldo)
do $$
declare t text;
begin
  foreach t in array array['mensagens', 'amizades', 'carteiras'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ===== KILL JOY: única administradora, definida pelo e-mail =====
-- A conta precisa existir (crie a conta no site antes). Se rodar antes, não acontece nada:
-- crie a conta e rode este bloco de novo. Ninguém consegue virar administrador pelo site.
insert into public.controle (user_id, is_admin, clove_liberada)
select id, true, true from auth.users where lower(email) = 'ronandasilva0983@gmail.com'
on conflict (user_id) do update set is_admin = true, clove_liberada = true;

-- =====================================================================
-- LOTE 2: editar/apagar mensagens (10 min), bloqueio, não lidas e extrato geral
-- =====================================================================
alter table public.mensagens add column if not exists editada boolean not null default false;
alter table public.mensagens add column if not exists apagada boolean not null default false;
alter table public.amizades  add column if not exists bloqueado_por uuid references auth.users(id) on delete set null;
alter table public.amizades drop constraint if exists amizades_status_check;
alter table public.amizades add constraint amizades_status_check check (status in ('pendente','aceita','bloqueada'));

-- O prazo de 10 minutos é conferido aqui no banco (o relógio do aparelho não vale).
-- Só o autor mexe, só em mensagens de texto: Pix nunca pode ser editado nem apagado.
create or replace function public.editar_mensagem(p_id bigint, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t text := trim(coalesce(p_texto, ''));
begin
  if char_length(v_t) not between 1 and 1000 then raise exception 'Mensagem vazia ou longa demais'; end if;
  update public.mensagens set texto = v_t, editada = true
   where id = p_id and de = auth.uid() and tipo = 'texto' and not apagada
     and criado_em > now() - interval '10 minutes';
  if not found then raise exception 'Só dá para editar mensagens suas de texto nos primeiros 10 minutos'; end if;
end $$;

create or replace function public.apagar_mensagem(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.mensagens set apagada = true, texto = null
   where id = p_id and de = auth.uid() and tipo = 'texto' and not apagada
     and criado_em > now() - interval '10 minutes';
  if not found then raise exception 'Só dá para apagar mensagens suas de texto nos primeiros 10 minutos'; end if;
end $$;

-- Bloquear: a conversa some para os dois e a pessoa não consegue pedir amizade de novo.
-- Desbloquear apaga a conversa antiga e volta ao zero.
create or replace function public.bloquear_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.amizades set status = 'bloqueada', bloqueado_por = auth.uid()
   where id = p_id and auth.uid() in (de, para) and status in ('aceita', 'pendente');
  if not found then raise exception 'Amizade não encontrada'; end if;
end $$;

create or replace function public.desbloquear_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.amizades where id = p_id and status = 'bloqueada' and bloqueado_por = auth.uid();
  if not found then raise exception 'Bloqueio não encontrado'; end if;
end $$;

-- Mensagens não lidas
create table if not exists public.leituras (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amizade_id uuid not null references public.amizades(id) on delete cascade,
  ate        bigint not null default 0,
  primary key (user_id, amizade_id)
);
alter table public.leituras enable row level security; -- sem políticas: só funções
revoke all on public.leituras from anon, authenticated;

create or replace function public.marcar_lida(p_amizade uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.amizades a where a.id = p_amizade and a.status = 'aceita' and auth.uid() in (a.de, a.para)) then
    return;
  end if;
  insert into public.leituras (user_id, amizade_id, ate)
  values (auth.uid(), p_amizade, coalesce((select max(m.id) from public.mensagens m where m.amizade_id = p_amizade), 0))
  on conflict (user_id, amizade_id) do update set ate = excluded.ate;
end $$;

create or replace function public.nao_lidas() returns table (amizade_id uuid, qtd int)
language sql stable security definer set search_path = '' as $$
  select m.amizade_id, count(*)::int
    from public.mensagens m
    join public.amizades a on a.id = m.amizade_id and a.status = 'aceita' and auth.uid() in (a.de, a.para)
    left join public.leituras l on l.amizade_id = m.amizade_id and l.user_id = auth.uid()
   where m.de <> auth.uid() and not m.apagada and m.id > coalesce(l.ate, 0)
   group by m.amizade_id
$$;

-- Extrato geral de DINHEIRO (só KILL JOY). Mostra movimentações, nunca mensagens.
create or replace function public.admin_extrato(p_limite int default 100)
returns table (id bigint, de_usuario text, para_usuario text, valor bigint, tipo text, nota text, criado_em timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Apenas a KILL JOY pode fazer isso'; end if;
  return query
    select t.id, pd.usuario, pp.usuario, t.valor, t.tipo, t.nota, t.criado_em
      from public.transferencias t
      left join public.perfis pd on pd.user_id = t.de
      left join public.perfis pp on pp.user_id = t.para
     order by t.id desc limit least(greatest(p_limite, 1), 500);
end $$;

revoke all on function public.editar_mensagem(bigint, text), public.apagar_mensagem(bigint), public.bloquear_usuario(uuid),
  public.desbloquear_usuario(uuid), public.marcar_lida(uuid), public.nao_lidas(), public.admin_extrato(int) from public, anon;
grant execute on function public.editar_mensagem(bigint, text), public.apagar_mensagem(bigint), public.bloquear_usuario(uuid), public.desbloquear_usuario(uuid), public.marcar_lida(uuid), public.nao_lidas(), public.admin_extrato(int) to authenticated;

-- =====================================================================
-- LOTE 3: papéis de parede, histórico de versões das fichas e LOJA
-- =====================================================================
alter table public.perfis add column if not exists papel text not null default 'neon'
  check (papel in ('neon','noite','grade','sangue','aurora','chuva'));
alter table public.perfis add column if not exists papel_foto text;
grant update (papel, papel_foto) on public.perfis to authenticated;

-- ---------- Histórico de versões ----------
-- Guarda o estado ANTERIOR da ficha no máximo uma vez a cada 10 minutos de edição (até 30 versões por ficha).
create table if not exists public.fichas_versoes (
  id        bigint generated always as identity primary key,
  ficha_id  uuid not null references public.fichas(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  nome      text not null,
  data      jsonb not null,
  criado_em timestamptz not null default now()
);
create index if not exists fichas_versoes_idx on public.fichas_versoes (ficha_id, id desc);
alter table public.fichas_versoes enable row level security;
drop policy if exists "versoes: ver proprias" on public.fichas_versoes;
create policy "versoes: ver proprias" on public.fichas_versoes for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.fichas_versoes from anon;
revoke insert, update, delete on public.fichas_versoes from authenticated;

create or replace function public.fichas_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.data is distinct from new.data or old.nome is distinct from new.nome)
     and not exists (select 1 from public.fichas_versoes v where v.ficha_id = old.id and v.criado_em > now() - interval '10 minutes') then
    insert into public.fichas_versoes (ficha_id, user_id, nome, data) values (old.id, old.user_id, old.nome, old.data);
    delete from public.fichas_versoes where ficha_id = old.id
       and id not in (select x.id from public.fichas_versoes x where x.ficha_id = old.id order by x.id desc limit 30);
  end if;
  return new;
end $$;
drop trigger if exists fichas_snapshot on public.fichas;
create trigger fichas_snapshot before update on public.fichas for each row execute function public.fichas_snapshot();

create or replace function public.restaurar_versao(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.fichas_versoes;
begin
  select * into v from public.fichas_versoes where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Versão não encontrada'; end if;
  insert into public.fichas_versoes (ficha_id, user_id, nome, data)  -- guarda o estado atual antes de voltar
    select f.id, f.user_id, f.nome, f.data from public.fichas f where f.id = v.ficha_id and f.user_id = auth.uid();
  update public.fichas set nome = v.nome, data = v.data where id = v.ficha_id and user_id = auth.uid();
end $$;

-- ---------- Loja: só vendedores liberados pela KILL JOY podem anunciar ----------
alter table public.controle add column if not exists pode_vender boolean not null default false;
alter table public.transferencias drop constraint if exists transferencias_tipo_check;
alter table public.transferencias add constraint transferencias_tipo_check check (tipo in ('pix','admin','loja'));

create or replace function public.pode_vender() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.pode_vender from public.controle c where c.user_id = auth.uid()), false)
$$;

create table if not exists public.loja_itens (
  id          uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria   text not null check (categoria in ('implante','equipamento')),
  nome        text not null check (char_length(nome) between 1 and 60),
  descricao   text not null default '' check (char_length(descricao) <= 500),
  preco       bigint not null check (preco between 1 and 1000000000),
  humanidade  int not null default 0,
  peso        numeric not null default 0,
  foto        text,
  estoque     int check (estoque is null or estoque >= 0), -- vazio = ilimitado
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);
create index if not exists loja_ativo_idx on public.loja_itens (ativo, criado_em desc);
alter table public.loja_itens enable row level security;
drop policy if exists "loja: ver" on public.loja_itens;
drop policy if exists "loja: anunciar" on public.loja_itens;
drop policy if exists "loja: editar proprio" on public.loja_itens;
create policy "loja: ver" on public.loja_itens for select to authenticated using (ativo or vendedor_id = (select auth.uid()));
create policy "loja: anunciar" on public.loja_itens for insert to authenticated
  with check (vendedor_id = (select auth.uid()) and public.pode_vender());
create policy "loja: editar proprio" on public.loja_itens for update to authenticated
  using (vendedor_id = (select auth.uid())) with check (vendedor_id = (select auth.uid()));
revoke all on public.loja_itens from anon;
revoke delete on public.loja_itens from authenticated; -- itens são desativados, não apagados (as fotos continuam nas fichas)

-- Compra atômica: cobra, paga o vendedor, baixa o estoque e entrega o item na ficha escolhida
create or replace function public.comprar_item(p_item uuid, p_ficha uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid(); v_i public.loja_itens; v_saldo bigint;
  v_lista text; v_atual jsonb; v_novo jsonb;
begin
  if v_me is null then raise exception 'não autenticado'; end if;
  select * into v_i from public.loja_itens where id = p_item for update;
  if not found or not v_i.ativo then raise exception 'Item indisponível'; end if;
  if v_i.vendedor_id = v_me then raise exception 'Você não pode comprar o seu próprio item'; end if;
  if v_i.estoque is not null and v_i.estoque <= 0 then raise exception 'Item esgotado'; end if;
  if not exists (select 1 from public.fichas f where f.id = p_ficha and f.user_id = v_me) then
    raise exception 'Escolha uma das suas fichas';
  end if;
  perform 1 from public.carteiras where user_id in (v_me, v_i.vendedor_id) order by user_id for update;
  update public.carteiras set saldo = saldo - v_i.preco where user_id = v_me and saldo >= v_i.preco returning saldo into v_saldo;
  if v_saldo is null then raise exception 'Saldo insuficiente'; end if;
  update public.carteiras set saldo = saldo + v_i.preco where user_id = v_i.vendedor_id;
  if not found then raise exception 'Vendedor sem carteira'; end if;
  if v_i.estoque is not null then
    update public.loja_itens set estoque = estoque - 1, ativo = (estoque - 1) > 0 where id = v_i.id;
  end if;
  insert into public.transferencias (de, para, valor, tipo, nota) values (v_me, v_i.vendedor_id, v_i.preco, 'loja', left(v_i.nome, 100));

  v_lista := case when v_i.categoria = 'implante' then 'implantes' else 'equipamento' end;
  select f.data -> v_lista into v_atual from public.fichas f where f.id = p_ficha;
  v_atual := case
    when jsonb_typeof(v_atual) = 'array' then v_atual
    when v_atual is null or jsonb_typeof(v_atual) = 'null' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'nome', 'Anotação anterior', 'descricao', v_atual #>> '{}'))
  end;
  v_novo := jsonb_build_object('id', gen_random_uuid(), 'nome', v_i.nome, 'descricao', v_i.descricao, 'foto', coalesce(v_i.foto, ''))
    || case when v_i.categoria = 'implante' then jsonb_build_object('humanidade', v_i.humanidade)
            else jsonb_build_object('qtd', 1, 'peso', v_i.peso) end;
  update public.fichas set data = jsonb_set(data, array[v_lista], v_atual || jsonb_build_array(v_novo), true) where id = p_ficha;
  return v_saldo;
end $$;

create or replace function public.admin_liberar_vendedor(p_user uuid, p_liberar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Apenas a KILL JOY pode fazer isso'; end if;
  update public.controle set pode_vender = p_liberar where user_id = p_user;
  if not found then raise exception 'Usuário não encontrado'; end if;
end $$;

revoke all on function public.restaurar_versao(bigint), public.pode_vender(), public.comprar_item(uuid, uuid),
  public.admin_liberar_vendedor(uuid, boolean), public.admin_listar() from public, anon;
grant execute on function public.restaurar_versao(bigint), public.pode_vender(), public.comprar_item(uuid, uuid),
  public.admin_liberar_vendedor(uuid, boolean), public.admin_listar() to authenticated;

update public.controle set pode_vender = true where is_admin; -- a KILL JOY sempre pode vender

-- =====================================================================
-- LOTE 4: notificações push (aparelhos inscritos)
-- =====================================================================
create table if not exists public.push_subs (
  id        bigint generated always as identity primary key,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  criado_em timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "push: ver" on public.push_subs;
drop policy if exists "push: criar" on public.push_subs;
drop policy if exists "push: editar" on public.push_subs;
drop policy if exists "push: apagar" on public.push_subs;
create policy "push: ver"    on public.push_subs for select to authenticated using ((select auth.uid()) = user_id);
create policy "push: criar"  on public.push_subs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push: editar" on public.push_subs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push: apagar" on public.push_subs for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_subs from anon;

-- =====================================================================
-- LOTE 5: Aliados e painel Equipe (sinais vitais)
-- "Amigo" = amizade aceita. "Aliado" = amigo que EU marquei para aparecer na minha Equipe.
-- Eu vejo os sinais de X quando: somos amigos, eu marquei X como aliado e X ativou
-- "Mostrar meus sinais vitais". Só HP, Resistência, Sanidade, condições, nome e foto do
-- personagem da ficha que X escolheu ("Usar na mesa"). O resto da ficha continua privado.
-- =====================================================================
create or replace function public.num(v text) returns int
language sql immutable set search_path = '' as $$
  select case when v ~ '^-?[0-9]{1,9}$' then v::int else 0 end
$$;

create table if not exists public.aliados (
  user_id   uuid not null references auth.users(id) on delete cascade,
  aliado_id uuid not null references auth.users(id) on delete cascade,
  primary key (user_id, aliado_id),
  check (user_id <> aliado_id)
);
create table if not exists public.mesa_status (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  ficha_id     uuid references public.fichas(id) on delete set null,
  compartilhar boolean not null default false, -- desligado até a própria pessoa ativar
  personagem   text,
  foto         text,
  hp           int not null default 0,
  hp_max       int not null default 0,
  resistencia  int not null default 0,
  san          int not null default 0,
  san_max      int not null default 0,
  condicoes    jsonb not null default '[]'::jsonb,
  atualizado   timestamptz not null default now()
);
create index if not exists mesa_status_ficha_idx on public.mesa_status (ficha_id);

alter table public.aliados enable row level security;
alter table public.mesa_status enable row level security;
drop policy if exists "aliados: ver meus" on public.aliados;
drop policy if exists "mesa: ver propria" on public.mesa_status;
drop policy if exists "mesa: ver aliados" on public.mesa_status;
create policy "aliados: ver meus" on public.aliados for select to authenticated using ((select auth.uid()) = user_id);
create policy "mesa: ver propria" on public.mesa_status for select to authenticated using ((select auth.uid()) = user_id);
create policy "mesa: ver aliados" on public.mesa_status for select to authenticated using (
  compartilhar and exists (
    select 1 from public.aliados a
      join public.amizades f on f.status = 'aceita'
       and ((f.de = a.user_id and f.para = a.aliado_id) or (f.para = a.user_id and f.de = a.aliado_id))
     where a.user_id = (select auth.uid()) and a.aliado_id = mesa_status.user_id
  )
);
revoke all on public.aliados, public.mesa_status from anon;
revoke insert, update, delete on public.aliados, public.mesa_status from authenticated;

-- Copia da ficha escolhida só os sinais vitais (roda a cada salvamento da ficha)
create or replace function public.mesa_atualizar(p_ficha uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.mesa_status m set
    personagem  = f.nome,
    foto        = nullif(f.data ->> 'foto', ''),
    hp          = public.num(f.data ->> 'hp'),
    hp_max      = public.num(f.data ->> 'hpMax'),
    resistencia = public.num(f.data ->> 'resistencia'),
    san         = public.num(f.data ->> 'san'),
    san_max     = public.num(f.data ->> 'sanMax'),
    condicoes   = coalesce((select jsonb_agg(c ->> 'nome')
                    from jsonb_array_elements(case when jsonb_typeof(f.data -> 'condicoes') = 'array'
                                                   then f.data -> 'condicoes' else '[]'::jsonb end) c), '[]'::jsonb),
    atualizado  = now()
   from public.fichas f
  where f.id = p_ficha and m.ficha_id = f.id;
end $$;

create or replace function public.fichas_mesa_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.mesa_atualizar(new.id);
  return null;
end $$;
drop trigger if exists fichas_mesa on public.fichas;
create trigger fichas_mesa after update on public.fichas for each row execute function public.fichas_mesa_sync();

-- Ao desfazer a amizade, a marca de aliado some junto
create or replace function public.amizade_limpa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.aliados where (user_id = old.de and aliado_id = old.para) or (user_id = old.para and aliado_id = old.de);
  return old;
end $$;
drop trigger if exists amizade_limpa on public.amizades;
create trigger amizade_limpa after delete on public.amizades for each row execute function public.amizade_limpa();

create or replace function public.definir_ficha_ativa(p_ficha uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fichas where id = p_ficha and user_id = auth.uid()) then raise exception 'Ficha não encontrada'; end if;
  insert into public.mesa_status (user_id, ficha_id) values (auth.uid(), p_ficha)
    on conflict (user_id) do update set ficha_id = excluded.ficha_id;
  perform public.mesa_atualizar(p_ficha);
end $$;

create or replace function public.mesa_compartilhar(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.mesa_status (user_id, compartilhar) values (auth.uid(), p_on)
    on conflict (user_id) do update set compartilhar = excluded.compartilhar;
end $$;

create or replace function public.marcar_aliado(p_alvo uuid, p_marcar boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_marcar then
    if not exists (select 1 from public.amizades f where f.status = 'aceita'
                   and ((f.de = auth.uid() and f.para = p_alvo) or (f.para = auth.uid() and f.de = p_alvo))) then
      raise exception 'Só dá para marcar amigos como aliados';
    end if;
    insert into public.aliados (user_id, aliado_id) values (auth.uid(), p_alvo) on conflict do nothing;
  else
    delete from public.aliados where user_id = auth.uid() and aliado_id = p_alvo;
  end if;
end $$;

revoke all on function public.definir_ficha_ativa(uuid), public.mesa_compartilhar(boolean), public.marcar_aliado(uuid, boolean),
  public.mesa_atualizar(uuid), public.fichas_mesa_sync(), public.amizade_limpa(), public.num(text) from public, anon;
grant execute on function public.definir_ficha_ativa(uuid), public.mesa_compartilhar(boolean), public.marcar_aliado(uuid, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mesa_status') then
    alter publication supabase_realtime add table public.mesa_status;
  end if;
end $$;

-- Correção: atributos não somam mais Vida nem Sanidade. Recalcula agora o painel Equipe
-- das fichas já escolhidas (usando o máximo digitado na ficha).
select public.mesa_atualizar(ficha_id) from public.mesa_status where ficha_id is not null;

-- =====================================================================
-- LOTE 6: MESTRE DA MESA (leitura de todas as fichas, em tempo real)
-- O mestre só LÊ as fichas dos jogadores; não consegue editá-las (as regras de escrita
-- continuam "só o dono"). O papel só pode ser dado por este SQL, nunca pelo site.
-- =====================================================================
alter table public.controle add column if not exists is_mestre boolean not null default false;

create or replace function public.eh_mestre() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select c.is_mestre from public.controle c where c.user_id = auth.uid()), false)
$$;
revoke all on function public.eh_mestre() from public, anon;
grant execute on function public.eh_mestre() to authenticated;

drop policy if exists "fichas: mestre ve todas" on public.fichas;
create policy "fichas: mestre ve todas" on public.fichas for select to authenticated using ((select public.eh_mestre()));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fichas') then
    alter publication supabase_realtime add table public.fichas;
  end if;
end $$;

-- Mestre / administrador (a conta precisa existir: crie-a no site antes e rode este bloco de novo se preciso)
insert into public.controle (user_id, is_admin, is_mestre, clove_liberada, pode_vender)
select id, true, true, true, true from auth.users where lower(email) = 'joaolucasdamacenosoares@gmail.com'
on conflict (user_id) do update set is_admin = true, is_mestre = true, clove_liberada = true, pode_vender = true;
