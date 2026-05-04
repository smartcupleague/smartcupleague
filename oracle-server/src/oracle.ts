
import { GearApi, decodeAddress } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder, getServiceNamePrefix, getFnNamePrefix, ZERO_ADDRESS } from 'sails-js';

export type ActorId = string;

export type PenaltyWinner = 'Home' | 'Away';

export type OracleResultStatus = 'Pending' | 'Finalized';

export interface Score {
  home: number;
  away: number;
}

export interface FinalResult {
  score: Score;
  penalty_winner: PenaltyWinner | null;
  finalized_at: number | string | bigint;
}

export interface IoMatchResult {
  match_id: number | string | bigint;
  phase: string;
  home: string;
  away: string;
  kick_off: number | string | bigint;
  status: OracleResultStatus;
  final_result: FinalResult | null;
  submissions: number;
}

export interface IoOracleState {
  admin: ActorId;
  operators: ActorId[];
  consensus_threshold: number;
  bolao_program_id: ActorId | null;
  authorized_feeders: ActorId[];
  match_results: IoMatchResult[];
  pending_admin: ActorId | null;
}

const types = {
  PenaltyWinner: { _enum: ['Home', 'Away'] },
  OracleResultStatus: { _enum: ['Pending', 'Finalized'] },
  Score: { home: 'u8', away: 'u8' },
  FinalResult: { score: 'Score', penalty_winner: 'Option<PenaltyWinner>', finalized_at: 'u64' },
  IoMatchResult: {
    match_id: 'u64',
    phase: 'String',
    home: 'String',
    away: 'String',
    kick_off: 'u64',
    status: 'OracleResultStatus',
    final_result: 'Option<FinalResult>',
    submissions: 'u32',
  },
  IoOracleState: {
    admin: '[u8;32]',
    operators: 'Vec<[u8;32]>',
    consensus_threshold: 'u8',
    bolao_program_id: 'Option<[u8;32]>',
    authorized_feeders: 'Vec<[u8;32]>',
    match_results: 'Vec<IoMatchResult>',
    pending_admin: 'Option<[u8;32]>',
  },
  FeederSet: { actor_id: '[u8;32]', bool: 'bool' },
  ResultSubmitted: { '0': 'u64', '1': '[u8;32]', '2': 'Score' },
  ConsensusReached: { '0': 'u64', '1': 'Score', '2': 'Option<PenaltyWinner>' },
  ResultForced: { '0': 'u64', '1': 'Score', '2': 'Option<PenaltyWinner>' },
  AdminProposed: { '0': '[u8;32]', '1': '[u8;32]' },
  AdminChanged: { '0': '[u8;32]', '1': '[u8;32]' },
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

  newCtorFromCode(code: Uint8Array | Buffer, admin: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'upload_program',
      ['New', admin],
      '(String, [u8;32])',
      'String',
      code,
    );
    this._programId = builder.programId;
    return builder;
  }

  newCtorFromCodeId(codeId: `0x${string}`, admin: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'create_program',
      ['New', admin],
      '(String, [u8;32])',
      'String',
      codeId,
    );
    this._programId = builder.programId;
    return builder;
  }
}

export class Service {
  constructor(private _program: Program) {}

