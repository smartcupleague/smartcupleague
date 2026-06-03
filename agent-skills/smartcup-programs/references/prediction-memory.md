# SmartCup Prediction Memory

Use prediction memory to make SmartCup recommendations auditable and to improve future strategy. Memory is local/off-chain and must never contain private keys, seeds, mnemonics, or secrets.

## Storage

Default local file when the user asks to keep memory:

```text
.smartcup-agent/predictions.jsonl
```

Use JSON Lines: one complete JSON object per line. If the user provides another path, use that path. Ask before creating a new memory file unless the task explicitly says to record memory.

## Decision Record Schema

Create a record when the agent recommends or submits a prediction.

```json
{
  "schema_version": 1,
  "record_type": "prediction_decision",
  "created_at": "2026-06-03T00:00:00.000Z",
  "network": "mainnet",
  "tournament_id": "smartcup-mainnet",
  "wallet": "0x...",
  "match_id": 0,
  "phase": "",
  "home": "",
  "away": "",
  "kick_off": 0,
  "risk_mode": "balanced",
  "funding": "wallet|freebet|either",
  "stake_value": "0",
  "stake_units": "human|raw",
  "prediction": {
    "score": { "home": 0, "away": 0 },
    "penalty_winner": null
  },
  "eligibility": {
    "eligible": true,
    "reasons": []
  },
  "strategy": {
    "recommendation": "bet|skip|wait",
    "objective": "leaderboard_plus_payout",
    "confidence": "low|medium|high",
    "assumptions": []
  },
  "model": {
    "score_probability": null,
    "outcome_probability": null,
    "crowd_dilution_estimate": null,
    "leaderboard_delta_estimate": null
  },
  "proposed_tx": {
    "program_id": "0x...",
    "method": "Service/PlaceBet",
    "args": [],
    "value": "0"
  },
  "execution": {
    "submitted": false,
    "tx_hash": null,
    "message_id": null,
    "submitted_at": null
  },
  "notes": ""
}
```

Keep unknown model values as `null`; do not invent precision.

## Review Record Schema

Create a review record after a match becomes `Finalized` or `Cancelled`, or when the user asks for a post-match review.

```json
{
  "schema_version": 1,
  "record_type": "post_match_review",
  "created_at": "2026-06-03T00:00:00.000Z",
  "network": "mainnet",
  "wallet": "0x...",
  "match_id": 0,
  "match_status": "Finalized|Cancelled|Unresolved|Proposed",
  "prediction": {
    "score": { "home": 0, "away": 0 },
    "penalty_winner": null
  },
  "actual_result": {
    "score": { "home": 0, "away": 0 },
    "penalty_winner": null
  },
  "stake_in_match_pool": "0",
  "freebet_principal": "0",
  "claimed": false,
  "claim_status": {
    "amount_claimable": "0",
    "already_claimed": false
  },
  "outcome": "won|lost|cancelled|pending|unknown",
  "error_label": "no_error_won|football_model|crowd_model|strategy_mode|cutoff_or_execution|oracle_or_settlement|cancelled|pending|unknown",
  "lessons": [],
  "next_actions": []
}
```

## Error Labels

- `no_error_won`: prediction matched the finalized result.
- `football_model`: result missed because the match forecast was wrong.
- `crowd_model`: forecast was plausible, but payout/crowd assumptions were wrong.
- `strategy_mode`: score was chosen for the wrong risk objective.
- `cutoff_or_execution`: eligible recommendation failed due to timing, gas, wallet, duplicate bet, or tx failure.
- `oracle_or_settlement`: chain/oracle state appears inconsistent with expected result or settlement.
- `cancelled`: match was cancelled.
- `pending`: match is not yet reviewable.
- `unknown`: not enough data.

## Privacy

- Store wallet addresses only when needed for auditing.
- Do not store seeds, mnemonics, private keys, API keys, or raw credential files.
- Keep user notes concise and avoid unnecessary personal data.
