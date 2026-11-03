-- Staging-only, service-role callable. Generation is previewed by the instructor
-- and stored in one transaction after explicit approval.
create or replace function public.forma_assistant_add_assessments(
 p_user_id text, p_course_id text, p_assignments jsonb, p_quizzes jsonb,
 p_audit_id text, p_now bigint
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare row_owner text; row_outline jsonb; item jsonb; added_assignments int := 0; added_quizzes int := 0;
begin
 select user_id,outline into row_owner,row_outline from public.forma_course_drafts
 where id=p_course_id for update;
 if row_owner is distinct from p_user_id or coalesce(row_outline->>'archived','false')='true' then
   return jsonb_build_object('saved',false,'reason','not_owned');
 end if;
 if jsonb_typeof(p_assignments) <> 'array' or jsonb_typeof(p_quizzes) <> 'array'
    or jsonb_array_length(p_assignments)>4 or jsonb_array_length(p_quizzes)>4
    or jsonb_array_length(p_assignments)+jsonb_array_length(p_quizzes)=0 then
   raise exception 'Invalid assessment collection';
 end if;
 if exists(select 1 from public.forma_assistant_audit
           where id=p_audit_id and user_id=p_user_id and operation='add-generated-assessments') then
   return jsonb_build_object('saved',true,'replayed',true);
 end if;
 for item in select value from jsonb_array_elements(p_assignments) loop
   insert into public.forma_assignments(id,course_id,title,instructions,due_at,max_points,weight,created,late_minutes,late_penalty_percent)
   values(item->>'id',p_course_id,item->>'title',item->>'instructions',null,100,1,p_now,0,0);
   added_assignments := added_assignments+1;
 end loop;
 for item in select value from jsonb_array_elements(p_quizzes) loop
   insert into public.forma_quizzes(id,course_id,title,questions,max_attempts,due_at,created)
   values(item->>'id',p_course_id,item->>'title',item->'questions',1,null,p_now);
   added_quizzes := added_quizzes+1;
 end loop;
 insert into public.forma_assistant_audit(id,user_id,domain,resource_id,operation,created,metadata)
 values(p_audit_id,p_user_id,'course',p_course_id,'add-generated-assessments',p_now,
        jsonb_build_object('assignments',added_assignments,'quizzes',added_quizzes));
 return jsonb_build_object('saved',true,'assignments',added_assignments,'quizzes',added_quizzes);
end
$$;
revoke all on function public.forma_assistant_add_assessments(text,text,jsonb,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.forma_assistant_add_assessments(text,text,jsonb,jsonb,text,bigint) to service_role;
