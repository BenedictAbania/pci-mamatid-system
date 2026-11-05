-- Written 5 November 2026. Versioned to run immediately before
-- 20261103045543_d6433_07_provisional_edition.sql.
-- The original project kept four pre-ASTM prototype distress types without an
-- edition (Alligator Cracking, Longitudinal and Transverse Cracking, Potholes,
-- Weathering and Raveling). Their names collide with the D6433-07 catalog
-- (distress_types_name_key). Only rows with no edition, no ASTM mapping, no
-- measurements and no deduct points are removed. Mapped D6433-24 rows stay.
begin;

do $$
begin
  if exists(
    select 1 from public.distress_types t
    where t.astm_edition is null and t.astm_code is null
      and exists(select 1 from public.distress_records r where r.distress_type_id=t.id)
  ) then
    raise exception 'Legacy distress types are referenced by measurements; resolve before the D6433-07 transition';
  end if;
end $$;

delete from public.distress_types t
where t.astm_edition is null and t.astm_code is null
  and not exists(select 1 from public.distress_records r where r.distress_type_id=t.id)
  and not exists(select 1 from public.deduct_value_points p where p.distress_type_id=t.id);

commit;
