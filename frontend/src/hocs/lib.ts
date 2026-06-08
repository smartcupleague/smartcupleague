
import { GearApi, decodeAddress } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder, getServiceNamePrefix, getFnNamePrefix, ZERO_ADDRESS } from 'sails-js';

export type ActorId = string;

export interface Score {
  home: number;
  away: number;
}

export type PenaltyWinner = 'Home' | 'Away';

export interface UserBetView {
  match_id: string | number | bigint;
  score: Score;
  penalty_winner: PenaltyWinner | null;
  stake_in_match_pool: string | number | bigint;
  freebet_principal: string | number | bigint;
  claimed: boolean;
}

export interface FinalPrizeClaimStatus {
  wallet: ActorId;
  final_prize_finalized: boolean;
  eligible: boolean;
  amount_claimable: string | number | bigint;
  already_claimed: boolean;
  points: number;
}

export interface Match {
  match_id: string | number | bigint;
  phase: string;
  home: string;
  away: string;
  kick_off: string | number | bigint;
  result: ResultStatus;
  match_prize_pool: string | number | bigint;
  has_bets: boolean;
  participants: ActorId[];
  total_winner_stake: string | number | bigint;
  total_claimed: string | number | bigint;
  settlement_prepared: boolean;
  dust_swept: boolean;
  finalized_at: string | number | bigint | null;
}

export type ResultStatus =
  | 'Unresolved'
  | {
      Proposed: {
        score: Score;
        penalty_winner: PenaltyWinner | null;
        oracle: ActorId;
        proposed_at: string | number | bigint;
      }
    }
  | {
      Finalized: {
        score: Score;
        penalty_winner: PenaltyWinner | null;
      }
    }
  | 'Cancelled';

export interface IoSmartCupState {
  admins: ActorId[];
  operators: ActorId[];
  treasury: ActorId;
  protocol_fee_accumulated: string | number | bigint;
  final_prize_accumulated: string | number | bigint;
  matches: Match[];
  phases: PhaseConfig[];
  user_points: Array<[ActorId, number]>;
  podium_finalized: boolean;
  r32_lock_time: string | number | bigint | null;
  final_prize_finalized: boolean;
  final_prize_claimable_total: string | number | bigint;
  final_prize_rounding_dust: string | number | bigint;
  vara_price_usd_micro: string | number | bigint;
  price_cached_at: string | number | bigint;
  price_staleness_limit_ms: string | number | bigint;
  challenge_window_ms: string | number | bigint;
  claim_deadline_ms: string | number | bigint;
}

export interface PhaseConfig {
  name: string;
  start_time: string | number | bigint;
  end_time: string | number | bigint;
  points_weight: number;
}

export interface WalletClaimStatus {
  wallet: ActorId;
  amount_claimable: string | number | bigint;
  already_claimed: boolean;
}

export interface PodiumPick {
  champion: string;
  runner_up: string;
  third_place: string;
}

