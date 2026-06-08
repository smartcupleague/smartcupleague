import { GearApi, decodeAddress } from '@gear-js/api';
import { TypeRegistry } from '@polkadot/types';
import { ZERO_ADDRESS } from 'sails-js';
import { TransactionBuilder } from 'sails-js';

export type ActorId = string;

export type Score = {
  home: number;
  away: number;
};

export type PenaltyWinner = { Home: null } | { Away: null };

const types = {
  Score: {
    home: 'u8',
    away: 'u8',
  },
  PenaltyWinner: { _enum: ['Home', 'Away'] },
};

export class FreebetLedgerProgram {
  public readonly registry: TypeRegistry;
  public readonly service: FreebetLedgerService;

  constructor(
    public api: GearApi,
    private readonly _programId?: `0x${string}`,
  ) {
    this.registry = new TypeRegistry();
    this.registry.setKnownTypes({ types });
    this.registry.register(types);
    this.service = new FreebetLedgerService(this);
  }

  public get programId(): `0x${string}` {
    if (!this._programId) throw new Error('Freebet ledger program ID is not set');
    return this._programId;
  }
}

export class FreebetLedgerService {
  constructor(private readonly _program: FreebetLedgerProgram) {}

  public spendFreebet(
    betProgramId: ActorId,
    matchId: string | number | bigint,
    amount: string | number | bigint,
    predictedScore: Score,
    predictedPenaltyWinner: PenaltyWinner | null,
  ): TransactionBuilder<number | string | bigint> {
    return new TransactionBuilder<number | string | bigint>(
      this._program.api,
      this._program.registry,
      'send_message',
      [
        'FreebetLedger',
        'SpendFreebet',
        betProgramId,
        BigInt(matchId),
        BigInt(amount),
        predictedScore,
        predictedPenaltyWinner,
      ],
      '(String, String, [u8;32], u64, u128, Score, Option<PenaltyWinner>)',
      'u128',
      this._program.programId,
    );
  }

  public async balanceOf(
    user: ActorId,
    originAddress?: string,
    atBlock?: `0x${string}`,
  ): Promise<string> {
    const payload = this._program.registry
      .createType('(String, String, [u8;32])', ['FreebetLedger', 'BalanceOf', user])
      .toHex();

    const reply = await this._program.api.message.calculateReply({
      destination: this._program.programId,
      origin: originAddress ? decodeAddress(originAddress) : ZERO_ADDRESS,
      payload,
      value: 0,
      gasLimit: this._program.api.blockGasLimit.toBigInt(),
      at: atBlock,
    });

    if (!reply.code.isSuccess) {
      throw new Error(this._program.registry.createType('String', reply.payload).toString());
    }

    const result = this._program.registry.createType('(String, String, u128)', reply.payload);
    return result[2].toString();
  }
}
