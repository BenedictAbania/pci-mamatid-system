-- Review only. Test after the two existing workflow migrations in a disposable
-- Supabase project first. No PCI algorithm or reference values are introduced.
begin;
alter table public.sample_units add column action_version integer not null default 0;
alter table public.sample_units add column current_approved_computation_id uuid references public.inspection_computations(id);
create table public.approved_results (
  id uuid primary key references public.inspection_computations(id),
  sample_unit_id uuid not null references public.sample_units(id),
  input_revision integer not null, report_snapshot jsonb not null,
  approved_at timestamptz not null, published_at timestamptz,
  is_current boolean not null default true, superseded_at timestamptz,
  check (is_current = (superseded_at is null))
);
create unique index approved_results_one_current on public.approved_results(sample_unit_id) where is_current;
create index approved_results_current_page on public.approved_results(id) where is_current;
create index approved_results_public_page on public.approved_results(id) where published_at is not null;
alter table public.approved_results enable row level security;
revoke all on public.approved_results from public,anon,authenticated;
grant select on public.approved_results to authenticated;

-- Legacy permissive policies cannot override the restrictive staff-only rules.
-- Viewers never receive mutable work rows, raw snapshots, accounts, or comments.
create or replace function lakad_private.can_read_sample(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.sample_units s where s.id=target and (
    lakad_private.role()='admin'
    or (lakad_private.role()='reviewer' and s.reviewer_id=auth.uid())
    or (lakad_private.role()='encoder' and s.assigned_to=auth.uid())));
$$;
create or replace function lakad_private.can_read_section(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select lakad_private.role() in ('admin','reviewer') or (
    lakad_private.role()='encoder' and exists(select 1 from public.sample_units
      where section_id=target and assigned_to=auth.uid()));
$$;
do $$ declare t text; begin
  foreach t in array array['profiles','branches','sections','sample_units','distress_types',
    'distress_records','distress_photos','deduct_value_points','inspection_computations',
    'inspection_history','lakad_settings','lakad_audit'] loop
    execute format('create policy lakad_staff_only on public.%I as restrictive for all to authenticated
      using ((select lakad_private.role()) in (''admin'',''reviewer'',''encoder''))
      with check ((select lakad_private.role()) in (''admin'',''reviewer'',''encoder''))',t);
  end loop;
end $$;
create policy approved_results_read on public.approved_results for select to authenticated using (
  ((select lakad_private.role())='viewer' and published_at is not null) or lakad_private.can_read_sample(sample_unit_id));

-- Minimal routing authorization, without SELECT access to Viewer profiles.
create function public.lakad_session_access() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('role',role,'is_active',is_active) from public.profiles where id=auth.uid();
$$;
revoke all on function public.lakad_session_access() from public,anon;
grant execute on function public.lakad_session_access() to authenticated;

-- Only explicit report fields enter the published feed. Internal input includes
-- actor identities and workflow notes and is NEVER served to Viewers.
create function lakad_private.report_snapshot(c public.inspection_computations) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'sample',jsonb_build_object('id',c.sample_unit_id,'unit_number',c.input_snapshot->'sample'->'unit_number',
      'area_sqm',c.input_snapshot->'sample'->'area_sqm','sample_type',c.input_snapshot->'sample'->'sample_type',
      'surveyed_at',c.input_snapshot->'sample'->'surveyed_at','latitude',c.input_snapshot->'sample'->'latitude',
      'longitude',c.input_snapshot->'sample'->'longitude','inspection_notes',c.input_snapshot->'sample'->'inspection_notes'),
    'road',coalesce(c.input_snapshot->'report_context'->'road',jsonb_build_object(
      'section_id',c.input_snapshot->'sample'->'section_id','section_name','Legacy snapshot: label unavailable',
      'branch_name','Legacy snapshot: label unavailable')),
    'historical_context_available',c.input_snapshot ? 'report_context',
    'distresses',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d->'id','name',coalesce(c.input_snapshot->'report_context'->'distress_names'->>(d->>'distress_type_id'),'Legacy snapshot: label unavailable'),
      'severity',d->'severity','quantity',d->'quantity','unit_of_measure',d->'unit_of_measure',
      'notes',d->'notes','measurement_details',d->'measurement_details'))
      from jsonb_array_elements(c.input_snapshot->'distresses') d),'[]'::jsonb),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p->'id','photo_path',p->'photo_path','caption',p->'caption'))
      from jsonb_array_elements(c.input_snapshot->'photos') p),'[]'::jsonb),
    'edition',c.edition,'reference_id',c.reference_id,'algorithm_version',c.algorithm_version,
    'output',(select jsonb_object_agg(key,value) from jsonb_each(c.output_snapshot)
      where key in ('pci','condition','densities','deduct_values','total_deduct_value','highest_deduct_value',
        'allowable_deducts','q','iterations','max_corrected_deduct_value')));
