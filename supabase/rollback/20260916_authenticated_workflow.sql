-- ===========================================================================
-- MANUAL, NOT an auto-applied migration. Back up first. Never apply without approval.
-- Restores the old application schema only if new workflow data has not been used.
-- Original broad read policies remain in place after rollback: do not expose the old
-- application to viewer/encoder users without a separate security review.
-- ===========================================================================

begin;

do $$ begin
 if exists(select 1 from public.inspection_history) or exists(select 1 from public.inspection_computations)
 or exists(select 1 from public.section_results) or exists(select 1 from public.lakad_audit)
 or exists(select 1 from public.profiles where not is_active)
 or exists(select 1 from public.sections where homogeneous_confirmed_by is not null)
 or exists(select 1 from public.sample_units where workflow_state='planned') then
   raise exception 'Rollback refused: workflow data or access changes exist. Export/back up and engineer a data-preserving rollback first.';
 end if;
end $$;

drop policy if exists lakad_photo_read on storage.objects;
drop policy if exists lakad_photo_insert on storage.objects;
drop policy if exists lakad_photo_delete on storage.objects;
-- Keep private bucket and MIME/size limits: removing security limits is unnecessary.

do $$ declare t text; begin
 foreach t in array array['sample_units','sections','branches','distress_records','distress_photos','profiles'] loop
   execute format('drop policy if exists lakad_scope on public.%I',t);
 end loop;
 foreach t in array array['sample_units','distress_records','distress_photos','profiles'] loop
   execute format('drop policy if exists lakad_no_direct_insert on public.%I',t);
   execute format('drop policy if exists lakad_no_direct_update on public.%I',t);
   execute format('drop policy if exists lakad_no_direct_delete on public.%I',t);
 end loop;
 foreach t in array array['branches','sections','distress_types','deduct_value_points'] loop
   execute format('drop policy if exists lakad_active_write on public.%I',t);
 end loop;
end $$;

drop policy if exists lakad_reference on public.deduct_value_points;
drop policy if exists lakad_reference on public.distress_types;

drop trigger if exists lakad_inventory_guard on public.sections;
drop trigger if exists lakad_inventory_guard on public.branches;

drop function if exists public.lakad_inspection_action(uuid,text,jsonb), public.lakad_manage_account(uuid,public.user_role,boolean), public.lakad_accounts(), public.lakad_plan_samples(uuid,jsonb), public.lakad_additional_sample(uuid,jsonb), public.lakad_save_settings(jsonb), public.lakad_save_distress_type(uuid,jsonb);

alter table public.sample_units drop column if exists computation_id;

drop table if exists public.inspection_history,public.inspection_computations,public.section_results,public.lakad_audit,public.lakad_settings;

drop function if exists lakad_private.inspection_action(uuid,text,jsonb),lakad_private.manage_account(uuid,public.user_role,boolean),lakad_private.accounts(),lakad_private.plan_samples(uuid,jsonb),lakad_private.additional_sample(uuid,jsonb),lakad_private.save_settings(jsonb),lakad_private.save_distress_type(uuid,jsonb),lakad_private.guard_inventory();
drop function if exists lakad_private.can_read_section(uuid),lakad_private.can_read_sample(uuid),lakad_private.can_edit_sample(uuid),lakad_private.role();

drop schema if exists lakad_private;

alter table public.sample_units drop column if exists workflow_state,drop column if exists assigned_to,drop column if exists reviewer_id,drop column if exists start_m,drop column if exists end_m,drop column if exists inspection_notes,drop column if exists no_distress_confirmed,drop column if exists input_revision,drop column if exists created_by,drop column if exists updated_by;
alter table public.distress_types drop constraint if exists lakad_distress_unit;
alter table public.distress_types drop column if exists severity_required, drop column if exists allowed_severities, drop column if exists updated_at;
alter table public.sections drop column if exists start_description,drop column if exists end_description,drop column if exists pavement_type,drop column if exists homogeneous_confirmed_by,drop column if exists homogeneous_confirmed_at,drop column if exists latitude,drop column if exists longitude,drop column if exists updated_by;
alter table public.branches drop column if exists location,drop column if exists administrative_status,drop column if exists updated_by;
alter table public.profiles drop column if exists is_active;
alter table public.distress_records drop column if exists created_by, drop column if exists measurement_details, drop column if exists updated_at;
alter table public.distress_photos drop column if exists uploaded_by;

commit;

