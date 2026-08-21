begin;

-- Keep the database contract in version control. Visitor reads are public
-- metadata only; all owner writes go through the Netlify service-role proxy.
create table if not exists public.photos (
  id text primary key
);

alter table public.photos
  add column if not exists cloudinary_id text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists series text,
  add column if not exists date_taken text,
  add column if not exists location text,
  add column if not exists coordinates text,
  add column if not exists camera text,
  add column if not exists lens text,
  add column if not exists aperture text,
  add column if not exists shutter_speed text,
  add column if not exists iso text,
  add column if not exists focal_length text,
  add column if not exists uploaded_at text,
  add column if not exists order_timestamp bigint,
  add column if not exists starred boolean default false,
  add column if not exists tags text default '';

alter table public.photos
  alter column id set not null,
  alter column starred set default false,
  alter column tags set default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.photos'::regclass
      and contype = 'p'
  ) then
    alter table public.photos
      add constraint photos_pkey primary key (id);
  end if;
end
$$;

create table if not exists public.albums (
  name text primary key
);

alter table public.albums
  add column if not exists description text default '',
  add column if not exists cover_cloudinary_id text default '',
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now();

alter table public.albums
  alter column name set not null,
  alter column description set default '',
  alter column cover_cloudinary_id set default '',
  alter column sort_order set default 0,
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.albums'::regclass
      and contype = 'p'
  ) then
    alter table public.albums
      add constraint albums_pkey primary key (name);
  end if;
end
$$;

alter table public.photos enable row level security;
alter table public.albums enable row level security;

drop policy if exists "public read" on public.photos;
create policy "public read"
  on public.photos
  for select
  to anon, authenticated
  using (true);

drop policy if exists "public read" on public.albums;
create policy "public read"
  on public.albums
  for select
  to anon, authenticated
  using (true);

revoke all privileges on table public.photos
  from public, anon, authenticated;
revoke all privileges on table public.albums
  from public, anon, authenticated;

grant usage on schema public
  to anon, authenticated, service_role;

grant select (
  id,
  cloudinary_id,
  title,
  description,
  series,
  date_taken,
  location,
  camera,
  lens,
  aperture,
  shutter_speed,
  iso,
  focal_length,
  uploaded_at,
  order_timestamp,
  starred
) on public.photos to anon, authenticated;

grant select (
  name,
  description,
  cover_cloudinary_id,
  sort_order,
  created_at
) on public.albums to anon, authenticated;

grant select, insert, update, delete
  on public.photos, public.albums
  to service_role;

notify pgrst, 'reload schema';

commit;