$$;

-- Fail closed on unverified/ambiguous legacy approvals. Do not fabricate past
-- labels from today's road/catalog rows if historical context was not captured.
insert into public.approved_results(id,sample_unit_id,input_revision,report_snapshot,approved_at,published_at)
select c.id,s.id,c.input_revision,lakad_private.report_snapshot(c),s.reviewed_at,
  case when s.workflow_state='published' then s.reviewed_at end
from public.sample_units s join public.inspection_computations c on c.id=s.computation_id
join public.profiles p on p.id=s.reviewed_by and p.role='reviewer'
where s.workflow_state in ('approved','published') and c.verification='verified'
  and c.input_revision=s.input_revision and c.sample_unit_id=s.id
  and s.reviewed_at is not null and s.reviewed_by=s.reviewer_id
  and s.reviewed_by is distinct from s.surveyed_by and s.reviewed_by is distinct from s.assigned_to
  and jsonb_typeof(c.input_snapshot->'sample')='object'
  and jsonb_typeof(c.input_snapshot->'distresses')='array' and jsonb_typeof(c.input_snapshot->'photos')='array'
  and jsonb_typeof(c.output_snapshot->'pci')='number'
  and (case when jsonb_typeof(c.output_snapshot->'pci')='number' then (c.output_snapshot->>'pci')::numeric end) between 0 and 100
  and jsonb_typeof(c.output_snapshot->'iterations')='array'
  and nullif(c.output_snapshot->>'condition','') is not null;
update public.sample_units s set current_approved_computation_id=r.id
from public.approved_results r where r.sample_unit_id=s.id;

create function lakad_private.lock_approved_result() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Approved snapshots cannot be deleted'; end if;
  if new.id<>old.id or new.sample_unit_id<>old.sample_unit_id or new.input_revision<>old.input_revision
    or new.report_snapshot is distinct from old.report_snapshot or new.approved_at<>old.approved_at
    or (not old.is_current and new.is_current)
    or (old.published_at is not null and new.published_at is distinct from old.published_at)
    or (old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at) then
    raise exception 'Approved snapshots are immutable; create a correction revision';
  end if;
  return new;
end $$;
create trigger lock_approved_result before update or delete on public.approved_results
for each row execute function lakad_private.lock_approved_result();

create function lakad_private.lock_computation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.approved_results where id=old.id) then
    raise exception 'Approved calculation is locked; create a correction revision';
  end if;
  if tg_op='UPDATE' and (new.input_snapshot is distinct from old.input_snapshot
      or new.input_revision<>old.input_revision or new.sample_unit_id<>old.sample_unit_id
      or new.edition<>old.edition or new.id<>old.id) then
    raise exception 'Submitted calculation inputs are immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create function lakad_private.capture_report_context() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.input_snapshot:=new.input_snapshot||jsonb_build_object('report_context',(
    select jsonb_build_object('road',jsonb_build_object('section_id',s.id,'section_name',s.name,
      'branch_id',b.id,'branch_name',b.name,'length_meters',s.length_meters,'width_meters',s.width_meters,
      'area_sqm',s.area_sqm,'start_description',s.start_description,'end_description',s.end_description),
      'distress_names',coalesce((select jsonb_object_agg(t.id::text,t.name) from public.distress_types t
        where t.id in (select (d->>'distress_type_id')::uuid from jsonb_array_elements(new.input_snapshot->'distresses') d)),'{}'::jsonb))
    from public.sample_units u join public.sections s on s.id=u.section_id join public.branches b on b.id=s.branch_id
    where u.id=new.sample_unit_id));
  return new;
