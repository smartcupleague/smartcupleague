import { GearApi, decodeAddress } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { TransactionBuilder, getServiceNamePrefix, getFnNamePrefix, ZERO_ADDRESS } from 'sails-js';

export type ActorId = string;

export type ProposalKind =
  | { SetFeeBps: { new_fee_bps: string } }
  | { SetFinalPrizeBps: { new_final_prize_bps: string } }
  | { SetMaxPayoutChunk: { new_max_payout_chunk: string } }
  | { AddPhase: { name: string; start_time: string; end_time: string } }
  | { AddMatch: { phase: string; home: string; away: string; kick_off: string } }
  | { SetQuorum: { new_quorum_bps: number } }
  | { SetVotingPeriod: { new_voting_period: string } };

export type VoteChoice = 'Yes' | 'No' | 'Abstain';

export type ProposalStatus = 'Active' | 'Defeated' | 'Succeeded' | 'Executed' | 'Expired';

export interface Proposal {
  id: string;
  proposer: ActorId;
  kind: ProposalKind;
  description: string;
  start_time: string;
  end_time: string;
  yes: number;
  no: number;
  abstain: number;
  status: ProposalStatus;
  executed: boolean;
}

export interface IoDaoState {
  owner: ActorId;
  market_contract: ActorId;
  kyc_contract: ActorId | null;
  quorum_bps: number;
  voting_period: string;
  proposal_count: string;
}

export type DaoEvent =
  | { Seeded: { actor_id: ActorId; actor_id_2: ActorId } }
  | { ProposalCreated: { id: string; proposer: ActorId } }
  | { Voted: { proposal_id: string; voter: ActorId; choice: VoteChoice } }
  | { ProposalFinalized: { id: string; status: ProposalStatus } }
  | { ProposalExecuted: string }
  | { MarketCallDispatched: string }
  | 'GovernanceParamUpdated';

const types = {
  ProposalKind: {
    _enum: {
      SetFeeBps: 'SetFeeBps',
      SetFinalPrizeBps: 'SetFinalPrizeBps',
      SetMaxPayoutChunk: 'SetMaxPayoutChunk',
      AddPhase: 'AddPhase',
      AddMatch: 'AddMatch',
      SetQuorum: 'SetQuorum',
      SetVotingPeriod: 'SetVotingPeriod',
    },
  },
  SetFeeBps: { new_fee_bps: 'u128' },
  SetFinalPrizeBps: { new_final_prize_bps: 'u128' },
  SetMaxPayoutChunk: { new_max_payout_chunk: 'u128' },
  AddPhase: { name: 'String', start_time: 'u64', end_time: 'u64' },
  AddMatch: { phase: 'String', home: 'String', away: 'String', kick_off: 'u64' },
  SetQuorum: { new_quorum_bps: 'u16' },
  SetVotingPeriod: { new_voting_period: 'u64' },
  VoteChoice: { _enum: ['Yes', 'No', 'Abstain'] },
  ProposalStatus: { _enum: ['Active', 'Defeated', 'Succeeded', 'Executed', 'Expired'] },
  Proposal: {
    id: 'u64',
    proposer: '[u8;32]',
    kind: 'ProposalKind',
    description: 'String',
    start_time: 'u64',
    end_time: 'u64',
    yes: 'u32',
    no: 'u32',
    abstain: 'u32',
    status: 'ProposalStatus',
    executed: 'bool',
  },
  IoDaoState: {
    owner: '[u8;32]',
    market_contract: '[u8;32]',
    kyc_contract: 'Option<[u8;32]>',
    quorum_bps: 'u16',
    voting_period: 'u64',
    proposal_count: 'u64',
  },
  Seeded: { actor_id: '[u8;32]', actor_id_2: '[u8;32]' },
  ProposalCreated: { id: 'u64', proposer: '[u8;32]' },
  Voted: { proposal_id: 'u64', voter: '[u8;32]', choice: 'VoteChoice' },
  ProposalFinalized: { id: 'u64', status: 'ProposalStatus' },
  ProposalExecuted: 'u64',
  MarketCallDispatched: 'u64',
  DaoEvent: {
    _enum: {
      Seeded: 'Seeded',
      ProposalCreated: 'ProposalCreated',
      Voted: 'Voted',
      ProposalFinalized: 'ProposalFinalized',
      ProposalExecuted: 'ProposalExecuted',
      MarketCallDispatched: 'MarketCallDispatched',
      GovernanceParamUpdated: 'Null',
    },
  },
};

const withAt = (atBlock?: `0x${string}`) => (atBlock ? { at: atBlock } : {});

export class Program {
  public readonly registry: TypeRegistry;
  public readonly service: Service;

  constructor(public api: GearApi, private _programId?: `0x${string}`) {
    this.registry = new TypeRegistry();
    this.registry.setKnownTypes({ types });
    this.registry.register(types);
    this.service = new Service(this);
  }

  public get programId(): `0x${string}` {
    if (!this._programId) throw new Error('Program ID is not set');
    return this._programId;
  }

  newCtorFromCode(
    code: Uint8Array | Buffer,
    market_contract: ActorId,
    kyc_contract: ActorId
  ): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'upload_program',
      ['New', market_contract, kyc_contract],
      '(String, [u8;32], [u8;32])',
      'String',
      code,
    );
    this._programId = builder.programId;
    return builder;
  }

  newCtorFromCodeId(codeId: `0x${string}`, market_contract: ActorId, kyc_contract: ActorId): TransactionBuilder<null> {
    const builder = new TransactionBuilder<null>(
      this.api,
      this.registry,
      'create_program',
      ['New', market_contract, kyc_contract],
      '(String, [u8;32], [u8;32])',
      'String',
      codeId,
    );
    this._programId = builder.programId;
    return builder;
  }
}

