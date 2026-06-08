import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import {
  GaslessProgram,
  GaslessProgramStatus,
} from './entities/gasless-program.entity';
import { Voucher } from './entities/voucher.entity';

config();

type SeedProgram = {
  name: string;
  address: string;
  weight: number;
  duration: number;
  oneTime: boolean;
};

const PROGRAM_ID_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * SmartCup program whitelist for the voucher backend.
 *
 * Preferred env:
 *   SMARTCUP_GASLESS_PROGRAMS=BolaoCoreMini:0x...,BolaoCoreWorldCup:0x...,FreebetLedger:0x...
 *
 * Convenience fallback envs:
 *   BOLAO_PROGRAM_ID, ORACLE_PROGRAM_ID, DAO_PROGRAM_ID, FREEBET_LEDGER_ID
 *
 * Season model: POST /voucher accepts `programs: string[]` and registers all
 * listed programs on a single voucher. `varaToIssue` and `weight` are retained
 * for schema compatibility; the live service uses HOURLY_TRANCHE_VARA as the
 * uniform funding amount for each voucher tranche.
 */
function parseProgramList(): SeedProgram[] {
  const duration = Number(process.env.TRANCHE_DURATION_SEC || '86400');
  const configured = (process.env.SMARTCUP_GASLESS_PROGRAMS || '').trim();

  const entries = configured
    ? configured.split(',').map((entry) => {
        const [rawName, rawAddress] = entry.split(':');
        return {
          name: (rawName || '').trim(),
          address: (rawAddress || '').trim().toLowerCase(),
        };
      })
    : [
        {
          name: 'BolaoCore',
          address: (process.env.BOLAO_PROGRAM_ID || '').trim().toLowerCase(),
        },
        {
          name: 'Oracle',
          address: (process.env.ORACLE_PROGRAM_ID || '').trim().toLowerCase(),
        },
        {
          name: 'DAO',
          address: (process.env.DAO_PROGRAM_ID || '').trim().toLowerCase(),
        },
        {
          name: 'FreebetLedger',
          address: (process.env.FREEBET_LEDGER_ID || '').trim().toLowerCase(),
        },
      ].filter((program) => program.address);

  const seen = new Set<string>();
  const programs: SeedProgram[] = [];

  for (const entry of entries) {
    if (!entry.name) {
      throw new Error('Each gasless program must have a name. Use Name:0xProgramId.');
    }
    if (!PROGRAM_ID_RE.test(entry.address)) {
      throw new Error(`Invalid program id for ${entry.name}: ${entry.address}`);
    }
    if (seen.has(entry.address)) {
      continue;
    }
    seen.add(entry.address);
    programs.push({
      name: entry.name,
      address: entry.address,
      weight: 1,
      duration,
      oneTime: false,
    });
  }

  if (programs.length === 0) {
    throw new Error(
      'No SmartCup gasless programs configured. Set SMARTCUP_GASLESS_PROGRAMS or one of BOLAO_PROGRAM_ID/ORACLE_PROGRAM_ID/DAO_PROGRAM_ID/FREEBET_LEDGER_ID.',
    );
  }

  return programs;
}

async function seed() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [GaslessProgram, Voucher],
    synchronize: true,
  });

  await ds.initialize();
  const repo = ds.getRepository(GaslessProgram);

  const trancheVara = Number(process.env.HOURLY_TRANCHE_VARA || '500');

  const programs = parseProgramList();

  for (const p of programs) {
    // varaToIssue is inactive now (kept for schema compat).
    // Display value tracks trancheVara so the DB state is self-documenting.
    const varaToIssue = trancheVara;
    const existing = await repo.findOneBy({ address: p.address });

    if (existing) {
      existing.weight = p.weight;
      existing.varaToIssue = varaToIssue;
      existing.duration = p.duration;
      await repo.save(existing);
      console.log(
        `[update] ${p.name} ${p.address.slice(0, 12)}... (tranche=${trancheVara} VARA)`,
      );
      continue;
    }

    await repo.save({
      name: p.name,
      address: p.address,
      varaToIssue,
      weight: p.weight,
      duration: p.duration,
      status: GaslessProgramStatus.Enabled,
      oneTime: p.oneTime,
      createdAt: new Date(),
    });
    console.log(
      `[seed] ${p.name} ${p.address.slice(0, 12)}... (tranche=${trancheVara} VARA)`,
    );
  }

  console.log('Seed complete.');
  await ds.destroy();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
