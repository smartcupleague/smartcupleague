# Recommend Prediction

Use when the user wants strategic advice for a SmartCup prediction, but has not explicitly asked to submit a transaction.

This recipe is read-only. Do not call `PlaceBet`, `SpendFreebet`, `ClaimMatchReward`, `ClaimRefund`, Oracle writes, DAO writes, or admin methods.

## Inputs

- wallet address, when user-specific eligibility or freebet balance matters
- optional target `match_id`
- optional funding preference: wallet, freebet, or either
- optional risk mode: conservative, balanced, or contrarian

Default risk mode is `balanced`.

## Data Collection

1. Run `skills/preflight.md`.
2. Run `skills/read_matches.md`.
3. If a wallet is provided, run `skills/check_user_bets.md`.
4. If freebet is possible, run `skills/check_freebet_balance.md`.
5. Read `references/safety-matrix.md` so the output can label any proposed follow-up as read-only or write.

Do not browse sports/news/odds data unless the user explicitly asks for external research or the current task clearly requires fresh real-world football context. If using external data, cite sources and separate chain facts from model assumptions.

## Eligibility Filter

For each candidate match:

- include only `result=Unresolved`
- require current time to be more than 10 minutes before `kick_off`
- exclude the match if `QueryBetsByUser(wallet)` already contains the same `match_id`
- if funding preference is freebet, require `FreebetLedger.BalanceOf(wallet) > 0`
- exclude cancelled, finalized, proposed-result, or settlement-only matches

If no match is eligible, say so and show the blocking reason.

## Recommendation Logic

When no external model is available, make a cautious recommendation:

- Prefer explaining that football probability is not fully modeled.
- Use on-chain eligibility, timing, funding source, and risk mode as the primary decision inputs.
- Do not present a score as statistically proven unless supported by data.
- For `conservative`, prefer common plausible scorelines and lower variance.
- For `balanced`, prefer plausible scorelines with some upside.
- For `contrarian`, prefer higher variance only when the user accepts risk.

If real football data or model output is available, combine:

- scoreline probability
- phase weight
- match prize pool
- expected crowding/dilution if available
- user leaderboard objective if available
- funding source and budget

## Output Format

Return a concise recommendation:

```text
Recommendation: <bet / skip / wait>
Match: <match_id> - <home> vs <away>
Suggested score: <home>-<away>
Penalty winner: <none/Home/Away>
Funding: <wallet/freebet/either>
Risk mode: <conservative/balanced/contrarian>
Eligibility: <eligible/not eligible, with reason>
Why: <short reasoning>
Proposed tx: <method and args only, no execution>
Next step: ask for explicit approval before any write
```

For freebet, proposed tx should be:

```text
FreebetLedger/SpendFreebet(bolao_program_id, match_id, amount, predicted_score, predicted_penalty_winner)
```

For wallet-funded prediction, proposed tx should be:

```text
Service/PlaceBet(match_id, predicted_score, predicted_penalty_winner) with attached VARA value
```

Never include a live command without marking it as a proposed follow-up that requires explicit user approval.

If converting the proposed tx into a `vara-wallet` command, use `references/vara-wallet-encoding.md` for CLI JSON args.
