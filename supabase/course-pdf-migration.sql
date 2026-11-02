-- Run once in Forma_Trial_Test only. PDF bytes are in a private Storage bucket.
begin;
create table if not exists public.forma_course_files (
 id text primary key,
 course_id text not null references public.forma_course_drafts(id) on delete cascade,
 user_id text not null references public.forma_users(id) on delete cascade,
 object_key text not null unique,
 file_name text not null,
 size_bytes integer not null check (size_bytes between 1 and 1800000),
 created bigint not null
);
create index if not exists forma_course_files_course on public.forma_course_files(course_id,user_id);
alter table public.forma_course_files enable row level security;
revoke all on public.forma_course_files from anon, authenticated;
grant all on public.forma_course_files to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('forma-course-pdfs','forma-course-pdfs',false,1800000,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=1800000,allowed_mime_types=array['application/pdf'];
commit;