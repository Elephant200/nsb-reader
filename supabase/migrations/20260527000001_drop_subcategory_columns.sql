-- NSB has no subcategories. Drop the columns and rebuild indexes without them.

drop index if exists public.tossups_filter_idx;
drop index if exists public.bonuses_filter_idx;

alter table public.tossups
  drop column if exists subcategory,
  drop column if exists alternate_subcategory;

alter table public.bonuses
  drop column if exists subcategory,
  drop column if exists alternate_subcategory;

create index if not exists tossups_filter_idx on public.tossups(category, difficulty);
create index if not exists bonuses_filter_idx on public.bonuses(category, difficulty);
