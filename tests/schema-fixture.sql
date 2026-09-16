-- Minimal reconstruction of the inspected existing schema, for isolated tests ONLY.
create role anon; create role authenticated;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema auth,storage to authenticated;
create table auth.users(id uuid primary key,email text);
create type public.user_role as enum('admin','reviewer','encoder','viewer');
create type public.survey_status as enum('draft','submitted','approved','rejected');
create type public.distress_severity as enum('low','medium','high');
create type public.sample_unit_type as enum('random','additional');
create table profiles(id uuid primary key references auth.users,full_name text not null default '',role user_role not null default 'encoder',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create function public.get_my_role() returns user_role language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid()$$;
create table branches(id uuid primary key default gen_random_uuid(),name text not null,description text,created_by uuid references profiles,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table sections(id uuid primary key default gen_random_uuid(),branch_id uuid not null references branches on delete cascade,name text not null,description text,length_meters numeric,width_meters numeric,area_sqm numeric,total_sample_units integer,recommended_sample_units integer,notes text,created_by uuid references profiles,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),pci_score numeric,condition_label text,pci_computed_at timestamptz);
create table sample_units(id uuid primary key default gen_random_uuid(),section_id uuid not null references sections on delete cascade,unit_number integer not null,area_sqm numeric,latitude double precision check(latitude between -90 and 90),longitude double precision check(longitude between -180 and 180),status survey_status not null default 'draft',surveyed_by uuid references profiles,surveyed_at timestamptz,submitted_at timestamptz,reviewed_by uuid references profiles,reviewed_at timestamptz,review_notes text,total_deduct_value numeric,corrected_deduct_value numeric,pci_score numeric,condition_label text,pci_computed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),sample_type sample_unit_type,unique(section_id,unit_number));
create table distress_types(id uuid primary key default gen_random_uuid(),code text unique,name text unique not null,description text,default_unit_of_measure text,is_active boolean not null default true,severity_required boolean not null default true,allowed_severities distress_severity[] not null default array['low','medium','high']::distress_severity[],created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table distress_records(id uuid primary key default gen_random_uuid(),sample_unit_id uuid not null references sample_units on delete cascade,distress_type_id uuid not null references distress_types,severity distress_severity,quantity numeric not null,unit_of_measure text not null,density_percent numeric,deduct_value numeric,notes text,created_by uuid references profiles,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),measurement_details jsonb not null default '{}');
create table distress_photos(id uuid primary key default gen_random_uuid(),sample_unit_id uuid not null references sample_units on delete cascade,distress_record_id uuid references distress_records on delete set null,photo_path text not null,caption text,uploaded_by uuid references profiles,uploaded_at timestamptz not null default now());
create table deduct_value_points(id uuid primary key default gen_random_uuid(),distress_type_id uuid references distress_types,severity distress_severity,density_percent numeric,deduct_value numeric,created_at timestamptz not null default now());
create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
insert into storage.buckets values('sample-unit-photos',false,null,null);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
do $$ declare t text; begin
 foreach t in array array['profiles','branches','sections','sample_units','distress_types','distress_records','distress_photos','deduct_value_points'] loop
  execute format('alter table %I enable row level security',t);
  execute format('grant select,insert,update,delete on %I to authenticated',t);
  execute format('create policy legacy_read on %I for select to authenticated using(true)',t);
  execute format('create policy legacy_manager_write on %I for all to authenticated using(get_my_role() in (''admin'',''reviewer'')) with check(get_my_role() in (''admin'',''reviewer''))',t);
 end loop;
end $$;
