# DAO Read Proposals

Use for read-only governance inspection.

## DAO State

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$DAO_PROGRAM_ID" Service/QueryState --idl "$DAO_IDL"
```

Inspect `owner`, `admins`, `bolao_program`, `quorum_bps`, `voting_period`, `proposal_count`, `bolao_code_registered`, and `bolao_instance_count`.

## Proposals

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$DAO_PROGRAM_ID" Service/QueryProposals --idl "$DAO_IDL"
```

## One Proposal

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$DAO_PROGRAM_ID" Service/QueryProposal --args '[<proposal_id>]' --idl "$DAO_IDL"
```

## Vote By Wallet

```bash
vara-wallet --network "$SMARTCUP_NETWORK" --json call "$DAO_PROGRAM_ID" Service/QueryVote --args '[<proposal_id>,"<wallet>"]' --idl "$DAO_IDL"
```

Do not create, vote, finalize, execute, deploy, or register code unless the user explicitly requests that governance write.
