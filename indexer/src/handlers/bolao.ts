import { In } from "typeorm";
import { BaseHandler } from "./base.js";
import { ProcessorContext } from "../processor.js";
import { SailsDecoder } from "../sails-decoder.js";
import { isUserMessageSentEvent, isSailsEvent } from "../helpers/is.js";
import { UserMessageSentEvent } from "../types/index.js";
import {
  BolaoMatch,
  Bet,
  UserStat,
  MatchReward,
  FinalPrizeClaim,
  RefundClaim,
  ActivityRecord,
} from "../model/entities.js";
import { config } from "../config.js";

// ---- IDL event payload shapes (tuple structs decode as arrays) ----

type ScorePayload = { home: number; away: number };
type PenaltyWinner = "Home" | "Away";

type BetAcceptedPayload = [
  string,            // user: actor_id
  bigint,            // match_id: u64
  ScorePayload,      // Score
  PenaltyWinner | null, // opt PenaltyWinner
  bigint,            // stake: u128
];

type MatchRegisteredPayload = [
  bigint, string, string, string, bigint
  // match_id, phase, home, away, kick_off
];

type ResultProposedPayload = [
  bigint, ScorePayload, PenaltyWinner | null, string, bigint
  // match_id, score, penalty_winner, oracle, proposed_at
];

type ResultFinalizedPayload = [
  bigint, ScorePayload, PenaltyWinner | null
  // match_id, score, penalty_winner
];

type SettlementPreparedPayload = [bigint, bigint]; // match_id, winner_stake

type PointsAwardedPayload = [string, bigint, number]; // user, match_id, points

type MatchRewardClaimedPayload = [bigint, string, bigint]; // match_id, user, amount

type FinalPrizeClaimedPayload = [string, bigint]; // user, amount

type PodiumFinalizedPayload = [string, string, string]; // champion, runner_up, third_place

type PodiumBonusAwardedPayload = [string, number]; // user, bonus_points

type MatchCancelledPayload = [bigint, bigint]; // match_id, total_refunded
type RefundClaimedPayload = [string, bigint];  // user, amount

function toBigInt(value: bigint | number | string): bigint {
  return BigInt(value);
}

function toNumericString(value: bigint | number | string): string {
  return toBigInt(value).toString();
}

// ---- Handler ----

export class BolaoHandler extends BaseHandler {
  private decoder!: SailsDecoder;
  private programId: string;

  // Batch-local state — cleared per batch
  private matches = new Map<string, BolaoMatch>();
  private bets = new Map<string, Bet>();
  private userStats = new Map<string, UserStat>();
  private rewards = new Map<string, MatchReward>();
  private prizes = new Map<string, FinalPrizeClaim>();
  private refunds = new Map<string, RefundClaim>();
  private activity = new Map<string, ActivityRecord>();

  // Tracks which matches were touched this batch (need DB merge)
  private touchedMatchIds = new Set<string>();
  private touchedUserIds = new Set<string>();

  constructor(programId: string) {
    super();
    this.programId = programId;
  }

  async init(idlPath: string): Promise<void> {
    this.decoder = await SailsDecoder.new(idlPath);
  }

  clear(): void {
    this.matches.clear();
    this.bets.clear();
    this.userStats.clear();
    this.rewards.clear();
    this.prizes.clear();
    this.refunds.clear();
    this.activity.clear();
    this.touchedMatchIds.clear();
    this.touchedUserIds.clear();
  }

  async process(ctx: ProcessorContext): Promise<void> {
    await super.process(ctx);

    // Collect all match IDs and user IDs referenced in this batch first
    // so we can load them from DB in bulk before processing events
    const preloadMatchIds = new Set<string>();
    const preloadUserIds = new Set<string>();

    for (const block of ctx.blocks) {
      for (const event of block.events) {
        if (!isUserMessageSentEvent(event)) continue;
        if (event.args.message.source !== this.programId) continue;
        if (!isSailsEvent(event)) continue;

        try {
          const { method, payload } = this.decoder.decodeEvent(event);
          this.collectPreloadIds(method, payload, preloadMatchIds, preloadUserIds);
        } catch {
          // skip undecodable events
        }
      }
    }

    // Bulk load existing matches and user stats from DB
    await this.preloadMatches(preloadMatchIds);
    await this.preloadUserStats(preloadUserIds);

    // Process events
    for (const block of ctx.blocks) {
      const blockNumber = BigInt(block.header.height).toString();
      const timestamp = new Date(block.header.timestamp ?? 0);

      for (const event of block.events) {
        if (!isUserMessageSentEvent(event)) continue;
        if (event.args.message.source !== this.programId) continue;
        if (!isSailsEvent(event)) continue;

        try {
          await this.handleEvent(event, blockNumber, timestamp);
        } catch (err) {
          ctx.log.warn({ err, msgId: event.args.message.id }, "Failed to handle event");
        }
      }
    }
  }