const types = {
  Score: {
    home: 'u8',
    away: 'u8',
  },
  PenaltyWinner: { _enum: ['Home', 'Away'] },
  UserBetView: {
    match_id: 'u64',
    score: 'Score',
    penalty_winner: 'Option<PenaltyWinner>',
    stake_in_match_pool: 'u128',
    freebet_principal: 'u128',
    claimed: 'bool',
  },
  FinalPrizeClaimStatus: {
    wallet: '[u8;32]',
    final_prize_finalized: 'bool',
    eligible: 'bool',
    amount_claimable: 'u128',
    already_claimed: 'bool',
    points: 'u32',
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
  ResultStatus: {
    _enum: {
      Unresolved: 'Null',
      Proposed: '{"score":"Score","penalty_winner":"Option<PenaltyWinner>","oracle":"[u8;32]","proposed_at":"u64"}',
      Finalized: '{"score":"Score","penalty_winner":"Option<PenaltyWinner>"}',
      Cancelled: 'Null',
    },
  },
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
    vara_price_usd_micro: 'u64',
    price_cached_at: 'u64',
    price_staleness_limit_ms: 'u64',
    challenge_window_ms: 'u64',
    claim_deadline_ms: 'u64',
  },
  PhaseConfig: {
    name: 'String',
    start_time: 'u64',
    end_time: 'u64',
    points_weight: 'u32',
  },
  WalletClaimStatus: {
    wallet: '[u8;32]',
    amount_claimable: 'u128',
    already_claimed: 'bool',
  },
  PodiumPick: {
    champion: 'String',
    runner_up: 'String',
    third_place: 'String',
  },
  MatchRegistered: '(u64, String, String, String, u64)',
  OracleAuthorized: '([u8;32], bool)',
  BetAccepted: '([u8;32], u64, Score, Option<PenaltyWinner>, u128)',
  ResultProposed: '(u64, Score, Option<PenaltyWinner>, [u8;32], u64)',
  ResultFinalized: '(u64, Score, Option<PenaltyWinner>)',
  SettlementPrepared: '(u64, u128)',
  PointsAwarded: '([u8;32], u64, u32)',
  MatchRewardClaimed: '(u64, [u8;32], u128)',
  MatchDustSwept: '(u64, u128)',
  PodiumPickSubmitted: '([u8;32], String, String, String, u128)',
  PodiumFinalized: '(String, String, String)',
  PodiumBonusAwarded: '([u8;32], u32)',
  FinalPrizeSent: '(u128, [u8;32])',
  ProtocolFeesWithdrawn: '(u128, [u8;32])',
  AdminAdded: '[u8;32]',
  AdminRemoved: '[u8;32]',
  OperatorAdded: '[u8;32]',
  OperatorRemoved: '[u8;32]',
  TreasuryChanged: '([u8;32], [u8;32])',
  FinalPrizePoolFinalized: '(u128, u128)',
  FinalPrizeClaimed: '([u8;32], u128)',
  FinalPrizeRoundingDustWithdrawn: '(u128, [u8;32])',
  ResultProposalCancelled: '(u64, [u8;32])',
  MatchCancelled: '(u64, u128)',
  RefundClaimed: '([u8;32], u128)',
  VaraPriceRefreshed: '(u128, u64)',
  ChallengeWindowUpdated: 'u64',
  ClaimDeadlineUpdated: 'u64',
  // No alias === type, none need to be removed.
};

export class Program {
  public readonly registry: TypeRegistry;
  public readonly service: Service;

  constructor(
    public api: GearApi,
    private _programId?: `0x${string}`,
  ) {
    this.registry = new TypeRegistry();
    this.registry.setKnownTypes({ types });
    this.registry.register(types);

    this.service = new Service(this);
  }

  public get programId(): `0x${string}` {
    if (!this._programId) throw new Error('Program ID is not set');
    return this._programId;
  }

  newCtorFromCode(code: Uint8Array | Buffer, admin: ActorId, treasury: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'upload_program',
      ['New', admin, treasury],
      '(String, String, [u8;32], [u8;32])',
      'String',
      code,
    );
    this._programId = builder.programId;
    return builder;
  }

  newCtorFromCodeId(codeId: `0x${string}`, admin: ActorId, treasury: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'create_program',
      ['New', admin, treasury],
      '(String, String, [u8;32], [u8;32])',
      'String',
      codeId,
    );
    this._programId = builder.programId;
    return builder;
  }
}

export class Service {
  constructor(private _program: Program) {}

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

