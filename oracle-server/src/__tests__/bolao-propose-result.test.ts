import { describe, it, expect, vi } from 'vitest';

// ── proposeResult builder shape ───────────────────────────────────────────────
//
// BolaoService.proposeResult MUST encode final_score as the Score STRUCT {home, away},
// NOT as two flattened u8 args (oracle.ts trap).
//
// We test the constructed TransactionBuilder args by mocking @polkadot/types and sails-js
// at the module level so the BolaoProgram constructor can run without a real GearApi.

// Capture TransactionBuilder constructor calls so we can inspect args
const capturedArgs: unknown[][] = [];

vi.mock('sails-js', () => {
  class TransactionBuilder<_T> {
    constructor(
      _api: unknown,
      _registry: unknown,
      _method: string,
      args: unknown[],
      _typeStr: string,
      _returnType: string,
      _programId: unknown,
    ) {
      capturedArgs.push(args);
    }
  }
  return {
    TransactionBuilder,
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000000000000000000000000000',
  };
});

vi.mock('@polkadot/types', () => {
  class TypeRegistry {
    setKnownTypes() {}
    register() {}
  }
  return { TypeRegistry };
});

// Import after mocks are set up
const { BolaoProgram } = await import('../bolao');

const FAKE_API = {} as any;
const FAKE_PROGRAM_ID = '0x' + '01'.repeat(32) as `0x${string}`;

function makeProgram() {
  capturedArgs.length = 0;
  return new BolaoProgram(FAKE_API, FAKE_PROGRAM_ID);
}

describe('BolaoService.proposeResult — builder shape', () => {
  it('uses service name "Service" and method name "ProposeResult"', () => {
    const program = makeProgram();
    program.service.proposeResult(1n, 2, 1, null);
    const args = capturedArgs[0];
    expect(args[0]).toBe('Service');
    expect(args[1]).toBe('ProposeResult');
  });

  it('passes match_id as the third arg', () => {
    const program = makeProgram();
    program.service.proposeResult(42n, 3, 2, null);
    expect(capturedArgs[0][2]).toBe(42n);
  });

  it('encodes final_score as a Score STRUCT {home, away} — NOT two flattened u8 args', () => {
    const program = makeProgram();
    program.service.proposeResult(1n, 3, 1, null);
    const scoreArg = capturedArgs[0][3];
    // CRITICAL: must be an object with home/away keys, not two separate number args
    expect(scoreArg).toEqual({ home: 3, away: 1 });
    // The 5th arg (index 4) must be penalty_winner, not a second score number
    expect(typeof capturedArgs[0][4]).not.toBe('number');
  });

  it('passes penalty_winner as the fifth arg (index 4)', () => {
    const program = makeProgram();
    program.service.proposeResult(1n, 2, 2, 'Home');
    const penaltyArg = capturedArgs[0][4];
    expect(penaltyArg).toBe('Home');
  });

  it('passes null penalty_winner when no draw', () => {
    const program = makeProgram();
    program.service.proposeResult(5n, 2, 1, null);
    expect(capturedArgs[0][4]).toBeNull();
  });

  it('total args array has exactly 5 elements (Service, ProposeResult, match_id, score_struct, penalty_winner)', () => {
    const program = makeProgram();
    program.service.proposeResult(7n, 0, 0, null);
    expect(capturedArgs[0]).toHaveLength(5);
  });
});
