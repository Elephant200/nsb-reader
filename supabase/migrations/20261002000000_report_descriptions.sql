alter table public.question_reports
  add column if not exists description text not null default '';

alter table public.sets enable row level security;
alter table public.packets enable row level security;
alter table public.tossups enable row level security;
alter table public.bonuses enable row level security;
alter table public.question_reports enable row level security;
alter table public.ingestion_runs enable row level security;
