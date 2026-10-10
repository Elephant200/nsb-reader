create extension if not exists pgcrypto;

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  year integer not null,
  difficulty integer not null default 0,
  standard boolean not null default true,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packets (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  name text not null,
  number integer not null,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, number)
);

create table if not exists public.tossups (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  packet_id uuid not null references public.packets(id) on delete cascade,
  number integer not null,
  question text not null,
  question_sanitized text not null,
  answer text not null,
  answer_sanitized text not null,
  category text not null,
  subcategory text not null,
  alternate_subcategory text,
  difficulty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_id, number)
);

create table if not exists public.bonuses (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  packet_id uuid not null references public.packets(id) on delete cascade,
  number integer not null,
  leadin text not null,
  leadin_sanitized text not null,
  parts text[] not null,
  parts_sanitized text[] not null,
  answers text[] not null,
  answers_sanitized text[] not null,
  values integer[],
  category text not null,
  subcategory text not null,
  alternate_subcategory text,
  difficulty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (packet_id, number)
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  set_name text not null,
  packet_name text not null,
  packet_number integer not null,
  source_file text,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists packets_set_number_idx on public.packets(set_id, number);
create index if not exists sets_year_name_idx on public.sets(year desc, name asc);
create index if not exists tossups_packet_number_idx on public.tossups(packet_id, number);
create index if not exists bonuses_packet_number_idx on public.bonuses(packet_id, number);
create index if not exists tossups_filter_idx on public.tossups(category, subcategory, difficulty);
create index if not exists bonuses_filter_idx on public.bonuses(category, subcategory, difficulty);
create index if not exists tossups_search_idx on public.tossups using gin (
  to_tsvector('english', question_sanitized || ' ' || answer_sanitized)
);
create index if not exists bonuses_leadin_search_idx on public.bonuses using gin (
  to_tsvector('english', leadin_sanitized)
);
