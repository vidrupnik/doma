-- DOMA: zaženi enkrat v Supabase > SQL Editor > New query > Run
create table if not exists items (
  id text primary key,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists items_updated on items (updated_at);

create or replace function touch() returns trigger language plpgsql as $$
begin new.updated_at = clock_timestamp(); return new; end $$;
drop trigger if exists items_touch on items;
create trigger items_touch before insert or update on items for each row execute function touch();

alter table items enable row level security;
drop policy if exists family_all on items;
create policy family_all on items for all to anon using (true) with check (true);

-- začetne nagrade in projekti
insert into items (id, kind, data) values
 ('r-vecerja','reward','{"title":"Izbereš večerjo","group":false,"cost":300,"created":0,"claims":[]}'),
 ('r-opravilo','reward','{"title":"Teden brez enega opravila","group":false,"cost":800,"created":0,"claims":[]}'),
 ('r-pica','reward','{"title":"Družinska pica večer 🍕","group":true,"cost":2000,"created":0,"claims":[]}'),
 ('r-izlet','reward','{"title":"Družinski izlet","group":true,"cost":6000,"created":0,"claims":[]}'),
 ('pr-1','project','{"title":"Odpeljati odvečen material","cat":"Dovoz","desc":"","xp":200,"due":"","owner":null,"createdBy":"Vid"}'),
 ('pr-2','project','{"title":"Priprava za nadstrešek","cat":"Dovoz","desc":"","xp":300,"due":"","owner":null,"createdBy":"Vid"}')
on conflict (id) do nothing;
