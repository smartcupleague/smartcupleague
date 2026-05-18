-- ============================================================
-- SmartCup League
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
-- create extension if not exists "pg_cron";  -- uncomment if pg_cron is enabled

-- ============================================================
-- TABLE: vara_prices
-- ============================================================
create table if not exists public.vara_prices (
    id          uuid            primary key default uuid_generate_v4(),
    usd_price   numeric(18, 8)  not null check (usd_price >= 0),
    source      varchar(20)     not null default 'coingecko'
                    check (source in ('coingecko', 'cache', 'database', 'manual')),
    fetched_at  timestamptz     not null,
    created_at  timestamptz     not null default now()
);

create index if not exists idx_vara_prices_fetched_at
    on public.vara_prices (fetched_at desc);

create index if not exists idx_vara_prices_source
    on public.vara_prices (source);

comment on table  public.vara_prices            is 'Historical VARA/USD price snapshots. Newest row = current reference price.';
comment on column public.vara_prices.usd_price  is 'Price in USD with 8 decimal precision';
comment on column public.vara_prices.source     is 'Where this price was obtained from';
comment on column public.vara_prices.fetched_at is 'Timestamp when the price was fetched from the upstream source';

-- ============================================================
-- TABLE: prediction_events
-- ============================================================
create table if not exists public.prediction_events (
    id                uuid            primary key default uuid_generate_v4(),
    wallet_address    text            not null,
    match_id          text            not null,
    amount_planck     numeric(38, 0)  not null default 0 check (amount_planck >= 0),
    match_pool_amount_planck numeric(38, 0) not null default 0 check (match_pool_amount_planck >= 0),
    predicted_outcome varchar(4)      not null check (predicted_outcome in ('home', 'draw', 'away')),
    created_at        timestamptz     not null default now(),

    constraint prediction_events_unique_bet unique (wallet_address, match_id)
);

create index if not exists idx_prediction_events_wallet
    on public.prediction_events (wallet_address);

create index if not exists idx_prediction_events_match
    on public.prediction_events (match_id);

comment on table public.prediction_events is
    'Immutable log of each bet placed. One row per wallet per match.';

-- ============================================================
-- TABLE: claim_events
-- ============================================================
create table if not exists public.claim_events (
    id                uuid            primary key default uuid_generate_v4(),
    wallet_address    text            not null,
    match_id          text            not null,
    amount_planck     numeric(38, 0)  not null default 0 check (amount_planck >= 0),
    is_exact          boolean         not null default false,
    claimed_at        timestamptz     not null default now(),

    constraint claim_events_unique_claim unique (wallet_address, match_id)
);

create index if not exists idx_claim_events_wallet
    on public.claim_events (wallet_address);

create index if not exists idx_claim_events_match
    on public.claim_events (match_id);

comment on table public.claim_events is
    'Immutable log of each reward claimed. One row per wallet per match.';

-- ============================================================
-- TABLE: wallet_profiles
-- ============================================================
create table if not exists public.wallet_profiles (
    wallet_address  text        primary key,
    display_name    text        check (char_length(display_name) between 1 and 30),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_wallet_profiles_name
    on public.wallet_profiles (lower(display_name));

comment on table public.wallet_profiles is
    'Optional display names for wallets. One row per wallet, set by the wallet owner via the frontend.';

-- ============================================================
-- ACCESS MODEL
-- ============================================================

drop policy if exists "public_read_vara_prices" on public.vara_prices;
drop policy if exists "service_role_insert_vara_prices" on public.vara_prices;
drop policy if exists "public_read_prediction_events" on public.prediction_events;
drop policy if exists "service_role_insert_prediction_events" on public.prediction_events;
drop policy if exists "public_read_claim_events" on public.claim_events;
drop policy if exists "service_role_insert_claim_events" on public.claim_events;

alter table public.vara_prices       disable row level security;
alter table public.prediction_events disable row level security;
alter table public.claim_events      disable row level security;


create or replace view public.latest_vara_price as
select id, usd_price, source, fetched_at, created_at
from public.vara_prices
order by fetched_at desc
limit 1;

comment on view public.latest_vara_price is
    'Convenience view that always exposes the most recent VARA/USD price.';


create or replace view public.user_leaderboard_stats as
select
    coalesce(p.wallet_address, c.wallet_address)    as wallet_address,
    wp.display_name                                 as display_name,
    coalesce(p.matches_count, 0)                    as matches_count,
    coalesce(c.exact_count, 0)                      as exact_count,
    coalesce(c.outcome_count, 0)                    as outcome_count,
    coalesce(c.total_claimed_planck, 0)             as total_claimed_planck,
    greatest(
        coalesce(p.last_bet_at,   '1970-01-01'::timestamptz),
        coalesce(c.last_claim_at, '1970-01-01'::timestamptz)
    )                                               as updated_at
from (
    select
        wallet_address,
        count(*)        as matches_count,
        max(created_at) as last_bet_at
    from public.prediction_events
    group by wallet_address
) p
full outer join (
    select
        wallet_address,
        count(*) filter (where is_exact)    as exact_count,
        count(*)                            as outcome_count,
        coalesce(sum(amount_planck), 0)     as total_claimed_planck,
        max(claimed_at)                     as last_claim_at
    from public.claim_events
    group by wallet_address
) c on p.wallet_address = c.wallet_address
left join public.wallet_profiles wp
    on wp.wallet_address = coalesce(p.wallet_address, c.wallet_address);

comment on view public.user_leaderboard_stats is
    'Aggregated leaderboard stats per wallet, enriched with display_name from wallet_profiles.';


create or replace view public.match_pool_stats as
select
    match_id,
    count(*) filter (where predicted_outcome = 'home')                        as home_bets,
    count(*) filter (where predicted_outcome = 'draw')                        as draw_bets,
    count(*) filter (where predicted_outcome = 'away')                        as away_bets,
    coalesce(sum(match_pool_amount_planck) filter (where predicted_outcome = 'home'), 0) as home_planck,
    coalesce(sum(match_pool_amount_planck) filter (where predicted_outcome = 'draw'), 0) as draw_planck,
    coalesce(sum(match_pool_amount_planck) filter (where predicted_outcome = 'away'), 0) as away_planck,
    count(*)                                                                   as total_bets,
    coalesce(sum(match_pool_amount_planck), 0)                                 as total_planck
from public.prediction_events
group by match_id;

comment on view public.match_pool_stats is
    'Per-match 85% match-pool distribution by predicted outcome. Computed from prediction_events.match_pool_amount_planck.';


create or replace function public.cleanup_old_prices()
returns integer
language plpgsql
security definer
as $$
declare
    deleted_count integer;
begin
    delete from public.vara_prices
    where fetched_at < now() - interval '30 days';
    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

comment on function public.cleanup_old_prices is
    'Deletes price records older than 30 days. Returns number of rows deleted.';
