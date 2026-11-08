-- Section Summaries: one row per current, valid section result with the counts and
-- frozen sample results the summary and its Computation tab need. Visibility follows
-- lakad_section_reports: a Viewer sees only sections whose every sample is published.
begin;
create or replace function public.lakad_section_summaries(
  filter_branch text default null, filter_section text default null, filter_condition text default null,
  filter_sample_type text default null, filter_search text default null,
  page_offset integer default 0, page_size integer default 5
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=lakad_private.role(); term text:=nullif(btrim(left(coalesce(filter_search,''),80)),'');
begin
  if r is null then raise exception 'Active authenticated account required'; end if;
  return (with valid as (
    select sr.* from public.section_results sr
    where lakad_private.valid_section_result(sr.id,r='viewer')
      and (r='viewer' or lakad_private.can_read_section(sr.section_id))
      and not exists(select 1 from public.section_results newer where newer.section_id=sr.section_id
        and (newer.published_at,newer.id)>(sr.published_at,sr.id) and lakad_private.valid_section_result(newer.id,r='viewer'))
  ), summaries as (
    select v.id, v.section_id, v.pci, v.condition, v.method, v.published_at,
      coalesce(v.road_snapshot->>'section_name', s.name) as section_name,
      coalesce(v.road_snapshot->>'branch_name', b.name) as branch_name,
      s.area_sqm, s.total_sample_units, cardinality(v.sample_computation_ids) as inspected,
      (select coalesce(jsonb_agg(jsonb_build_object(
          'id',a.id,'unit_number',(a.report_snapshot->'sample'->>'unit_number')::integer,
          'sample_type',a.report_snapshot->'sample'->>'sample_type',
          'area_sqm',(a.report_snapshot->'sample'->>'area_sqm')::numeric,
          'pci',(a.report_snapshot->'output'->>'pci')::numeric,
          'condition',a.report_snapshot->'output'->>'condition')
        order by (a.report_snapshot->'sample'->>'unit_number')::integer),'[]'::jsonb)
       from public.approved_results a where a.id=any(v.sample_computation_ids)) as samples
    from valid v join public.sections s on s.id=v.section_id join public.branches b on b.id=s.branch_id
  ), filtered as (
    select * from summaries x
    where (filter_branch is null or x.branch_name=filter_branch)
      and (filter_section is null or x.section_name=filter_section)
      and (filter_condition is null or x.condition=filter_condition)
      and (filter_sample_type is null or exists(select 1 from jsonb_array_elements(x.samples) e where e->>'sample_type'=filter_sample_type))
      and (term is null or x.section_name ilike '%'||term||'%' or x.branch_name ilike '%'||term||'%')
  ) select jsonb_build_object(
      'total',(select count(*) from filtered),
      'rows',(select coalesce(jsonb_agg(to_jsonb(f) order by f.section_name,f.id),'[]'::jsonb) from (
        select * from filtered order by section_name,id
        offset greatest(0,coalesce(page_offset,0)) limit greatest(1,least(coalesce(page_size,5),100))) f),
      'options',(select coalesce(jsonb_agg(distinct jsonb_build_object('branch',branch_name,'section',section_name)),'[]'::jsonb) from summaries)));
end $$;
revoke all on function public.lakad_section_summaries(text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.lakad_section_summaries(text,text,text,text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
