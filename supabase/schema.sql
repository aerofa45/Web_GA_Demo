-- Run only in the dedicated Forma project. No existing tables are replaced.
begin;
create table if not exists public.forma_users (
 id text primary key, email text unique not null, name text not null,
 slug text unique not null, salt text not null, passhash text not null,
 created bigint not null
);
create table if not exists public.forma_profiles (
 user_id text primary key references public.forma_users(id) on delete cascade,
 data jsonb not null, updated bigint not null
);
create table if not exists public.forma_sessions (
 tokenhash text primary key, user_id text not null references public.forma_users(id) on delete cascade,
 expires bigint not null
);
create index if not exists forma_sessions_expiry on public.forma_sessions(expires);
create table if not exists public.forma_messages (
 id text primary key, user_id text not null references public.forma_users(id) on delete cascade,
 sender text not null, email text not null, message text not null, created bigint not null
);
create index if not exists forma_messages_owner on public.forma_messages(user_id,created desc);
create table if not exists public.forma_uploads (
 id text primary key, user_id text not null references public.forma_users(id) on delete cascade,
 created bigint not null
);
create table if not exists public.forma_limits (
 key text primary key, window_start bigint not null, hits integer not null
);
alter table public.forma_users enable row level security;
alter table public.forma_profiles enable row level security;
alter table public.forma_sessions enable row level security;
alter table public.forma_messages enable row level security;
alter table public.forma_uploads enable row level security;
alter table public.forma_limits enable row level security;
revoke all on public.forma_users,public.forma_profiles,public.forma_sessions,public.forma_messages,public.forma_uploads,public.forma_limits from anon,authenticated;
grant all on public.forma_users,public.forma_profiles,public.forma_sessions,public.forma_messages,public.forma_uploads,public.forma_limits to service_role;

-- Transactional registration: account/profile/session are committed together.
create or replace function public.forma_register(p_user jsonb,p_profile jsonb,p_token text,p_expires bigint)
returns void language plpgsql security invoker set search_path=public as $$
begin
 insert into forma_users values(p_user->>'id',p_user->>'email',p_user->>'name',p_user->>'slug',p_user->>'salt',p_user->>'passhash',(p_user->>'created')::bigint);
 insert into forma_profiles values(p_user->>'id',p_profile,(p_user->>'created')::bigint);
 insert into forma_sessions values(p_token,p_user->>'id',p_expires);
end $$;
create or replace function public.forma_limit(p_key text,p_now bigint,p_window bigint,p_max integer)
returns boolean language plpgsql security invoker set search_path=public as $$
declare n integer;
begin
 insert into forma_limits values(p_key,p_now,1)
 on conflict(key) do update set
 hits=case when forma_limits.window_start+p_window<=p_now then 1 else forma_limits.hits+1 end,
 window_start=case when forma_limits.window_start+p_window<=p_now then p_now else forma_limits.window_start end
 returning hits into n;
 return n<=p_max;
end $$;
create or replace function public.forma_reserve_upload(p_user text,p_id text,p_now bigint)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from forma_users where id=p_user for update;
 if not found then return false; end if;
 if (select count(*) from forma_uploads where user_id=p_user)>=30 then return false; end if;
 insert into forma_uploads values(p_id,p_user,p_now);
 return true;
end $$;
revoke all on function public.forma_register(jsonb,jsonb,text,bigint),public.forma_limit(text,bigint,bigint,integer),public.forma_reserve_upload(text,text,bigint) from public,anon,authenticated;
grant execute on function public.forma_register(jsonb,jsonb,text,bigint),public.forma_limit(text,bigint,bigint,integer),public.forma_reserve_upload(text,text,bigint) to service_role;
-- Public portfolio images only. No anonymous upload/update/delete policy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('forma-images','forma-images',true,1048576,array['image/webp']) on conflict(id) do nothing;
commit;