  private collectPreloadIds(
    method: string,
    payload: unknown,
    matchIds: Set<string>,
    userIds: Set<string>
  ) {
    switch (method) {
      case "BetAccepted": {
        const p = payload as BetAcceptedPayload;
        matchIds.add(toNumericString(p[1]));
        userIds.add(p[0]);
        break;
      }
      case "PointsAwarded": {
        const p = payload as PointsAwardedPayload;
        matchIds.add(toNumericString(p[1]));
        userIds.add(p[0]);
        break;
      }
      case "MatchRewardClaimed": {
        const p = payload as MatchRewardClaimedPayload;
        matchIds.add(toNumericString(p[0]));
        userIds.add(p[1]);
        break;
      }
      case "FinalPrizeClaimed": {
        const p = payload as FinalPrizeClaimedPayload;
        userIds.add(p[0]);
        break;
      }
      case "ResultProposed":
      case "ResultFinalized":
      case "SettlementPrepared": {
        const p = payload as [bigint, ...unknown[]];
        matchIds.add(toNumericString(p[0]));
        break;
      }
      case "MatchCancelled": {
        const p = payload as MatchCancelledPayload;
        matchIds.add(toNumericString(p[0]));
        break;
      }
      case "RefundClaimed": {
        const p = payload as RefundClaimedPayload;
        userIds.add(p[0]);
        break;
      }
    }
  }

  private async preloadMatches(ids: Set<string>): Promise<void> {
    if (!ids.size) return;
    const existing = await this._ctx.store.find(BolaoMatch, {
      where: { id: In([...ids]) },
    });
    for (const m of existing) {
      this.matches.set(m.id, m);
    }
  }

  private async preloadUserStats(ids: Set<string>): Promise<void> {
    if (!ids.size) return;
    const existing = await this._ctx.store.find(UserStat, {
      where: { id: In([...ids]) },
    });
    for (const s of existing) {
      this.userStats.set(s.id, s);
    }
  }

  private async handleEvent(
    event: UserMessageSentEvent,
    blockNumber: string,
    timestamp: Date
  ): Promise<void> {
    const msgId = event.args.message.id;
    const { service, method, payload } = this.decoder.decodeEvent(event);

    if (service !== "Service") return;

    switch (method) {
      case "MatchRegistered":
        this.onMatchRegistered(payload as MatchRegisteredPayload, timestamp);
        break;

      case "PhaseRegistered":
        this.onActivity(msgId, "PHASE_REGISTERED", null, null, null, null, JSON.stringify({ phase: payload }), blockNumber, timestamp);
        break;

      case "BetAccepted":
        this.onBetAccepted(msgId, payload as BetAcceptedPayload, blockNumber, timestamp);
        break;

      case "ResultProposed":
        this.onResultProposed(payload as ResultProposedPayload, timestamp);
        break;

      case "ResultFinalized":
        this.onResultFinalized(payload as ResultFinalizedPayload, timestamp);
        break;

      case "SettlementPrepared":
        this.onSettlementPrepared(payload as SettlementPreparedPayload, timestamp);
        break;

      case "PointsAwarded":
        this.onPointsAwarded(msgId, payload as PointsAwardedPayload, blockNumber, timestamp);
        break;

      case "MatchRewardClaimed":
        this.onMatchRewardClaimed(msgId, payload as MatchRewardClaimedPayload, blockNumber, timestamp);
        break;

      case "FinalPrizeClaimed":
        this.onFinalPrizeClaimed(msgId, payload as FinalPrizeClaimedPayload, blockNumber, timestamp);
        break;

      case "PodiumFinalized":
        this.onActivity(msgId, "PODIUM_FINALIZED", null, null, null, null, JSON.stringify({ podium: payload }), blockNumber, timestamp);
        break;

      case "PodiumBonusAwarded": {
        const p = payload as PodiumBonusAwardedPayload;
        this.onActivity(msgId, "PODIUM_BONUS", p[0], null, null, p[1], null, blockNumber, timestamp);
        this.touchUser(p[0], timestamp, { addPoints: p[1] });
        break;
      }

      case "MatchCancelled":
        this.onMatchCancelled(msgId, payload as MatchCancelledPayload, blockNumber, timestamp);
        break;

      case "RefundClaimed":
        this.onRefundClaimed(msgId, payload as RefundClaimedPayload, blockNumber, timestamp);
        break;

      default:
        break;
    }
  }

  // ---- Projection methods ----

