-- Apply once in the selected Supabase project. Existing D1 data remains the source
-- of truth until its export/import is verified and COUNTY_STORAGE is switched.
begin;
create table public.prairie_pilots (
  id text primary key,
  callsign text not null,
  state text not null check (jsonb_typeof(state::jsonb) = 'object'),
  revision bigint not null default 0,
  request_id text,
  season integer not null,
  active_job bigint,
  seen_at bigint not null,
  credit double precision not null default 0.15 check (credit >= 0 and credit <= 2),
  updated_at bigint not null
);
create index prairie_pilots_seen on public.prairie_pilots(seen_at);
create table public.prairie_field_claims (
  id bigint primary key,
  season integer not null,
  owner text not null references public.prairie_pilots(id),
  lease_until bigint not null,
  coverage double precision not null default 0 check (coverage between 0 and 100),
  completed_at bigint
);
create index prairie_claims_season on public.prairie_field_claims(season);
create index prairie_claims_owner on public.prairie_field_claims(owner);
create table public.prairie_payouts (
  job bigint primary key references public.prairie_field_claims(id),
  season integer not null,
  pilot text not null references public.prairie_pilots(id),
  earnings integer not null check (earnings >= 0),
  acres double precision not null check (acres >= 0),
  coverage double precision not null check (coverage between 0 and 100),
  elapsed double precision not null check (elapsed >= 0),
  completed_at bigint not null
);
create index prairie_payouts_season_pilot on public.prairie_payouts(season,pilot);

-- No browser role can read private career state or submit game scores directly.
alter table public.prairie_pilots enable row level security;
alter table public.prairie_field_claims enable row level security;
alter table public.prairie_payouts enable row level security;
revoke all on public.prairie_pilots, public.prairie_field_claims, public.prairie_payouts from public, anon, authenticated;
grant select, insert, update, delete on public.prairie_pilots, public.prairie_field_claims, public.prairie_payouts to service_role;

create function public.prairie_standings(p_season integer)
returns table(pilot text,callsign text,earnings bigint,jobs bigint,acres double precision,"precision" double precision)
language sql stable security invoker set search_path = '' as $$
  select a.pilot,p.callsign,sum(a.earnings),count(*),sum(a.acres),avg(a.coverage)
  from public.prairie_payouts a join public.prairie_pilots p on p.id=a.pilot
  where a.season=p_season group by a.pilot,p.callsign
  order by sum(a.earnings) desc,avg(a.coverage) desc,a.pilot limit 50
$$;
create function public.prairie_claims(p_season integer)
returns table(id bigint,season integer,owner text,lease_until bigint,coverage double precision,completed_at bigint,callsign text)
language sql stable security invoker set search_path = '' as $$
  select f.id,f.season,f.owner,f.lease_until,f.coverage,f.completed_at,p.callsign
  from public.prairie_field_claims f left join public.prairie_pilots p on p.id=f.owner where f.season=p_season
$$;
create function public.prairie_join(p_id text,p_season integer,p_now bigint,p_state text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- A short county-wide lock serializes admissions and writes for this 32-pilot alpha.
  perform pg_catalog.pg_advisory_xact_lock(86420317);
  if (select count(*) from public.prairie_pilots where seen_at > p_now-15000) < 32 then
    insert into public.prairie_pilots(id,callsign,state,season,seen_at,updated_at)
    values(p_id,'Pilot '||upper(left(p_id,6)),p_state,p_season,p_now,p_now)
    on conflict(id) do nothing;
  end if;
end
$$;
create function public.prairie_commit(payload jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_id text := payload->>'id';
  v_now bigint := (payload->>'now')::bigint;
  v_action text := payload->>'action';
  v_selected bigint := (payload->>'selected')::bigint;
  v_expected bigint := (payload->>'expected_claim')::bigint;
  v_finished bigint := (payload->>'finished')::bigint;
  v_active bigint := (payload->>'active_job')::bigint;
  v_old bigint := (payload->>'old_active')::bigint;
  v_coverage double precision := (payload->>'coverage')::double precision;
  p public.prairie_pilots%rowtype;
begin
  -- Advisory lock only required when claiming fields to serialize race conditions;
  -- regular 4Hz flight ticks rely on row-level FOR UPDATE locks on prairie_pilots.
  if v_action='claim' then
    perform pg_catalog.pg_advisory_xact_lock(86420317);
  end if;
  select * into p from public.prairie_pilots where id=v_id for update;
  if not found or p.revision <> (payload->>'revision')::bigint then return false; end if;
  if p.seen_at <= v_now-15000 and (select count(*) from public.prairie_pilots where seen_at > v_now-15000) >= 32 then return false; end if;
  if v_action='claim' and exists(select 1 from public.prairie_field_claims where id=v_selected and (completed_at is not null or (owner<>v_id and lease_until>v_now))) then return false; end if;
  if v_expected is not null and not exists(select 1 from public.prairie_field_claims where id=v_expected and owner=v_id and lease_until>v_now and completed_at is null) then return false; end if;
  update public.prairie_pilots set callsign=payload->>'callsign',state=payload->>'state',revision=p.revision+1,
    request_id=payload->>'request_id',season=(payload->>'season')::integer,active_job=v_active,
    seen_at=v_now,credit=(payload->>'credit')::double precision,updated_at=v_now where id=v_id;
  if v_action='claim' then
    update public.prairie_field_claims set lease_until=0 where owner=v_id and id<>v_selected and completed_at is null;
    insert into public.prairie_field_claims(id,season,owner,lease_until,coverage)
      values(v_selected,(payload->>'season')::integer,v_id,(payload->>'lease_until')::bigint,0)
      on conflict(id) do update set owner=excluded.owner,lease_until=excluded.lease_until,coverage=0;
  elsif v_finished is not null then
    update public.prairie_field_claims set completed_at=v_now,coverage=v_coverage,lease_until=0 where id=v_finished and owner=v_id and completed_at is null;
    if not found then raise exception 'Claim changed before completion'; end if;
    insert into public.prairie_payouts(job,season,pilot,earnings,acres,coverage,elapsed,completed_at)
      values(v_finished,(payload->>'season')::integer,v_id,(payload->'payout'->>'earnings')::integer,
        (payload->'payout'->>'acres')::double precision,v_coverage,(payload->'payout'->>'elapsed')::double precision,v_now);
  elsif v_active is not null then
    update public.prairie_field_claims set coverage=v_coverage,lease_until=case when (payload->>'renew')::boolean then (payload->>'lease_until')::bigint else lease_until end
      where id=v_active and owner=v_id and completed_at is null;
  elsif v_old is not null then
    update public.prairie_field_claims set lease_until=0 where id=v_old and owner=v_id and completed_at is null;
  end if;
  return true;
end
$$;
revoke all on function public.prairie_standings(integer), public.prairie_claims(integer), public.prairie_join(text,integer,bigint,text), public.prairie_commit(jsonb) from public,anon,authenticated;
grant execute on function public.prairie_standings(integer), public.prairie_claims(integer), public.prairie_join(text,integer,bigint,text), public.prairie_commit(jsonb) to service_role;
commit;
