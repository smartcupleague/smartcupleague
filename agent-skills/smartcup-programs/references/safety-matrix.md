# SmartCup Safety Matrix

Use this matrix before any SmartCup write action. Read IDL for exact signatures; this file classifies operational risk and confirmation requirements.

## Confirmation Rules

- Read-only queries may run after `vara-wallet` preflight.
- User writes require explicit user instruction, dry-run first, and confirmation of program ID, method, args, wallet/account, network, and attached value if any.
- Admin/operator/oracle writes require explicit user instruction plus confirmation that the signing account has the required role.
- Governance writes require explicit user instruction plus proposal/vote/execution details.
- Dangerous/emergency/migration methods require a separate, explicit confirmation that names the method and acknowledges mainnet risk.
- Never ask for seed, mnemonic, or private keys in chat.

## Risk Levels

| Level | Meaning | Agent behavior |
| --- | --- | --- |
| Read | Query only, no state change | Safe after preflight; summarize relevant fields |
| User Write | User-initiated action for own position | Dry-run first; execute only after explicit confirmation |
| Admin Write | Role-gated administrative action | Verify role/state; dry-run first; execute only after explicit confirmation |
| Oracle Write | Result/price feeder or oracle admin action | Verify feeder/admin/operator role; dry-run first; execute only after explicit confirmation |
| Governance Write | DAO proposal/vote/execution/factory action | Verify proposal details and account intent; dry-run first |
| Dangerous | Emergency funds/admin/migration-sensitive action | Do not execute unless user explicitly names the method and confirms mainnet risk |
| Migration | State migration/import/export/lock flow | Do not execute unless the user explicitly requests migration work |

## BolaoCore: Read

| Method | Notes |
| --- | --- |
| `ContractVersion4` | Version check |
| `QueryState` | Canonical tournament state |
| `QueryMatch` | One match |
| `QueryMatchesByPhase` | Matches by phase |
| `QueryBetsByUser` | User predictions |
| `QueryWalletClaimStatus` | Match reward claim status |
| `QueryFinalPrizeClaimStatus` | Final prize claim status |
| `QueryPendingRefund` | Refund amount |
| `QueryUserPoints` | Points |
| `QueryLockedVara` | Locked liabilities |
| `ExportMetadata` | Migration read; use only in migration context |
| `ExportStatePage` | Migration read; use only in migration context |

## BolaoCore: User Write

| Method | Required checks |
| --- | --- |
| `PlaceBet` | No existing bet, `Unresolved`, more than 10 minutes before `kick_off`, attached value confirmed |
| `ClaimMatchReward` | Match `Finalized`, `settlement_prepared=true`, user bet exists, `claimed=false` |
| `ClaimRefund` | `QueryPendingRefund(user) > 0` |
| `ClaimFinalPrize` | `QueryFinalPrizeClaimStatus(wallet).eligible=true`, amount > 0, not already claimed |
| `SubmitPodiumPick` | User confirms podium picks; verify current tournament lock rules from state/IDL |

## BolaoCore: Admin Write

| Method | Required checks |
| --- | --- |
| `AddAdmin` | Existing admin signer; confirm new admin address |
| `RemoveAdmin` | Existing admin signer; never remove last admin |
| `AddOperator` | Admin signer; confirm operator address |
| `RemoveOperator` | Admin signer; confirm operator address |
| `RegisterPhase` | Admin/operator signer; confirm phase name/time/weight |
| `RegisterMatch` | Admin/operator signer; confirm phase, teams, kickoff |
| `SetOracleAuthorized` | Admin signer; confirm oracle ID and authorization bool |
| `SetFreebetLedger` | Admin signer; confirm ledger ID or `null` |
| `SetPriceOracle` | Admin signer; confirm oracle ID |
| `SetPriceStalenessLimit` | Admin signer; confirm duration |
| `SetTreasury` | Admin signer; confirm old/new treasury |
| `RefreshVaraPrice` | Admin/operator signer; confirm oracle ID |
| `CancelProposedResult` | Admin/authorized flow; verify result is `Proposed` |
| `CancelMatch` | Admin/operator flow; terminal cancellation, verify no finalized result |
| `FinalizeResult` | Admin/settlement flow; verify oracle/proposal state |
| `FinalizePodium` | Admin flow; confirm champion/runner-up/third-place |
| `FinalizeFinalPrizePool` | Admin flow; verify final prize readiness |
| `SweepMatchDustToFinalPrize` | Admin flow; verify settlement/dust state |
| `WithdrawProtocolFees` | Admin flow; confirm amount/treasury expectation |
| `WithdrawFinalPrizeRoundingDust` | Admin flow; confirm final prize finalized |
| `WithdrawSurplusVara` | Admin flow; verify surplus only |
| `AdminPushRefund` | Admin refund action; verify pending refund and user |

## BolaoCore: Dangerous Or Internal

