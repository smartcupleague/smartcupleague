alter table public.prediction_events
    add column if not exists match_pool_amount_planck numeric(38, 0)
    not null default 0 check (match_pool_amount_planck >= 0);

update public.prediction_events
set match_pool_amount_planck = floor(amount_planck * 8500 / 10000)
where match_pool_amount_planck = 0
  and amount_planck > 0;

create or replace view public.match_pool_stats as
select
    match_id,
    count(*) filter (where predicted_outcome = 'home')                                   as home_bets,
    count(*) filter (where predicted_outcome = 'draw')                                   as draw_bets,
    count(*) filter (where predicted_outcome = 'away')                                   as away_bets,
    coalesce(sum(match_pool_amount_planck) filter (where predicted_outcome = 'home'), 0) as home_planck,
    coalesce(sum(match_pool_amount_planck) filter (where predicted_outcome = 'draw'), 0) as draw_planck,
    coalesce(sum(match_pool_amount_planck) filter (where predicted_outcome = 'away'), 0) as away_planck,
    count(*)                                                                             as total_bets,
    coalesce(sum(match_pool_amount_planck), 0)                                           as total_planck
from public.prediction_events
group by match_id;

comment on column public.prediction_events.amount_planck is
    'Gross VARA amount paid by the bettor, in planck.';

comment on column public.prediction_events.match_pool_amount_planck is
    '85% match-pool amount used by contract payout math, in planck.';

comment on view public.match_pool_stats is
    'Per-match 85% match-pool distribution by predicted outcome. Computed from prediction_events.match_pool_amount_planck.';
