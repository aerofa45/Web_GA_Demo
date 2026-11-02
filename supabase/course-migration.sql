-- Forma Studio course schema (staging only). Apply in Forma_Trial_Test SQL Editor.
-- Additive migration: does not modify existing portfolio records.
begin;
create table if not exists public.forma_course_drafts (
 id text primary key,
 user_id text not null references public.forma_users(id) on delete cascade,
 title text not null,
 document_text text not null default '',
 outline jsonb not null default '{"chapters":[]}'::jsonb,
 created bigint not null,
 updated bigint not null,
 published boolean not null default false
);
create index if not exists forma_course_drafts_owner on public.forma_course_drafts(user_id,updated desc);
create table if not exists public.forma_google_oauth_states (
 state text primary key,
 user_id text not null references public.forma_users(id) on delete cascade,
 role text not null check(role in ('instructor','student')),
 verifier text not null,
 created bigint not null
);
create table if not exists public.forma_google_connections (
 user_id text not null references public.forma_users(id) on delete cascade,
 role text not null check(role in ('instructor','student')),
 email text not null,
 google_sub text not null,
 refresh_cipher text not null,
 updated bigint not null,
 primary key(user_id,role)
);
create unique index if not exists forma_google_unique_student on public.forma_google_connections(email) where role='student';
create table if not exists public.forma_course_enrollments (
 course_id text not null references public.forma_course_drafts(id) on delete cascade,
 email text not null,
 status text not null check(status in ('pending','approved','revoked')),
 created bigint not null,
 updated bigint not null,
 primary key(course_id,email)
);
alter table public.forma_course_drafts enable row level security;
alter table public.forma_google_oauth_states enable row level security;
alter table public.forma_google_connections enable row level security;
alter table public.forma_course_enrollments enable row level security;
revoke all on public.forma_course_drafts,public.forma_google_oauth_states,public.forma_google_connections,public.forma_course_enrollments from anon,authenticated;
grant all on public.forma_course_drafts,public.forma_google_oauth_states,public.forma_google_connections,public.forma_course_enrollments to service_role;
commit;