export class Service {
  constructor(private _program: Program) {}

  public createProposal(kind: ProposalKind, description: string): TransactionBuilder<DaoEvent> {
    return new TransactionBuilder<DaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'CreateProposal', kind, description],
      '(String, String, ProposalKind, String)',
      'DaoEvent',
      this._program.programId,
    );
  }

  public execute(proposal_id: string): TransactionBuilder<DaoEvent[]> {
    return new TransactionBuilder<DaoEvent[]>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'Execute', proposal_id],
      '(String, String, u64)',
      'Vec<DaoEvent>',
      this._program.programId,
    );
  }

  public finalizeProposal(proposal_id: string): TransactionBuilder<DaoEvent> {
    return new TransactionBuilder<DaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'FinalizeProposal', proposal_id],
      '(String, String, u64)',
      'DaoEvent',
      this._program.programId,
    );
  }

  public setMarketContract(new_market: ActorId): TransactionBuilder<DaoEvent> {
    return new TransactionBuilder<DaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetMarketContract', new_market],
      '(String, String, [u8;32])',
      'DaoEvent',
      this._program.programId,
    );
  }

  public setOwner(new_owner: ActorId): TransactionBuilder<DaoEvent> {
    return new TransactionBuilder<DaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'SetOwner', new_owner],
      '(String, String, [u8;32])',
      'DaoEvent',
      this._program.programId,
    );
  }

  public vote(proposal_id: string, choice: VoteChoice): TransactionBuilder<DaoEvent> {
    return new TransactionBuilder<DaoEvent>(
      this._program.api,
      this._program.registry,
      'send_message',
      ['Service', 'Vote', proposal_id, choice],
      '(String, String, u64, VoteChoice)',
      'DaoEvent',
      this._program.programId,
    );
  }

  public async queryProposal(
    proposal_id: string,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Proposal | null> {
    const payload = this._program.registry
      .createType('(String, String, u64)', ['Service', 'QueryProposal', proposal_id])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock), // ✅ undefined instead of null
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Option<Proposal>)', reply.payload);
    return result[2].toJSON() as unknown as Proposal | null; // ✅ AnyJson -> unknown -> typed
  }

  public async queryProposals(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<Proposal[]> {
    const payload = this._program.registry
      .createType('(String, String)', ['Service', 'QueryProposals'])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock), // ✅
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Vec<Proposal>)', reply.payload);
    return result[2].toJSON() as unknown as Proposal[]; // ✅
  }

  public async queryState(
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<IoDaoState> {
    const payload = this._program.registry
      .createType('(String, String)', ['Service', 'QueryState'])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock), // ✅
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, IoDaoState)', reply.payload);
    return result[2].toJSON() as unknown as IoDaoState; // ✅
  }

  public async queryVote(
    proposal_id: string,
    voter: ActorId,
    originAddress?: string,
    value?: number | string | bigint,
    atBlock?: `0x${string}`,
  ): Promise<VoteChoice | null> {
    const payload = this._program.registry
      .createType('(String, String, u64, [u8;32])', ['Service', 'QueryVote', proposal_id, voter])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: value ?? 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      ...withAt(atBlock), // ✅
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, Option<VoteChoice>)', reply.payload);
    return result[2].toJSON() as unknown as VoteChoice | null; // ✅
  }

  public subscribeToSeededEvent(
    callback: (data: { actor_id: ActorId; actor_id_2: ActorId }) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'Seeded') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, Seeded)', message.payload)[2].toJSON() as unknown as {
              actor_id: ActorId;
              actor_id_2: ActorId;
            }
          )
        ).catch(console.error);
      }
    });
  }

  public subscribeToProposalCreatedEvent(
    callback: (data: { id: string; proposer: ActorId }) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ProposalCreated') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, ProposalCreated)', message.payload)[2].toJSON() as unknown as {
              id: string;
              proposer: ActorId;
            }
          )
        ).catch(console.error);
      }
    });
  }

  public subscribeToVotedEvent(
    callback: (data: { proposal_id: string; voter: ActorId; choice: VoteChoice }) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'Voted') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, Voted)', message.payload)[2].toJSON() as unknown as {
              proposal_id: string;
              voter: ActorId;
              choice: VoteChoice;
            }
          )
        ).catch(console.error);
      }
    });
  }

  public subscribeToProposalFinalizedEvent(
    callback: (data: { id: string; status: ProposalStatus }) => void | Promise<void>
  ): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ProposalFinalized') {
        void Promise.resolve(
          callback(
            this._program.registry.createType('(String, String, ProposalFinalized)', message.payload)[2].toJSON() as unknown as {
              id: string;
              status: ProposalStatus;
            }
          )
        ).catch(console.error);
      }
    });
  }

  public subscribeToProposalExecutedEvent(callback: (data: string) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'ProposalExecuted') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toString())
        ).catch(console.error);
      }
    });
  }

  public subscribeToMarketCallDispatchedEvent(callback: (data: string) => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'MarketCallDispatched') {
        void Promise.resolve(
          callback(this._program.registry.createType('(String, String, u64)', message.payload)[2].toString())
        ).catch(console.error);
      }
    });
  }

  public subscribeToGovernanceParamUpdatedEvent(callback: () => void | Promise<void>): Promise<() => void> {
    return this._program.api.gearEvents.subscribeToGearEvent('UserMessageSent', ({ data: { message } }) => {
      if (!message.source.eq(this._program.programId) || !message.destination.eq(ZERO_ADDRESS)) return;

      const payload = message.payload.toHex();
      if (getServiceNamePrefix(payload) === 'Service' && getFnNamePrefix(payload) === 'GovernanceParamUpdated') {
        void Promise.resolve(callback()).catch(console.error);
      }
    });
  }
}
