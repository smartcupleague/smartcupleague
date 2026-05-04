export class Initial1746000000000 {
  name = "Initial1746000000000";

  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bolao_match" (
        "id"              varchar NOT NULL,
        "match_id"        bigint  NOT NULL,
        "phase"           varchar NOT NULL,
        "home"            varchar NOT NULL,
        "away"            varchar NOT NULL,
        "kick_off"        bigint  NOT NULL,
        "status"          varchar NOT NULL DEFAULT 'UNRESOLVED',
        "score_home"      integer,
        "score_away"      integer,
        "penalty_winner"  varchar,
        "prize_pool_raw"  numeric NOT NULL DEFAULT '0',
        "bets_count"      integer NOT NULL DEFAULT 0,
        "created_at"      timestamptz NOT NULL,
        "updated_at"      timestamptz NOT NULL,
        CONSTRAINT "PK_bolao_match" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bolao_match_match_id" ON "bolao_match" ("match_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bolao_match_phase"    ON "bolao_match" ("phase")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bolao_match_status"   ON "bolao_match" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bolao_match_updated"  ON "bolao_match" ("updated_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bet" (
        "id"              varchar NOT NULL,
        "user"            varchar NOT NULL,
        "match_id"        varchar NOT NULL,
        "score_home"      integer NOT NULL,
        "score_away"      integer NOT NULL,
        "penalty_winner"  varchar,
        "stake_raw"       numeric NOT NULL,
        "block_number"    bigint  NOT NULL,
        "timestamp"       timestamptz NOT NULL,
        CONSTRAINT "PK_bet" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bet_match" FOREIGN KEY ("match_id") REFERENCES "bolao_match" ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bet_user"         ON "bet" ("user")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bet_match_id"     ON "bet" ("match_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bet_block_number" ON "bet" ("block_number")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_bet_timestamp"    ON "bet" ("timestamp")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_stat" (
        "id"                       varchar NOT NULL,
        "total_bets"               integer NOT NULL DEFAULT 0,
        "total_staked_raw"         numeric NOT NULL DEFAULT '0',
        "total_points"             integer NOT NULL DEFAULT 0,
        "total_claimed_raw"        numeric NOT NULL DEFAULT '0',
        "final_prize_claimed_raw"  numeric NOT NULL DEFAULT '0',
        "updated_at"               timestamptz NOT NULL,
        CONSTRAINT "PK_user_stat" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_stat_updated" ON "user_stat" ("updated_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "match_reward" (
        "id"           varchar NOT NULL,
        "match_id"     varchar NOT NULL,
        "user"         varchar NOT NULL,
        "amount_raw"   numeric NOT NULL,
        "block_number" bigint  NOT NULL,
        "timestamp"    timestamptz NOT NULL,
        CONSTRAINT "PK_match_reward" PRIMARY KEY ("id"),
        CONSTRAINT "FK_match_reward_match" FOREIGN KEY ("match_id") REFERENCES "bolao_match" ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_match_reward_match_id"     ON "match_reward" ("match_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_match_reward_user"         ON "match_reward" ("user")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_match_reward_block_number" ON "match_reward" ("block_number")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_match_reward_timestamp"    ON "match_reward" ("timestamp")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "final_prize_claim" (
        "id"           varchar NOT NULL,
        "user"         varchar NOT NULL,
        "amount_raw"   numeric NOT NULL,
        "block_number" bigint  NOT NULL,
        "timestamp"    timestamptz NOT NULL,
        CONSTRAINT "PK_final_prize_claim" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_final_prize_claim_user"         ON "final_prize_claim" ("user")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_final_prize_claim_block_number" ON "final_prize_claim" ("block_number")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_final_prize_claim_timestamp"    ON "final_prize_claim" ("timestamp")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_record" (
        "id"           varchar NOT NULL,
        "type"         varchar NOT NULL,
        "user"         varchar,
        "match_id"     varchar,
        "amount_raw"   numeric,
        "points"       integer,
        "meta"         text,
        "block_number" bigint  NOT NULL,
        "timestamp"    timestamptz NOT NULL,
        CONSTRAINT "PK_activity_record" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_record_type"         ON "activity_record" ("type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_record_user"         ON "activity_record" ("user")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_record_match_id"     ON "activity_record" ("match_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_record_block_number" ON "activity_record" ("block_number")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_activity_record_timestamp"    ON "activity_record" ("timestamp")`);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_record"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "final_prize_claim"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_reward"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_stat"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bet"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bolao_match"`);
  }
}
