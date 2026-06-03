export class RefundProjection1746000001000 {
  name = "RefundProjection1746000001000";

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "user_stat"
      ADD COLUMN IF NOT EXISTS "total_refund_claimed_raw" numeric NOT NULL DEFAULT '0'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refund_claim" (
        "id"           varchar NOT NULL,
        "user"         varchar NOT NULL,
        "amount_raw"   numeric NOT NULL,
        "block_number" bigint  NOT NULL,
        "timestamp"    timestamptz NOT NULL,
        CONSTRAINT "PK_refund_claim" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refund_claim_user"         ON "refund_claim" ("user")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refund_claim_block_number" ON "refund_claim" ("block_number")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refund_claim_timestamp"    ON "refund_claim" ("timestamp")`);
  }

  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS "refund_claim"`);
    await queryRunner.query(`ALTER TABLE "user_stat" DROP COLUMN IF EXISTS "total_refund_claimed_raw"`);
  }
}
