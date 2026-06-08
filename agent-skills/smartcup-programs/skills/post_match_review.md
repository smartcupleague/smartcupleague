# Post-Match Review

Use after a match result is finalized/cancelled, or when the user asks why a prediction won/lost.

This recipe is read-only on-chain. It may produce a local memory record, but only append it to disk if the user explicitly asks to keep memory or a memory path is already configured.

## Inputs

- wallet address
- `match_id`
- optional memory path, default `.smartcup-agent/predictions.jsonl`

## Data Collection

1. Run `skills/preflight.md`.
2. Normalize wallet to full `0x...`.
3. Query the match:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryMatch --args '[<match_id>]' --idl "$BOLAO_IDL"
```

4. Query user bets:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryBetsByUser --args '["<wallet>"]' --idl "$BOLAO_IDL"
```

5. Query claim status:

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$BOLAO_PROGRAM_ID" Service/QueryWalletClaimStatus --args '["<wallet>"]' --idl "$BOLAO_IDL"
```

## Review Logic

If `QueryMatch` returns `null`, report that the match does not exist.

If the wallet has no bet for `match_id`, report that there is no user prediction to review.

If `result=Unresolved` or `result=Proposed`, set outcome to `pending` and do not judge the prediction yet.

If `result=Cancelled`, set outcome and error label to `cancelled`. If `QueryPendingRefund(wallet) > 0`, propose `ClaimRefund` as a follow-up requiring explicit approval.

If `result=Finalized`, compare:

- predicted `score` against finalized `score`
- predicted `penalty_winner` against finalized `penalty_winner`

Set outcome:

- `won` if score and penalty winner match
- `lost` otherwise

Set error label:

- `no_error_won` for wins
- `football_model` for ordinary misses when no better diagnosis is available
- `strategy_mode` when the prediction was intentionally high-variance and risk mode was the likely issue
- `cutoff_or_execution` when the bet was never submitted, duplicated, late, or failed
- `oracle_or_settlement` when the finalized result or settlement state appears inconsistent
- `unknown` if context is insufficient

## Output Format

Return:

```text
Match: <match_id> - <home> vs <away>
Status: <Finalized/Cancelled/Pending>
Prediction: <home>-<away>, penalties <none/Home/Away>
Actual: <home>-<away>, penalties <none/Home/Away>
Outcome: <won/lost/cancelled/pending/unknown>
Stake: <stake_in_match_pool>
Freebet principal: <freebet_principal>
Claimed: <true/false>
Claimable: <amount_claimable>
Error label: <label>
Lesson: <short lesson>
Next action: <none / claim reward / claim refund / wait>
Memory record: <JSON object or path appended>
```

Do not claim rewards or refunds unless the user explicitly asks for that write action.

## Memory

Read `references/prediction-memory.md` for the schema. If appending to JSONL, append one `post_match_review` record. Keep unknown values as `null`, not invented estimates.