  public acceptAdmin(): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'AcceptAdmin'],
      '(String, String)',
      'Null',
      this._program.programId,
    );
  }

  public cancelResult(match_id: number | string | bigint): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'CancelResult', match_id],
      '(String, String, u64)',
      'Null',
      this._program.programId,
    );
  }

  public forceFinalizeResult(
    match_id: number | string | bigint,
    home: number,
    away: number,
    penalty_winner: PenaltyWinner | null,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ForceFinalizeResult', match_id, home, away, penalty_winner],
      '(String, String, u64, u8, u8, Option<PenaltyWinner>)',
      'Null',
      this._program.programId,
    );
  }

  public proposeAdmin(new_admin: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'ProposeAdmin', new_admin],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  public registerMatch(
    match_id: number | string | bigint,
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
      ['Service', 'RegisterMatch', match_id, phase, home, away, kick_off],
      '(String, String, u64, String, String, String, u64)',
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

  public setBolaoProgram(program_id: ActorId): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetBolaoProgram', program_id],
      '(String, String, [u8;32])',
      'Null',
      this._program.programId,
    );
  }

  public setConsensusThreshold(threshold: number): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetConsensusThreshold', threshold],
      '(String, String, u8)',
      'Null',
      this._program.programId,
    );
  }

  public setFeederAuthorized(feeder: ActorId, authorized: boolean): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetFeederAuthorized', feeder, authorized],
      '(String, String, [u8;32], bool)',
      'Null',
      this._program.programId,
    );
  }

  public submitResult(
    match_id: number | string | bigint,
    home: number,
    away: number,
    penalty_winner: PenaltyWinner | null,
  ): TransactionBuilder<null> {
    if (!this._program.programId) throw new Error('Program ID is not set');
    return new TransactionBuilder<null>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SubmitResult', match_id, home, away, penalty_winner],
      '(String, String, u64, u8, u8, Option<PenaltyWinner>)',
      'Null',
      this._program.programId,
    );
  }

  public async queryAllResults(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<IoMatchResult[]> {
    const payload = this._program.registry.createType('(String, String)', ['Service', 'QueryAllResults']).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Vec<IoMatchResult>)', reply.payload);
    return result[2].toJSON() as unknown as IoMatchResult[];
  }

  public async queryFeederSubmissions(
    feeder: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Array<[number | string | bigint, Score, PenaltyWinner | null]>> {
    const payload = this._program.registry.createType('(String, String, [u8;32])', ['Service', 'QueryFeederSubmissions', feeder]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Vec<(u64, Score, Option<PenaltyWinner>)>)', reply.payload);
    return result[2].toJSON() as Array<[number | string | bigint, Score, PenaltyWinner | null]>;
  }

  public async queryMatchResult(
    match_id: number | string | bigint,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<FinalResult | null> {
    const payload = this._program.registry.createType('(String, String, u64)', ['Service', 'QueryMatchResult', match_id]).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Option<FinalResult>)', reply.payload);
    return result[2].toJSON() as FinalResult | null;
  }

  public async queryPendingMatches(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Array<number | string | bigint>> {
    const payload = this._program.registry.createType('(String, String)', ['Service', 'QueryPendingMatches']).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, Vec<u64>)', reply.payload);
    return result[2].toJSON() as Array<number | string | bigint>;
  }

  public async queryState(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<IoOracleState> {
    const payload = this._program.registry.createType('(String, String)', ['Service', 'QueryState']).toHex();
    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock ?? undefined,
    });
    if (!reply.code.isSuccess) throw new Error(this._program.registry.createType('String', reply.payload).toString());
    const result = this._program.registry.createType('(String, String, IoOracleState)', reply.payload);
    return result[2].toJSON() as unknown as IoOracleState;
  }

  public subscribeToMatchRegisteredEvent(
    callback: (data: number | string | bigint) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MatchRegistered') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, u64)', message.payload)[2].toJSON() as number | string | bigint
        )).catch(console.error);
      }
    });
  }

  public subscribeToFeederSetEvent(
    callback: (data: { actor_id: ActorId; bool: boolean }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'FeederSet') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, FeederSet)', message.payload)[2].toJSON() as {
            actor_id: ActorId;
            bool: boolean;
          }
        )).catch(console.error);
      }
    });
  }

  public subscribeToConsensusThresholdSetEvent(
    callback: (data: number) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ConsensusThresholdSet') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, u8)', message.payload)[2].toNumber()
        )).catch(console.error);
      }
    });
  }

  public subscribeToBolaoProgramEvent(
    callback: (data: ActorId) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'BolaoProgram') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, [u8;32])', message.payload)[2].toJSON()
        )).catch(console.error);
      }
    });
  }

  public subscribeToResultSubmittedEvent(
    callback: (data: { match_id: number | string | bigint; feeder: ActorId; score: Score }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultSubmitted') {
        void Promise.resolve(callback(
          (() => {
            const decoded = this._program.registry.createType('(String, String, ResultSubmitted)', message.payload)[2].toJSON() as any[];
            return {
              match_id: decoded[0] as number | string | bigint,
              feeder: decoded[1] as ActorId,
              score: decoded[2] as Score,
            };
          })()
        )).catch(console.error);
      }
    });
  }

  public subscribeToConsensusReachedEvent(
    callback: (data: { match_id: number | string | bigint; score: Score; penalty_winner: PenaltyWinner | null }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ConsensusReached') {
        void Promise.resolve(callback(
          (() => {
            const decoded = this._program.registry.createType('(String, String, ConsensusReached)', message.payload)[2].toJSON() as any[];
            return {
              match_id: decoded[0] as number | string | bigint,
              score: decoded[1] as Score,
              penalty_winner: decoded[2] as PenaltyWinner | null,
            };
          })()
        )).catch(console.error);
      }
    });
  }

  public subscribeToResultForcedEvent(
    callback: (data: { match_id: number | string | bigint; score: Score; penalty_winner: PenaltyWinner | null }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultForced') {
        void Promise.resolve(callback(
          (() => {
            const decoded = this._program.registry.createType('(String, String, ResultForced)', message.payload)[2].toJSON() as any[];
            return {
              match_id: decoded[0] as number | string | bigint,
              score: decoded[1] as Score,
              penalty_winner: decoded[2] as PenaltyWinner | null,
            };
          })()
        )).catch(console.error);
      }
    });
  }

  public subscribeToResultCancelledEvent(
    callback: (data: number | string | bigint) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ResultCancelled') {
        void Promise.resolve(callback(
          this._program.registry.createType('(String, String, u64)', message.payload)[2].toJSON() as number | string | bigint
        )).catch(console.error);
      }
    });
  }

  public subscribeToAdminProposedEvent(
    callback: (data: { old: ActorId; proposed: ActorId }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'AdminProposed') {
        void Promise.resolve(callback(
          (() => {
            const decoded = this._program.registry.createType('(String, String, AdminProposed)', message.payload)[2].toJSON() as any[];
            return {
              old: decoded[0] as ActorId,
              proposed: decoded[1] as ActorId,
            };
          })()
        )).catch(console.error);
      }
    });
  }

  public subscribeToAdminChangedEvent(
    callback: (data: { old: ActorId; new: ActorId }) => void | Promise<void>,
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;
      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'AdminChanged') {
        void Promise.resolve(callback(
          (() => {
            const decoded = this._program.registry.createType('(String, String, AdminChanged)', message.payload)[2].toJSON() as any[];
            return {
              old: decoded[0] as ActorId,
              new: decoded[1] as ActorId,
            };
          })()
        )).catch(console.error);
      }
    });
  }
}
