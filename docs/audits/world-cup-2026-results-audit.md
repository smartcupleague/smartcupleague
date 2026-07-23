# World Cup 2026 Results Audit

Generated from finalized Vara mainnet state at block
`34869504` (`0xa688865f46b5fc57a4a20dfb9e521c42bf9ec6d91af39d4d14e5384d28a192c8`).

## Reconciliation

- Program: `0x3fec9d4b68f95917e572e03f8615b2512b8a5051d462dcacb8e4fdc97e8b4894`
- Matches: 104
- Wallets: 267
- Match predictions: 769
- Championship-pick predictions added to the tournament display: 3
- Consolidated tournament prediction count: 772
- On-chain match total claimed: 4481830.653792311816 VARA
- Reconstructed match total claimed: 4481830.653792311816 VARA
- Wallet match-prize payouts: 3107988.487298595685 VARA
- Freebet principal returned: 1373842.166493716131 VARA
- Final prize pool: 355712.059046285553 VARA
- Snapshot SHA-256: `bb749b9f4803704facf0221404df4d4a4814228bbbf057afdbf9e3a73ad7637e`

Every match's reconstructed claimed total equals its finalized on-chain
`total_claimed` value. Wallet earnings exclude freebet-principal returns.

## Final Prize Winners

| Wallet | Final prize (VARA) | Status at audited block |
| --- | ---: | --- |
| `0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b` | 160070.4265708285 | Claimed |
| `0x12e8c864702d5222d6dc55555584be1d1aec2bdbda528559d7ff616fb4fc226f` | 88928.014761571389 | Unclaimed |
| `0x3aebcf27a685b45aebbfc2e37356a64998ebc73d5fc76b00b91c8f436791375a` | 53356.808856942833 | Claimed |
| `0xb86859c7c896f62392d46cae64716b9e560dc418e9efc436f633f0ec6bb0467d` | 35571.205904628555 | Unclaimed |
| `0x063c82480466e721d9ed2a7968f3c1f2095be77353837ddfc586df3b502d7b5b` | 8892.801476157138 | Unclaimed |
| `0x30523bd7e55fb5047c89eed602876d7b20a4a37241435eb192f12b0736126670` | 8892.801476157138 | Unclaimed |

## Formula

`Total Earned = claimed match-prize wallet payouts + final-prize allocation`

Freebet-principal returns are recorded separately and excluded from Total Earned.