  private onMatchRegistered(
    [matchId, phase, home, away, kickOff]: MatchRegisteredPayload,
    timestamp: Date
  ) {
    const id = toNumericString(matchId);
    const match = new BolaoMatch();
    match.id = id;
    match.matchId = id;
    match.phase = phase;
    match.home = home;
    match.away = away;
    match.kickOff = toNumericString(kickOff);
    match.status = "UNRESOLVED";
    match.scoreHome = null;
    match.scoreAway = null;
    match.penaltyWinner = null;
    match.prizePoolRaw = "0";
    match.betsCount = 0;
    match.createdAt = timestamp;
    match.updatedAt = timestamp;
    this.matches.set(id, match);
  }

  private onBetAccepted(
    msgId: `0x${string}`,
    [user, matchId, score, penaltyWinner, stake]: BetAcceptedPayload,
    blockNumber: string,
    timestamp: Date
  ) {
    const mId = toNumericString(matchId);
    const stakeRaw = toBigInt(stake);

    const bet = new Bet();
    bet.id = msgId;
    bet.user = user;
    bet.matchId = mId;
    bet.matchRef = { id: mId } as BolaoMatch;
    bet.scoreHome = score.home;
    bet.scoreAway = score.away;
    bet.penaltyWinner = penaltyWinner;
    bet.stakeRaw = stakeRaw.toString();
    bet.blockNumber = blockNumber;
    bet.timestamp = timestamp;
    this.bets.set(msgId, bet);

    // Update match pool + count
    const match = this.matches.get(mId);
    if (match) {
      match.betsCount += 1;
      match.prizePoolRaw = (BigInt(match.prizePoolRaw) + stakeRaw).toString();
      match.updatedAt = timestamp;
    }

    // Update user stats
    this.touchUser(user, timestamp, { addBet: true, addStake: stakeRaw });

    this.onActivity(msgId, "BET_ACCEPTED", user, mId, stakeRaw.toString(), null, null, blockNumber, timestamp);
  }

  private onResultProposed(
    [matchId, score, penaltyWinner]: ResultProposedPayload,
    timestamp: Date
  ) {
    const mId = toNumericString(matchId);
    const match = this.matches.get(mId);
    if (match) {
      match.status = "PROPOSED";
      match.scoreHome = score.home;
      match.scoreAway = score.away;
      match.penaltyWinner = penaltyWinner;
      match.updatedAt = timestamp;
    }
  }

  private onResultFinalized(
    [matchId, score, penaltyWinner]: ResultFinalizedPayload,
    timestamp: Date
  ) {
    const mId = toNumericString(matchId);
    const match = this.matches.get(mId);
    if (match) {
      match.status = "FINALIZED";
      match.scoreHome = score.home;
      match.scoreAway = score.away;
      match.penaltyWinner = penaltyWinner;
      match.updatedAt = timestamp;
    }
  }

  private onSettlementPrepared(
    [matchId]: SettlementPreparedPayload,
    timestamp: Date
  ) {
    const mId = toNumericString(matchId);
    const match = this.matches.get(mId);
    if (match) {
      match.status = "SETTLED";
      match.updatedAt = timestamp;
    }
  }

  private onPointsAwarded(
    msgId: `0x${string}`,
    [user, matchId, points]: PointsAwardedPayload,
    blockNumber: string,
    timestamp: Date
  ) {
    this.touchUser(user, timestamp, { addPoints: points });
    this.onActivity(msgId, "POINTS_AWARDED", user, toNumericString(matchId), null, points, null, blockNumber, timestamp);
  }

  private onMatchRewardClaimed(
    msgId: `0x${string}`,
    [matchId, user, amount]: MatchRewardClaimedPayload,
    blockNumber: string,
    timestamp: Date
  ) {
    const mId = toNumericString(matchId);
    const amountRaw = toBigInt(amount);
    const reward = new MatchReward();
    reward.id = msgId;
    reward.matchId = mId;
    reward.matchRef = { id: mId } as BolaoMatch;
    reward.user = user;
    reward.amountRaw = amountRaw.toString();
    reward.blockNumber = blockNumber;
    reward.timestamp = timestamp;
    this.rewards.set(msgId, reward);

    this.touchUser(user, timestamp, { addClaimed: amountRaw });
    this.onActivity(msgId, "MATCH_REWARD_CLAIMED", user, mId, amountRaw.toString(), null, null, blockNumber, timestamp);
  }

  private onFinalPrizeClaimed(
    msgId: `0x${string}`,
    [user, amount]: FinalPrizeClaimedPayload,
    blockNumber: string,
    timestamp: Date
  ) {
    const claim = new FinalPrizeClaim();
    claim.id = msgId;
    claim.user = user;
    const amountRaw = toBigInt(amount);
    claim.amountRaw = amountRaw.toString();
    claim.blockNumber = blockNumber;
    claim.timestamp = timestamp;
    this.prizes.set(msgId, claim);

    this.touchUser(user, timestamp, { addFinalPrize: amountRaw });
    this.onActivity(msgId, "FINAL_PRIZE_CLAIMED", user, null, amountRaw.toString(), null, null, blockNumber, timestamp);
  }

