# Podium Result Query Gtest

Date: 2026-06-26

## Scope

Expose `podium_result: Option<PodiumResult>` through `query_state` so clients receive `None` before podium finalization and `Some(PodiumResult)` after `finalize_podium`.

## Command

```bash
cargo test
```

Run from:

```bash
smart-programs/BolaoCore-Program
```

## Result

Passed.

- `tests/test.rs`: 54 passed, 0 failed
- New coverage: `query_state_exposes_optional_podium_result`
- The new test asserts `podium_result.is_none()` before finalization and validates champion, runner-up, and third-place values after `finalize_podium`.

## Notes

The run emitted non-fatal `wasm-opt not found` warnings for local optimization, but the suite completed successfully.