end $$;
create trigger capture_report_context before insert on public.inspection_computations
for each row execute function lakad_private.capture_report_context();
create trigger lock_computation before update or delete on public.inspection_computations
for each row execute function lakad_private.lock_computation();

create function lakad_private.lock_inspection() returns trigger language plpgsql set search_path='' as $$
begin
  if old.workflow_state in ('approved','published') then
    if new.workflow_state='draft' and new.input_revision=old.input_revision+1 and new.computation_id is null
      and lakad_private.role()='encoder' and old.assigned_to=auth.uid()
      and new.current_approved_computation_id=old.current_approved_computation_id
      and new.section_id=old.section_id and new.unit_number=old.unit_number then return new; end if;
    if (to_jsonb(new)-array['workflow_state','status','review_notes','reviewed_by','reviewed_at','updated_at','updated_by','action_version','current_approved_computation_id'])
      is distinct from (to_jsonb(old)-array['workflow_state','status','review_notes','reviewed_by','reviewed_at','updated_at','updated_by','action_version','current_approved_computation_id']) then
      raise exception 'Approved inspection is locked; create a correction revision';
    end if;
  end if;
  return new;
end $$;
create trigger lock_inspection before update on public.sample_units for each row execute function lakad_private.lock_inspection();

-- Lock live measurement/evidence rows too, including privileged accidental
-- edits. Correction opens a new working revision before editing these rows.
create function lakad_private.lock_approved_input() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (tg_op<>'INSERT' and exists(select 1 from public.sample_units
      where id=old.sample_unit_id and workflow_state in ('approved','published')))
    or (tg_op<>'DELETE' and exists(select 1 from public.sample_units
      where id=new.sample_unit_id and workflow_state in ('approved','published'))) then
    raise exception 'Approved inspection inputs are locked; create a correction revision';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger lock_approved_measurements before insert or update or delete on public.distress_records
for each row execute function lakad_private.lock_approved_input();
create trigger lock_approved_photos before insert or update or delete on public.distress_photos
for each row execute function lakad_private.lock_approved_input();