  private onMatchCancelled(
    msgId: `0x${string}`,
    [matchId, totalRefunded]: MatchCancelledPayload,
    blockNumber: string,
    timestamp: Date
  ) {
    const mId = toNumericString(matchId);
    const match = this.matches.get(mId);
    if (match) {
      match.status = "CANCELLED";
      // The match pool is zeroed by cancel_match — refunds are tracked separately.
      match.prizePoolRaw = "0";
      match.updatedAt = timestamp;
    }
    this.onActivity(
      msgId,
      "MATCH_CANCELLED",
      null,
      mId,
      toNumericString(totalRefunded),
      null,
      null,
      blockNumber,
      timestamp,
    );
  }

  private onRefundClaimed(
    msgId: `0x${string}`,
    [user, amount]: RefundClaimedPayload,
    blockNumber: string,
    timestamp: Date
  ) {
    const refund = new RefundClaim();
    refund.id = msgId;
    refund.user = user;
    const amountRaw = toBigInt(amount);
    refund.amountRaw = amountRaw.toString();
    refund.blockNumber = blockNumber;
    refund.timestamp = timestamp;
    this.refunds.set(msgId, refund);

    this.touchUser(user, timestamp, { addRefund: amountRaw });
    this.onActivity(msgId, "REFUND_CLAIMED", user, null, amountRaw.toString(), null, null, blockNumber, timestamp);
  }

  private onActivity(
    id: string,
    type: string,
    user: string | null,
    matchId: string | null,
    amountRaw: string | null,
    points: number | null,
    meta: string | null,
    blockNumber: string,
    timestamp: Date
  ) {
    const rec = new ActivityRecord();
    rec.id = id;
    rec.type = type;
    rec.user = user;
    rec.matchId = matchId;
    rec.amountRaw = amountRaw;
    rec.points = points;
    rec.meta = meta;
    rec.blockNumber = blockNumber;
    rec.timestamp = timestamp;
    this.activity.set(id, rec);
  }

  private touchUser(
    userId: string,
    timestamp: Date,
    delta: {
      addBet?: boolean;
      addStake?: bigint;
      addPoints?: number;
      addClaimed?: bigint;
      addFinalPrize?: bigint;
      addRefund?: bigint;
    }
  ) {
    let stat = this.userStats.get(userId);
    if (!stat) {
      stat = new UserStat();
      stat.id = userId;
      stat.totalBets = 0;
      stat.totalStakedRaw = "0";
      stat.totalPoints = 0;
      stat.totalClaimedRaw = "0";
      stat.finalPrizeClaimedRaw = "0";
      stat.totalRefundClaimedRaw = "0";
      this.userStats.set(userId, stat);
    }
    if (delta.addBet) stat.totalBets += 1;
    if (delta.addStake !== undefined)
      stat.totalStakedRaw = (BigInt(stat.totalStakedRaw) + delta.addStake).toString();
    if (delta.addPoints !== undefined) stat.totalPoints += delta.addPoints;
    if (delta.addClaimed !== undefined)
      stat.totalClaimedRaw = (BigInt(stat.totalClaimedRaw) + delta.addClaimed).toString();
    if (delta.addFinalPrize !== undefined)
      stat.finalPrizeClaimedRaw = (BigInt(stat.finalPrizeClaimedRaw) + delta.addFinalPrize).toString();
    if (delta.addRefund !== undefined)
      stat.totalRefundClaimedRaw = (BigInt(stat.totalRefundClaimedRaw ?? "0") + delta.addRefund).toString();
    stat.updatedAt = timestamp;
    this.touchedUserIds.add(userId);
  }

  async save(): Promise<void> {
    const matchesToSave = [...this.matches.values()];
    if (matchesToSave.length > 0) await this._ctx.store.save(matchesToSave);

    const betsToSave = [...this.bets.values()];
    if (betsToSave.length > 0) await this._ctx.store.save(betsToSave);

    const statsToSave = [...this.userStats.values()];
    if (statsToSave.length > 0) await this._ctx.store.save(statsToSave);

    const rewardsToSave = [...this.rewards.values()];
    if (rewardsToSave.length > 0) await this._ctx.store.save(rewardsToSave);

    const prizesToSave = [...this.prizes.values()];
    if (prizesToSave.length > 0) await this._ctx.store.save(prizesToSave);

    const refundsToSave = [...this.refunds.values()];
    if (refundsToSave.length > 0) await this._ctx.store.save(refundsToSave);

    const activityToSave = [...this.activity.values()];
    if (activityToSave.length > 0) await this._ctx.store.save(activityToSave);
  }
}
