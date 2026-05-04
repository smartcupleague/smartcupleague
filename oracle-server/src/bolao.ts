
import { GearApi } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder, ZERO_ADDRESS } from 'sails-js';

export type ActorId = `0x${string}`;

export interface Score { home: number; away: number; }
export type PenaltyWinner = 'Home' | 'Away';
export type ResultStatus =
  | 'Unresolved'
  | { proposed: { score: Score; penalty_winner: PenaltyWinner | null; oracle: ActorId; proposed_at: number } }
  | { finalized: { score: Score; penalty_winner: PenaltyWinner | null } };

export interface Match {
  match_id: number;
  phase: string;
  home: string;
  away: string;
  kick_off: number;
  result: ResultStatus;
  match_prize_pool: string;
  has_bets: boolean;
  settlement_prepared: boolean;
  dust_swept: boolean;
  finalized_at: number | null;
}

export interface IoSmartCupState {
  matches: Match[];
}

/**
 * Minimal BolaoCore-Program client for oracle-server usage.
 * Only exposes the methods needed by the oracle bridge.
 */
export class BolaoProgram {
  public readonly registry: TypeRegistry;
  public readonly service: BolaoService;

  constructor(
    public api: GearApi,
    private _programId?: ActorId,
  ) {
    this.registry = new TypeRegistry();
    const types = {
      Score: { home: 'u8', away: 'u8' },
      PenaltyWinner: { _enum: ['Home', 'Away'] },
      ResultStatus: {
        _enum: {
          Unresolved: 'Null',
          Proposed: '{"score":"Score","penalty_winner":"Option<PenaltyWinner>","oracle":"[u8;32]","proposed_at":"u64"}',
          Finalized: '{"score":"Score","penalty_winner":"Option<PenaltyWinner>"}',
        },
      },
      Match: {
        match_id: 'u64',
        phase: 'String',
        home: 'String',
        away: 'String',
        kick_off: 'u64',
        result: 'ResultStatus',
        match_prize_pool: 'u128',
        has_bets: 'bool',
        participants: 'Vec<[u8;32]>',
        total_winner_stake: 'u128',
        total_claimed: 'u128',
        settlement_prepared: 'bool',
        dust_swept: 'bool',
        finalized_at: 'Option<u64>',
      },
      PhaseConfig: { name: 'String', start_time: 'u64', end_time: 'u64', points_weight: 'u32' },
      IoSmartCupState: {
        admins: 'Vec<[u8;32]>',
        operators: 'Vec<[u8;32]>',
        treasury: '[u8;32]',
        protocol_fee_accumulated: 'u128',
        final_prize_accumulated: 'u128',
        matches: 'Vec<Match>',
        phases: 'Vec<PhaseConfig>',
        user_points: 'Vec<([u8;32], u32)>',
        podium_finalized: 'bool',
        r32_lock_time: 'Option<u64>',
        final_prize_finalized: 'bool',
        final_prize_claimable_total: 'u128',
        final_prize_rounding_dust: 'u128',
      },
    };
    this.registry.setKnownTypes({ types });
    this.registry.register(types);
    this.service = new BolaoService(this);
  }

  public get programId(): ActorId {
    if (!this._programId) throw new Error('BolaoCore Program ID is not set');
    return this._programId;
  }
}

export class BolaoService {
  constructor(private _program: BolaoProgram) {}

  /**
   * Registers a new tournament phase in BolaoCore.
   * Must be called (signed) by the admin.
   */
  public registerPhase(
    name: string,
    start_time: number | string | bigint,
    end_time: number | string | bigint,
    points_weight: number,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RegisterPhase', name, start_time, end_time, points_weight],
      '(String, String, String, u64, u64, u32)',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Registers a new match in BolaoCore.
   * The contract auto-assigns the match_id (auto-incremented).
   * Params must match a previously registered phase.
   */
  public registerMatch(
    phase: string,
    home: string,
    away: string,
    kick_off: number | string | bigint,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RegisterMatch', phase, home, away, kick_off],
      '(String, String, String, String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Finalizes a proposed match result after the challenge window expires.
   * Distributes points to correct predictors.
   */
  public finalizeResult(match_id: number | string | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'FinalizeResult', match_id],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Adds a new admin to the admins vector. Admin-only.
   */
  public addAdmin(new_admin: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'AddAdmin', new_admin],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Removes an admin from the admins vector. Admin-only.
   * Cannot remove the last remaining admin.
   */
  public removeAdmin(admin: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RemoveAdmin', admin],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Adds an operator. Operators can call register_phase and register_match.
   * Admin-only.
   */
  public addOperator(new_operator: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'AddOperator', new_operator],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Removes an operator. Admin-only.
   */
  public removeOperator(operator: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RemoveOperator', operator],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Changes the treasury address. All protocol fees and dust are sent here.
   * Admin-only.
   */
  public setTreasury(new_treasury: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetTreasury', new_treasury],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  /**
   * Triggers BolaoCore to pull the finalized result directly from Oracle-Program.
   * BolaoCore independently verifies the result on-chain — no result data is sent here.
   *
   * @param match_id       - Match ID registered in BolaoCore
   * @param oracle_program_id - ActorId of the authorized Oracle-Program on Vara
   */
  public proposeFromOracle(
    match_id: number | string | bigint,
    oracle_program_id: ActorId,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ProposeFromOracle', match_id, oracle_program_id],
      '(String, String, u64, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  public cancelProposedResult(match_id: number | string | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'CancelProposedResult', match_id],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public sweepMatchDustToFinalPrize(match_id: number | string | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SweepMatchDustToFinalPrize', match_id],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public async queryState(): Promise<IoSmartCupState> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    const payload = this._program.registry
      .createType('(String, String)', ['Service', 'QueryState'])
      .toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: ZERO_ADDRESS,
      payload,
      value: 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
    });
    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }
    const result = this._program.registry.createType(
      '(String, String, IoSmartCupState)',
      reply.payload,
    );
    return result[2].toJSON() as unknown as IoSmartCupState;
  }
}