-- Keep the existing edit validations behind a transactional revision guard.
alter function lakad_private.inspection_action(uuid,text,jsonb) rename to inspection_action_before_revisions;
create function lakad_private.inspection_action(target uuid,action text,payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.sample_units; c public.inspection_computations; result uuid; r text:=lakad_private.role();
begin
  if auth.uid() is null or r is null then raise exception 'Active authenticated account required'; end if;
  select * into s from public.sample_units where id=target for update;
  if not found or not lakad_private.can_read_sample(target) then raise exception 'Inspection unavailable or outside your assignment'; end if;
  if action in ('approve','return','publish','correct') then
    if not payload ? 'revision' or not payload ? 'version'
      or (payload->>'revision')::integer is distinct from s.input_revision
      or (payload->>'version')::integer is distinct from s.action_version then
      raise exception 'Inspection changed; refresh before reviewing or correcting';
    end if;
  elsif payload ? 'version' and (payload->>'version')::integer is distinct from s.action_version then
    raise exception 'Inspection changed; refresh before saving';
  end if;
  if action='correct' then
    if r is distinct from 'encoder' or s.assigned_to is distinct from auth.uid()
      or s.workflow_state not in ('approved','published') or s.current_approved_computation_id is null then
      raise exception 'Only the assigned Encoder may create a correction of an approved inspection';
    end if;
    if nullif(btrim(payload->>'comments'),'') is null then raise exception 'Correction reason required'; end if;
    update public.sample_units set workflow_state='draft',status='draft',input_revision=input_revision+1,
      computation_id=null,submitted_at=null,reviewed_at=null,reviewed_by=null,review_notes=null,
      pci_score=null,condition_label=null,total_deduct_value=null,corrected_deduct_value=null,pci_computed_at=null where id=target;
    insert into public.inspection_history(sample_unit_id,actor_id,action,comments,revision)
      values(target,auth.uid(),'correct',payload->>'comments',s.input_revision+1);
    result:=target;
  else
    -- Serialize approval with the trusted service's calculation writes too.
    if action in ('approve','publish') then
      select * into c from public.inspection_computations where id=s.computation_id for update;
    end if;
    result:=lakad_private.inspection_action_before_revisions(target,action,payload);
    if action='return' then
      update public.sample_units set input_revision=input_revision+1,computation_id=null where id=target;
    elsif action='approve' then
      update public.approved_results set is_current=false,superseded_at=now() where sample_unit_id=target and is_current;
      insert into public.approved_results(id,sample_unit_id,input_revision,report_snapshot,approved_at)
        values(c.id,target,c.input_revision,lakad_private.report_snapshot(c),now());
      update public.sample_units set current_approved_computation_id=c.id where id=target;
    elsif action='publish' then
      update public.approved_results set published_at=now() where id=s.current_approved_computation_id and is_current and published_at is null;
      if not found then raise exception 'Current approved snapshot required for publication'; end if;
    end if;
  end if;
  update public.sample_units set action_version=action_version+1,updated_at=now(),updated_by=auth.uid() where id=target;
  return result;
end $$;
create or replace function public.lakad_inspection_action(target uuid,action text,payload jsonb default '{}'::jsonb)
returns uuid language sql security definer set search_path='' as $$
  select lakad_private.inspection_action(target,action,payload);
$$;

-- A section result is usable only when ALL constituent calculations are current
-- approved results. No aggregation algorithm or engineering weighting is invented.
create function lakad_private.valid_section_result(target uuid,viewer boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.section_results sr join public.profiles p on p.id=sr.approved_by
    where sr.id=target and p.role='reviewer' and cardinality(sr.sample_computation_ids)>0
      and cardinality(sr.sample_computation_ids)=(select count(distinct cid) from unnest(sr.sample_computation_ids) cid)
      and not exists(select 1 from public.approved_results current_result join public.sample_units u on u.id=current_result.sample_unit_id
        where current_result.is_current and u.section_id=sr.section_id and not current_result.id=any(sr.sample_computation_ids))
      and not exists(select 1 from unnest(sr.sample_computation_ids) cid
        left join public.approved_results a on a.id=cid left join public.sample_units s on s.id=a.sample_unit_id
        where a.id is null or not a.is_current or s.section_id<>sr.section_id or (viewer and a.published_at is null)));
$$;
create policy lakad_valid_section on public.section_results as restrictive for select to authenticated
  using(lakad_private.valid_section_result(id,lakad_private.role()='viewer'));
alter table public.section_results add column road_snapshot jsonb;
create function lakad_private.freeze_section_result() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then raise exception 'Published section results are immutable'; end if;
  new.road_snapshot:=(select a.report_snapshot->'road' from public.approved_results a where a.id=any(new.sample_computation_ids) order by a.id limit 1);
  return new;
end $$;
create trigger freeze_section_result before insert or update or delete on public.section_results
for each row execute function lakad_private.freeze_section_result();
create function public.lakad_section_reports(page_after uuid default null,page_size integer default 50,section_ids uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r text:=lakad_private.role(); begin
  if r is null then raise exception 'Active authenticated account required'; end if;
  return (with valid as (
    select sr.id,sr.section_id,sr.edition,sr.pci,sr.condition,sr.safety,sr.high_severity,sr.affected_area,
      sr.sample_computation_ids,sr.method,sr.weights,sr.published_at,sr.road_snapshot
    from public.section_results sr where lakad_private.valid_section_result(sr.id,r='viewer')
      and (r='viewer' or lakad_private.can_read_section(sr.section_id))
      and not exists(select 1 from public.section_results newer where newer.section_id=sr.section_id
        and (newer.published_at,newer.id)>(sr.published_at,sr.id) and lakad_private.valid_section_result(newer.id,r='viewer'))
  ), ranked as (
    select *,row_number() over(order by pci,(safety or high_severity>0) desc,affected_area desc,id) as rank from valid
  ) select coalesce(jsonb_agg(to_jsonb(x) order by x.rank),'[]'::jsonb) from (
    select * from ranked where (section_ids is null or section_id=any(section_ids))
      and (page_after is null or rank>(select rank from ranked where id=page_after))
    order by rank limit greatest(1,least(coalesce(page_size,50),100))
  )x);
end $$;
create function public.lakad_report_summary() returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('count',count(*),'average',avg((report_snapshot->'output'->>'pci')::numeric))
  from public.approved_results where is_current;
$$;
create function public.lakad_accounts_page(page_after uuid default null,page_size integer default 50)
returns table(id uuid,full_name text,email text,role public.user_role,is_active boolean,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if lakad_private.role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  return query select p.id,p.full_name,u.email::text,p.role,p.is_active,p.created_at,p.updated_at
    from public.profiles p join auth.users u on u.id=p.id where page_after is null or p.id>page_after
    order by p.id limit greatest(1,least(coalesce(page_size,50),100));
end $$;

-- Evidence referenced by ANY approved snapshot, including historical reports,
-- must never be replaced or deleted. Use short-lived signed URLs in the UI.
create function lakad_private.approved_photo(path text,published_only boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.approved_results a where ((lakad_private.role()='viewer' and a.published_at is not null)
      or (lakad_private.can_read_sample(a.sample_unit_id) and (not published_only or a.published_at is not null)))
    and exists(select 1 from jsonb_array_elements(a.report_snapshot->'photos') p where p->>'photo_path'=path));
$$;
drop policy lakad_photo_read on storage.objects;
create policy lakad_photo_read on storage.objects for select to authenticated using (
  bucket_id='sample-unit-photos' and ((lakad_private.role()='viewer' and lakad_private.approved_photo(name,true))
    or exists(select 1 from public.sample_units s where s.id::text=split_part(name,'/',1) and lakad_private.can_read_sample(s.id))));
create policy lakad_photo_scope on storage.objects as restrictive for select to authenticated using (
  bucket_id<>'sample-unit-photos' or (lakad_private.role()='viewer' and lakad_private.approved_photo(name,true))
    or exists(select 1 from public.sample_units s where s.id::text=split_part(name,'/',1) and lakad_private.can_read_sample(s.id)));
create policy lakad_photo_preserve on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'sample-unit-photos' or not lakad_private.approved_photo(name));
create policy lakad_photo_no_replace on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'sample-unit-photos') with check(bucket_id<>'sample-unit-photos');

revoke all on all functions in schema lakad_private from public,anon,authenticated;
grant execute on function lakad_private.role(),lakad_private.can_read_sample(uuid),
  lakad_private.can_read_section(uuid),lakad_private.can_edit_sample(uuid),
  lakad_private.valid_section_result(uuid,boolean),lakad_private.approved_photo(text,boolean) to authenticated;
revoke all on function public.lakad_section_reports(uuid,integer,uuid[]),public.lakad_report_summary(),public.lakad_accounts_page(uuid,integer) from public,anon;
grant execute on function public.lakad_section_reports(uuid,integer,uuid[]),public.lakad_report_summary(),public.lakad_accounts_page(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
