-- Habby Chatbot - Supabase schema

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  name text not null,
  email text,
  phone text not null,
  operation text,
  district text,
  budget_min numeric,
  budget_max numeric,
  notes text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  channel text not null default 'videollamada',
  status text not null default 'confirmed',
  notes text,
  created_at timestamptz not null default now(),
  constraint appointments_valid_range check (ends_at > starts_at)
);

create index if not exists idx_appointments_range on public.appointments (starts_at, ends_at);

create table if not exists public.email_logs (
  id bigint generated always as identity primary key,
  lead_id bigint references public.leads(id) on delete set null,
  appointment_id bigint references public.appointments(id) on delete set null,
  type text not null,
  recipient text not null,
  provider_message_id text,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_created_at on public.leads (created_at desc);
create index if not exists idx_leads_phone on public.leads (phone);
create index if not exists idx_email_logs_created_at on public.email_logs (created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_status_check'
  ) then
    alter table public.leads
      add constraint leads_status_check
      check (status in ('new', 'qualified', 'discarded'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'appointments_status_check'
  ) then
    alter table public.appointments
      add constraint appointments_status_check
      check (status in ('pending', 'confirmed', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'leads_budget_range_check'
  ) then
    alter table public.leads
      add constraint leads_budget_range_check
      check (
        (budget_min is null or budget_min >= 0)
        and (budget_max is null or budget_max >= 0)
        and (
          budget_min is null
          or budget_max is null
          or budget_max >= budget_min
        )
      );
  end if;
end
$$;

alter table public.leads enable row level security;
alter table public.appointments enable row level security;
alter table public.email_logs enable row level security;

revoke all on table public.leads from anon, authenticated;
revoke all on table public.appointments from anon, authenticated;
revoke all on table public.email_logs from anon, authenticated;

-- Nota:
-- Este proyecto usa SUPABASE_SERVICE_ROLE_KEY desde backend Node.
-- service_role puede operar aunque RLS este activo.
