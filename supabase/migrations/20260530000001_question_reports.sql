create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_type text not null check (question_type in ('tossup', 'bonus')),
  question_id uuid not null,
  reason text not null default 'thrown-out',
  created_at timestamptz not null default now()
);

create index if not exists question_reports_question_id_idx on public.question_reports(question_id);
