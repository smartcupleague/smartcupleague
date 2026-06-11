import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";

@Entity("bolao_match")
export class BolaoMatch {
  @PrimaryColumn("varchar")
  id!: string; // match_id.toString()

  @Index()
  @Column("bigint")
  matchId!: string; // u64 stored as string

  @Index()
  @Column("varchar")
  phase!: string;

  @Column("varchar")
  home!: string;

  @Column("varchar")
  away!: string;

  @Column("bigint")
  kickOff!: string; // unix seconds

  @Index()
  @Column("varchar", { default: "UNRESOLVED" })
  status!: string; // UNRESOLVED | PROPOSED | FINALIZED | SETTLED | CANCELLED

  @Column("int", { nullable: true })
  scoreHome!: number | null;

  @Column("int", { nullable: true })
  scoreAway!: number | null;

  @Column("varchar", { nullable: true })
  penaltyWinner!: string | null; // HOME | AWAY | null

  @Column("numeric", { default: "0" })
  prizePoolRaw!: string; // u128 VARA smallest unit

  @Column("int", { default: 0 })
  betsCount!: number;

  @Column("timestamp with time zone")
  createdAt!: Date;

  @Index()
  @Column("timestamp with time zone")
  updatedAt!: Date;
}

@Entity("bet")
export class Bet {
  @PrimaryColumn("varchar")
  id!: string; // message.id (chain-derived, idempotent)

  @Index()
  @Column("varchar")
  user!: string;

  @Index()
  @Column("varchar")
  matchId!: string;

  @ManyToOne(() => BolaoMatch, { nullable: false })
  @JoinColumn({ name: "match_id" })
  matchRef!: BolaoMatch;

  @Column("int")
  scoreHome!: number;

  @Column("int")
  scoreAway!: number;

  @Column("varchar", { nullable: true })
  penaltyWinner!: string | null;

  @Column("numeric")
  stakeRaw!: string; // u128

  @Index()
  @Column("bigint")
  blockNumber!: string;

  @Index()
  @Column("timestamp with time zone")
  timestamp!: Date;
}

@Entity("user_stat")
export class UserStat {
  @PrimaryColumn("varchar")
  id!: string; // user hex address

  @Column("int", { default: 0 })
  totalBets!: number;

  @Column("numeric", { default: "0" })
  totalStakedRaw!: string;

  @Column("int", { default: 0 })
  totalPoints!: number;

  @Column("int", { default: 0 })
  exactCount!: number;

  @Column("int", { default: 0 })
  outcomeCount!: number;

  @Column("numeric", { default: "0" })
  totalClaimedRaw!: string;

  @Column("numeric", { default: "0" })
  finalPrizeClaimedRaw!: string;

  @Column("numeric", { default: "0" })
  totalRefundClaimedRaw!: string;

  @Index()
  @Column("timestamp with time zone")
  updatedAt!: Date;
}

@Entity("match_reward")
export class MatchReward {
  @PrimaryColumn("varchar")
  id!: string; // message.id

  @Index()
  @Column("varchar")
  matchId!: string;

  @ManyToOne(() => BolaoMatch, { nullable: false })
  @JoinColumn({ name: "match_id" })
  matchRef!: BolaoMatch;

  @Index()
  @Column("varchar")
  user!: string;

  @Column("numeric")
  amountRaw!: string;

  @Index()
  @Column("bigint")
  blockNumber!: string;

  @Index()
  @Column("timestamp with time zone")
  timestamp!: Date;
}

@Entity("final_prize_claim")
export class FinalPrizeClaim {
  @PrimaryColumn("varchar")
  id!: string; // message.id

  @Index()
  @Column("varchar")
  user!: string;

  @Column("numeric")
  amountRaw!: string;

  @Index()
  @Column("bigint")
  blockNumber!: string;

  @Index()
  @Column("timestamp with time zone")
  timestamp!: Date;
}

@Entity("refund_claim")
export class RefundClaim {
  @PrimaryColumn("varchar")
  id!: string; // message.id

  @Index()
  @Column("varchar")
  user!: string;

  @Column("numeric")
  amountRaw!: string; // u128 — aggregated pull (may cover multiple cancelled matches)

  @Index()
  @Column("bigint")
  blockNumber!: string;

  @Index()
  @Column("timestamp with time zone")
  timestamp!: Date;
}

@Entity("activity_record")
export class ActivityRecord {
  @PrimaryColumn("varchar")
  id!: string; // message.id

  @Index()
  @Column("varchar")
  type!: string;

  @Index()
  @Column("varchar", { nullable: true })
  user!: string | null;

  @Index()
  @Column("varchar", { nullable: true })
  matchId!: string | null;

  @Column("numeric", { nullable: true })
  amountRaw!: string | null;

  @Column("int", { nullable: true })
  points!: number | null;

  @Column("text", { nullable: true })
  meta!: string | null; // JSON-encoded extra fields

  @Index()
  @Column("bigint")
  blockNumber!: string;

  @Index()
  @Column("timestamp with time zone")
  timestamp!: Date;
}
