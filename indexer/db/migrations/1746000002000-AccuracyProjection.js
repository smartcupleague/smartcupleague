export class AccuracyProjection1746000002000 {
  name = "AccuracyProjection1746000002000";

  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE "user_stat"
      ADD COLUMN IF NOT EXISTS "exact_count" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE "user_stat"
      ADD COLUMN IF NOT EXISTS "outcome_count" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "user_stat"
      SET "exact_count" = 0,
          "outcome_count" = 0
    `);

    await queryRunner.query(`
      WITH scored_bets AS (
        SELECT
          b."user",
          (b."score_home" = m."score_home" AND b."score_away" = m."score_away") AS exact_hit,
          CASE
            WHEN b."score_home" > b."score_away" THEN 'home'
            WHEN b."score_home" < b."score_away" THEN 'away'
            WHEN lower(coalesce(b."penalty_winner", '')) = 'home' THEN 'home'
            WHEN lower(coalesce(b."penalty_winner", '')) = 'away' THEN 'away'
            ELSE 'draw'
          END AS bet_outcome,
          CASE
            WHEN m."score_home" > m."score_away" THEN 'home'
            WHEN m."score_home" < m."score_away" THEN 'away'
            WHEN lower(coalesce(m."penalty_winner", '')) = 'home' THEN 'home'
            WHEN lower(coalesce(m."penalty_winner", '')) = 'away' THEN 'away'
            ELSE 'draw'
          END AS final_outcome
        FROM "bet" b
        JOIN "bolao_match" m ON m."id" = b."match_id"
        WHERE m."status" IN ('FINALIZED', 'SETTLED')
          AND m."score_home" IS NOT NULL
          AND m."score_away" IS NOT NULL
      ),
      accuracy AS (
        SELECT
          "user",
          count(*) FILTER (WHERE exact_hit) AS exact_count,
          count(*) FILTER (WHERE exact_hit OR bet_outcome = final_outcome) AS outcome_count
        FROM scored_bets
        GROUP BY "user"
      )
      UPDATE "user_stat" us
      SET "exact_count" = accuracy.exact_count,
          "outcome_count" = accuracy.outcome_count
      FROM accuracy
      WHERE us."id" = accuracy."user"
    `);
  }

  async down(queryRunner) {
    await queryRunner.query(`ALTER TABLE "user_stat" DROP COLUMN IF EXISTS "outcome_count"`);
    await queryRunner.query(`ALTER TABLE "user_stat" DROP COLUMN IF EXISTS "exact_count"`);
  }
}