| Method | Risk |
| --- | --- |
| `PlaceBetFromFreebetLedger` | Internal ledger entrypoint; agents should not call directly |
| `ProposeFromOracle` | Oracle integration entrypoint; use only with explicit admin/oracle workflow |
| `ProposeResult` | Direct result proposal; can affect settlement flow |
| `ForceWithdrawVara` | Emergency withdrawal; high risk |
| `DrainVaraTo` | Migration drain; high risk |
| `LockForMigration` | Blocks user writes; migration-only |
| `ImportMetadata` | Migration import; migration-only |
| `ImportStatePage` | Migration import; migration-only |
| `SealMigration` | Re-enables imported contract; migration-only |

## FreebetLedger

| Method | Risk | Required checks |
| --- | --- | --- |
| `Admin`, `Admins`, `BalanceOf`, `GetGrant`, `GetPendingSpendCount`, `IsBetProgramAuthorized`, `SurplusVara`, `TotalLiability` | Read | Safe after preflight |
| `SpendFreebet` | User Write | Balance covers amount, BolaoCore authorized, no existing bet, match open |
| `Grant` | Admin Write | Admin signer; confirm recipient, grant ID, reason, and resulting amount semantics |
| `ReturnFreebet` | Admin/Internal | Usually called by BolaoCore flow; do not call manually without explicit recovery request |
| `AuthorizeBetProgram` | Admin Write | Confirm program ID exactly |
| `RevokeBetProgram` | Admin Write | Confirm program ID and impact on freebet betting |
| `AddAdmin`, `RemoveAdmin` | Admin Write | Confirm signer role and target admin |
| `WithdrawSurplusVara` | Admin Write | Verify surplus only |
| `ForceWithdrawVara` | Dangerous | Emergency withdrawal; explicit mainnet-risk confirmation required |

## Oracle

| Method | Risk | Required checks |
| --- | --- | --- |
| `ContractVersion4`, `QueryState`, `QueryAllResults`, `QueryFeederSubmissions`, `QueryMatchResult`, `QueryPendingMatches`, `QueryVaraUsdPrice` | Read | Safe after preflight |
| `SubmitResult` | Oracle Write | Authorized feeder signer, registered match, one submission per feeder |
| `ForceFinalizeResult` | Oracle Write | Admin/operator signer; bypasses consensus |
| `CancelResult` | Oracle Write | Admin signer; verify result is not already finalized |
| `SetVaraUsdPrice` | Oracle Write | Authorized feeder signer; verify price units are micro-USD |
| `RegisterMatch` | Oracle Write | Admin/operator signer; mirror BolaoCore metadata |
| `SetFeederAuthorized` | Oracle Write | Admin signer; confirm feeder and bool |
| `SetConsensusThreshold` | Oracle Write | Admin signer; ensure threshold remains reachable |
| `SetBolaoProgram` | Oracle Write | Admin signer; confirm BolaoCore ID |
| `ProposeAdmin`, `AcceptAdmin`, `AddAdmin`, `RemoveAdmin`, `AddOperator`, `RemoveOperator` | Admin Write | Confirm role and target address |
| `WithdrawVara` | Admin Write | Confirm amount/to |
| `ForceWithdrawVara` | Dangerous | Emergency withdrawal; explicit mainnet-risk confirmation required |

## DAO

| Method | Risk | Required checks |
| --- | --- | --- |
| `QueryState`, `QueryProposals`, `QueryProposal`, `QueryVote`, `QueryBolaoInstances` | Read | Safe after preflight |
| `CreateProposal` | Governance Write | Confirm `ProposalKind`, description, target BolaoCore, and consequences |
| `Vote` | Governance Write | Confirm proposal ID and `Yes`/`No`/`Abstain` |
| `FinalizeProposal` | Governance Write | Confirm voting ended and expected status |
| `Execute` | Governance Write | Confirm proposal succeeded and execution effect |
| `DeployBolao` | Dangerous/Governance | Deploys new BolaoCore; confirm admin, salt, gas limit, code registration |
| `RegisterBolaoCode` | Dangerous/Admin | Confirm exact `code_id` |
| `SetBolaoProgram` | Admin Write | Updates default BolaoCore; confirm old/new program |
| `SetOwner` | Dangerous/Admin | Ownership transfer; explicit mainnet-risk confirmation required |
| `AddAdmin`, `RemoveAdmin` | Admin Write | Confirm signer role and target admin |
| `WithdrawVara` | Admin Write | Confirm amount/to |
| `ForceWithdrawVara` | Dangerous | Emergency withdrawal; explicit mainnet-risk confirmation required |

## ProposalKind Risk Notes

| ProposalKind | Risk |
| --- | --- |
| `AddPhase` | Admin/governance tournament schedule change |
| `AddMatch` | Admin/governance tournament schedule change |
| `SetOracleAuthorized` | Changes result authority |
| `FinalizePodium` | Affects final prize eligibility |
| `CancelMatchResult` | Can affect result/settlement flow |
| `DeployBolao` | Deploys new contract |
| `SetQuorum` | Changes governance security |
| `SetVotingPeriod` | Changes governance timing |
| `SetDefaultBolao` | Redirects future governance dispatch |