  public cancelProposedResult(match_id: string | number | bigint): TransactionBuilder<null> {
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

  public cancelMatch(match_id: string | number | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'CancelMatch', match_id],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public claimRefund(): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ClaimRefund'],
      '(String, String)',
      'Null',
      this._program.programId,
    );
  }


  public claimFinalPrize(): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ClaimFinalPrize'],
      '(String, String)',
      'Null',
      this._program.programId,
    );
  }

  public claimMatchReward(match_id: string | number | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ClaimMatchReward', match_id],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public finalizeFinalPrizePool(): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'FinalizeFinalPrizePool'],
      '(String, String)',
      'Null',
      this._program.programId,
    );
  }

  public finalizePodium(champion: string, runner_up: string, third_place: string): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'FinalizePodium', champion, runner_up, third_place],
      '(String, String, String, String, String)',
      'Null',
      this._program.programId,
    );
  }

  public finalizeResult(match_id: string | number | bigint): TransactionBuilder<null> {
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

  public placeBet(
    match_id: string | number | bigint,
    predicted_score: Score,
    predicted_penalty_winner: PenaltyWinner | null,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'PlaceBet', match_id, predicted_score, predicted_penalty_winner],
      '(String, String, u64, Score, Option<PenaltyWinner>)',
      'Null',
      this._program.programId,
    );
  }

  public proposeFromOracle(
    match_id: string | number | bigint,
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

  public proposeResult(
    match_id: string | number | bigint,
    final_score: Score,
    penalty_winner: PenaltyWinner | null,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ProposeResult', match_id, final_score, penalty_winner],
      '(String, String, u64, Score, Option<PenaltyWinner>)',
      'Null',
      this._program.programId,
    );
  }

  public registerMatch(
    phase: string,
    home: string,
    away: string,
    kick_off: string | number | bigint,
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

  public registerPhase(
    phase_name: string,
    start_time: string | number | bigint,
    end_time: string | number | bigint,
    points_weight: number,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RegisterPhase', phase_name, start_time, end_time, points_weight],
      '(String, String, String, u64, u64, u32)',
      'Null',
      this._program.programId,
    );
  }

  public setOracleAuthorized(oracle: ActorId, authorized: boolean): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetOracleAuthorized', oracle, authorized],
      '(String, String, [u8;32], bool)',
      'Null',
      this._program.programId,
    );
  }

  public refreshVaraPrice(oracle_program_id: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'RefreshVaraPrice', oracle_program_id],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  public setPriceOracle(oracle_program_id: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetPriceOracle', oracle_program_id],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  public setChallengeWindow(limit_ms: string | number | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetChallengeWindow', limit_ms],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public setClaimDeadline(limit_ms: string | number | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetClaimDeadline', limit_ms],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public setPriceStalenessLimit(limit_ms: string | number | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetPriceStalenessLimit', limit_ms],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public submitPodiumPick(
    champion: string,
    runner_up: string,
    third_place: string,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SubmitPodiumPick', champion, runner_up, third_place],
      '(String, String, String, String, String)',
      'Null',
      this._program.programId,
    );
  }

  public sweepMatchDustToFinalPrize(match_id: string | number | bigint): TransactionBuilder<null> {
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

  public withdrawFinalPrizeRoundingDust(): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'WithdrawFinalPrizeRoundingDust'],
      '(String, String)',
      'Null',
      this._program.programId,
    );
  }

  public withdrawProtocolFees(): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'WithdrawProtocolFees'],
      '(String, String)',
      'Null',
      this._program.programId,
    );
  }

  public async queryBetsByUser(
    user: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<UserBetView[]> {
    const payload = this._program.registry.createType('(String, String, [u8;32])', ['Service', 'QueryBetsByUser', user]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Vec<UserBetView>)', reply.payload);
    return result[2].toJSON() as unknown as UserBetView[];
  }

  public async queryFinalPrizeClaimStatus(
    wallet: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<FinalPrizeClaimStatus> {
    const payload = this._program.registry.createType('(String, String, [u8;32])', ['Service', 'QueryFinalPrizeClaimStatus', wallet]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, FinalPrizeClaimStatus)', reply.payload);
    return result[2].toJSON() as unknown as FinalPrizeClaimStatus;
  }

  public async queryMatch(
    match_id: string | number | bigint,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Match | null> {
    const payload = this._program.registry.createType('(String, String, u64)', ['Service', 'QueryMatch', match_id]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Option<Match>)', reply.payload);
    return result[2].toJSON() as unknown as Match | null;
  }

  public async queryMatchesByPhase(
    phase: string,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Match[]> {
    const payload = this._program.registry.createType('(String, String, String)', ['Service', 'QueryMatchesByPhase', phase]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Vec<Match>)', reply.payload);
    return result[2].toJSON() as unknown as Match[];
  }

  public async queryState(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<IoSmartCupState> {
    const payload = this._program.registry.createType('(String, String)', ['Service', 'QueryState']).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, IoSmartCupState)', reply.payload);
    return result[2].toJSON() as unknown as IoSmartCupState;
  }

  public async queryUserPoints(
    user: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<number> {
    const payload = this._program.registry.createType('(String, String, [u8;32])', ['Service', 'QueryUserPoints', user]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, u32)', reply.payload);
    return result[2].toNumber();
  }

  public async queryWalletClaimStatus(
    wallet: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<WalletClaimStatus> {
    const payload = this._program.registry.createType('(String, String, [u8;32])', ['Service', 'QueryWalletClaimStatus', wallet]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, WalletClaimStatus)', reply.payload);
    return result[2].toJSON() as unknown as WalletClaimStatus;
  }

  public async queryPendingRefund(
    user: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<string> {
    const payload = this._program.registry.createType('(String, String, [u8;32])', ['Service', 'QueryPendingRefund', user]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, u128)', reply.payload);
    return result[2].toString();
  }

  public async queryPodiumPick(
    user: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<PodiumPick | null> {
    const payload = this._program.registry.createType('(String, String, [u8;32])', ['Service', 'QueryPodiumPick', user]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value || 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Option<PodiumPick>)', reply.payload);
    const option = result[2].toJSON() as PodiumPick | null;
    return option;
  }

  public subscribeToPhaseRegisteredEvent(
    callback: (data: string) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PhaseRegistered') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, String)', message.payload)[2].toString()
        )).catch(console.error);
      }
    });
  }

  public subscribeToMatchRegisteredEvent(
    callback: (data: [string | number | bigint, string, string, string, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchRegistered') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, MatchRegistered)', message.payload)[2].toJSON() as [
            string | number | bigint,
            string,
            string,
            string,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToOracleAuthorizedEvent(
    callback: (data: [ActorId, boolean]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'OracleAuthorized') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, OracleAuthorized)', message.payload)[2].toJSON() as [
            ActorId,
            boolean
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToBetAcceptedEvent(
    callback: (data: [ActorId, string | number | bigint, Score, PenaltyWinner | null, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'BetAccepted') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, BetAccepted)', message.payload)[2].toJSON() as [
            ActorId,
            string | number | bigint,
            Score,
            PenaltyWinner | null,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToResultProposedEvent(
    callback: (
      data: [string | number | bigint, Score, PenaltyWinner | null, ActorId, string | number | bigint]
    ) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultProposed') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, ResultProposed)', message.payload)[2].toJSON() as [
            string | number | bigint,
            Score,
            PenaltyWinner | null,
            ActorId,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToResultFinalizedEvent(
    callback: (
      data: [string | number | bigint, Score, PenaltyWinner | null]
    ) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultFinalized') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, ResultFinalized)', message.payload)[2].toJSON() as [
            string | number | bigint,
            Score,
            PenaltyWinner | null
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToSettlementPreparedEvent(
    callback: (data: [string | number | bigint, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'SettlementPrepared') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, SettlementPrepared)', message.payload)[2].toJSON() as [
            string | number | bigint,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToPointsAwardedEvent(
    callback: (data: [ActorId, string | number | bigint, number]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PointsAwarded') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, PointsAwarded)', message.payload)[2].toJSON() as [
            ActorId,
            string | number | bigint,
            number
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToMatchRewardClaimedEvent(
    callback: (data: [string | number | bigint, ActorId, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchRewardClaimed') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, MatchRewardClaimed)', message.payload)[2].toJSON() as [
            string | number | bigint,
            ActorId,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToMatchDustSweptEvent(
    callback: (data: [string | number | bigint, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchDustSwept') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, MatchDustSwept)', message.payload)[2].toJSON() as [
            string | number | bigint,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToPodiumPickSubmittedEvent(
    callback: (data: [ActorId, string, string, string, string | number]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PodiumPickSubmitted') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, PodiumPickSubmitted)', message.payload)[2].toJSON() as [
            ActorId,
            string,
            string,
            string,
            string | number
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToPodiumFinalizedEvent(
    callback: (data: [string, string, string]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PodiumFinalized') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, PodiumFinalized)', message.payload)[2].toJSON() as [
            string,
            string,
            string
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToPodiumBonusAwardedEvent(
    callback: (data: [ActorId, number]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'PodiumBonusAwarded') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, PodiumBonusAwarded)', message.payload)[2].toJSON() as [
            ActorId,
            number
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToFinalPrizeSentEvent(
    callback: (data: [string | number | bigint, ActorId]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FinalPrizeSent') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, FinalPrizeSent)', message.payload)[2].toJSON() as [
            string | number | bigint,
            ActorId
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToProtocolFeesWithdrawnEvent(
    callback: (data: [string | number | bigint, ActorId]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ProtocolFeesWithdrawn') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, ProtocolFeesWithdrawn)', message.payload)[2].toJSON() as [
            string | number | bigint,
            ActorId
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToAdminAddedEvent(
    callback: (data: ActorId) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'AdminAdded') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, AdminAdded)', message.payload)[2].toJSON() as ActorId
        )).catch(console.error);
      }
    });
  }

  public subscribeToAdminRemovedEvent(
    callback: (data: ActorId) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'AdminRemoved') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, AdminRemoved)', message.payload)[2].toJSON() as ActorId
        )).catch(console.error);
      }
    });
  }

  public subscribeToOperatorAddedEvent(
    callback: (data: ActorId) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'OperatorAdded') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, OperatorAdded)', message.payload)[2].toJSON() as ActorId
        )).catch(console.error);
      }
    });
  }

  public subscribeToOperatorRemovedEvent(
    callback: (data: ActorId) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'OperatorRemoved') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, OperatorRemoved)', message.payload)[2].toJSON() as ActorId
        )).catch(console.error);
      }
    });
  }

  public subscribeToTreasuryChangedEvent(
    callback: (data: [ActorId, ActorId]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'TreasuryChanged') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, TreasuryChanged)', message.payload)[2].toJSON() as [
            ActorId,
            ActorId
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToFinalPrizePoolFinalizedEvent(
    callback: (data: [string | number | bigint, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FinalPrizePoolFinalized') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, FinalPrizePoolFinalized)', message.payload)[2].toJSON() as [
            string | number | bigint,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToFinalPrizeClaimedEvent(
    callback: (data: [ActorId, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FinalPrizeClaimed') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, FinalPrizeClaimed)', message.payload)[2].toJSON() as [
            ActorId,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToFinalPrizeRoundingDustWithdrawnEvent(
    callback: (data: [string | number | bigint, ActorId]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FinalPrizeRoundingDustWithdrawn') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, FinalPrizeRoundingDustWithdrawn)', message.payload)[2].toJSON() as [
            string | number | bigint,
            ActorId
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToResultProposalCancelledEvent(
    callback: (data: [string | number | bigint, ActorId]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultProposalCancelled') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, ResultProposalCancelled)', message.payload)[2].toJSON() as [
            string | number | bigint,
            ActorId
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToMatchCancelledEvent(
    callback: (data: [string | number | bigint, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchCancelled') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, MatchCancelled)', message.payload)[2].toJSON() as [
            string | number | bigint,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToRefundClaimedEvent(
    callback: (data: [ActorId, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'RefundClaimed') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, RefundClaimed)', message.payload)[2].toJSON() as [
            ActorId,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }

  public subscribeToClaimDeadlineUpdatedEvent(
    callback: (data: string | number | bigint) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ClaimDeadlineUpdated') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, ClaimDeadlineUpdated)', message.payload)[2].toJSON() as string | number | bigint
        )).catch(console.error);
      }
    });
  }

  public subscribeToChallengeWindowUpdatedEvent(
    callback: (data: string | number | bigint) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ChallengeWindowUpdated') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, ChallengeWindowUpdated)', message.payload)[2].toJSON() as string | number | bigint
        )).catch(console.error);
      }
    });
  }

  public subscribeToVaraPriceRefreshedEvent(
    callback: (data: [string | number | bigint, string | number | bigint]) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'VaraPriceRefreshed') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, VaraPriceRefreshed)', message.payload)[2].toJSON() as [
            string | number | bigint,
            string | number | bigint
          ]
        )).catch(console.error);
      }
    });
  }
}
