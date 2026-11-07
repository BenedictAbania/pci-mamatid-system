-- Characteristics captured by the reviewer's "Add section" form: what makes the
-- section different from its neighbours (ASTM D6433 section division criteria).
-- Section ID or name, Length, Width, Area and Notes use existing columns.
begin;

alter table public.sections
  add column if not exists pavement_design text,
  add column if not exists construction_history text,
  add column if not exists traffic_classification text,
  add column if not exists pavement_condition text;

commit;
