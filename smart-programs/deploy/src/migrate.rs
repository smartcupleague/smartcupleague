//! Migration script: SOURCE BolaoCore → SINK BolaoCore
//!
//! Env vars:
//!   MNEMONIC               — admin seed phrase (must be admin on SOURCE and existing Oracle)
//!   SOURCE_BOLAO_ID        — 0x... SOURCE contract (with bets, pre-freebet on-chain format)
//!   SINK_BOLAO_ID          — 0x... SINK contract (deployed with new_as_importer)
//!   SINK_ORACLE_ID         — 0x... Oracle-Program to re-wire on SINK + update its back-link
//!   SINK_FREEBET_LEDGER_ID — 0x... FreebetLedger to wire on SINK (optional)
//!   VARA_NETWORK           — "testnet" (default) | "mainnet"

use anyhow::Context as _;
use gclient::{EventProcessor, GearApi};
use oracle_client::service::Service as OracleService;
use oracle_client::OracleProgram;
use sails_rs::client::{Actor, GclientEnv};
use sails_rs::prelude::ActorId;
use bolao_client::BolaoProgram;
use bolao_client::service::Service as BolaoService;

/// Legacy MigrationMetadata layout (pre-freebet SOURCE contracts).
/// Identical to bolao_client::MigrationMetadata but WITHOUT freebet_ledger_program_id.
/// Used to safely SCALE-decode SOURCE responses before converting to the new format.
#[derive(sails_rs::scale_codec::Decode)]
#[codec(crate = sails_rs::scale_codec)]
struct LegacyMigrationMetadata {
    pub admins:                     Vec<ActorId>,
    pub operators:                  Vec<ActorId>,
    pub treasury:                   ActorId,
    pub authorized_oracles:         Vec<(ActorId, bool)>,
    pub next_match_id:              u64,
    pub protocol_fee_accumulated:   u128,
    pub final_prize_accumulated:    u128,
    pub r32_lock_time:              Option<u64>,
    pub podium_result:              Option<bolao_client::PodiumResult>,
    pub podium_finalized:           bool,
    pub final_prize_finalized:      bool,
    pub final_prize_claimable_total: u128,
    pub final_prize_rounding_dust:  u128,
    pub vara_price_usd_micro:       u64,
    pub price_cached_at:            u64,
    pub price_staleness_limit_ms:   u64,
    pub price_oracle_program_id:    Option<ActorId>,
    // NOTE: freebet_ledger_program_id is absent in the old format — it sits between
    //       price_oracle_program_id and pending_refunds_scalar in the new struct.
    pub pending_refunds_scalar:     u128,
}

/// Legacy Bet layout (pre-freebet SOURCE contracts) — no freebet_principal field.
#[derive(sails_rs::scale_codec::Decode)]
#[codec(crate = sails_rs::scale_codec)]
struct LegacyBet {
    pub user:                ActorId,
    pub match_id:            u64,
    pub score:               bolao_client::Score,
    pub penalty_winner:      Option<bolao_client::PenaltyWinner>,
    pub stake_in_match_pool: u128,
    pub claimed:             bool,
}

/// Legacy UserBetRecord layout (pre-freebet SOURCE contracts) — no freebet_principal field.
#[derive(sails_rs::scale_codec::Decode)]
#[codec(crate = sails_rs::scale_codec)]
struct LegacyUserBetRecord {
    pub match_id:            u64,
    pub score:               bolao_client::Score,
    pub penalty_winner:      Option<bolao_client::PenaltyWinner>,
    pub stake_in_match_pool: u128,
}

/// Legacy MigrationUserPayload — references LegacyUserBetRecord.
#[derive(sails_rs::scale_codec::Decode)]
#[codec(crate = sails_rs::scale_codec)]
struct LegacyMigrationUserPayload {
    pub user:                  ActorId,
    pub user_bets:             Vec<LegacyUserBetRecord>,
    pub user_points:           u32,
    pub pending_refund:        u128,
    pub podium_pick:           Option<bolao_client::PodiumPick>,
    pub final_prize_allocation: u128,
    pub final_prize_claimed:   bool,
}

/// Legacy MigrationPage — references LegacyBet and LegacyMigrationUserPayload.
#[derive(sails_rs::scale_codec::Decode)]
#[codec(crate = sails_rs::scale_codec)]
struct LegacyMigrationPage {
    pub page:           u32,
    pub total_pages:    u32,
    pub is_last_page:   bool,
    pub matches:        Vec<bolao_client::Match>,
    pub phases:         Vec<bolao_client::PhaseConfig>,
    pub bets:           Vec<LegacyBet>,
    pub user_payloads:  Vec<LegacyMigrationUserPayload>,
}

/// Raw-call export_metadata on a legacy (pre-freebet) SOURCE contract and decode into
/// the new bolao_client::MigrationMetadata, injecting freebet_ledger_program_id = None.
///
/// Required because the generated bolao_client targets the NEW struct layout.
/// Calling export_metadata() directly via the Sails actor on the legacy SOURCE would
/// produce a SCALE decode error due to the missing field.
async fn export_metadata_legacy(
    api: &GearApi,
    source_id: ActorId,
) -> anyhow::Result<bolao_client::MigrationMetadata> {
    use sails_rs::scale_codec::{Decode, Encode};

    let mut id_bytes = [0u8; 32];
    id_bytes.copy_from_slice(source_id.as_ref());

    // Sails encodes calls as SCALE of (service_route: &str, method_name: &str, args...)
    let payload: Vec<u8> = ("Service", "ExportMetadata").encode();

    let gas = api
        .calculate_handle_gas(None, id_bytes.into(), payload.clone(), 0, true)
        .await
        .context("calculate_handle_gas for SOURCE export_metadata")?;

    // Subscribe before sending to ensure we don't miss the reply event.
    let mut listener = api.subscribe().await.context("subscribe to events")?;

    let (msg_id, _) = api
        .send_message_bytes(id_bytes.into(), payload, gas.min_limit, 0)
        .await
        .context("send_message_bytes export_metadata → SOURCE")?;

    // Wait for the reply to this specific message.
    // reply_bytes_on returns (reply_msg_id, Result<bytes, error_code>, block_hash).
    let (_, raw, _) = listener
        .reply_bytes_on(msg_id)
        .await
        .context("waiting for export_metadata reply from SOURCE")?;

    let raw = raw.map_err(|code| anyhow::anyhow!("SOURCE replied with error code: {:?}", code))?;

    // Sails wraps responses as: SCALE encode of (route: String, method: String, <return_value>)
    let mut cursor = raw.as_slice();
    let _: String = Decode::decode(&mut cursor).context("decode Sails route prefix")?;
    let _: String = Decode::decode(&mut cursor).context("decode Sails method prefix")?;

    let legacy = LegacyMigrationMetadata::decode(&mut cursor)
        .context("SCALE decode LegacyMigrationMetadata — ensure SOURCE is the pre-freebet format")?;

    // Convert to new MigrationMetadata; freebet_ledger_program_id was not present in SOURCE.
    Ok(bolao_client::MigrationMetadata {
        admins:                      legacy.admins,
        operators:                   legacy.operators,
        treasury:                    legacy.treasury,
        authorized_oracles:          legacy.authorized_oracles,
        next_match_id:               legacy.next_match_id,
        protocol_fee_accumulated:    legacy.protocol_fee_accumulated,
        final_prize_accumulated:     legacy.final_prize_accumulated,
        r32_lock_time:               legacy.r32_lock_time,
        podium_result:               legacy.podium_result,
        podium_finalized:            legacy.podium_finalized,
        final_prize_finalized:       legacy.final_prize_finalized,
        final_prize_claimable_total: legacy.final_prize_claimable_total,
        final_prize_rounding_dust:   legacy.final_prize_rounding_dust,
        vara_price_usd_micro:        legacy.vara_price_usd_micro,
        price_cached_at:             legacy.price_cached_at,
        price_staleness_limit_ms:    legacy.price_staleness_limit_ms,
        price_oracle_program_id:     legacy.price_oracle_program_id,
        freebet_ledger_program_id:   None,
        pending_refunds_scalar:      legacy.pending_refunds_scalar,
    })
}

/// Raw-call export_state_page on a legacy (pre-freebet) SOURCE contract.
/// Decodes with legacy structs (no freebet_principal) and converts to the new
/// bolao_client::MigrationPage, setting freebet_principal = 0 on every bet.
async fn export_state_page_legacy(
    api: &GearApi,
    source_id: ActorId,
    page: u32,
    page_size: u32,
) -> anyhow::Result<bolao_client::MigrationPage> {
    use sails_rs::scale_codec::{Decode, Encode};

    let mut id_bytes = [0u8; 32];
    id_bytes.copy_from_slice(source_id.as_ref());

    let payload: Vec<u8> = ("Service", "ExportStatePage", page, page_size).encode();

    let gas = api
        .calculate_handle_gas(None, id_bytes.into(), payload.clone(), 0, true)
        .await
        .context("calculate_handle_gas for SOURCE export_state_page")?;

    let mut listener = api.subscribe().await.context("subscribe to events")?;

    let (msg_id, _) = api
        .send_message_bytes(id_bytes.into(), payload, gas.min_limit, 0)
        .await
        .context("send_message_bytes export_state_page → SOURCE")?;

    let (_, raw, _) = listener
        .reply_bytes_on(msg_id)
        .await
        .context("waiting for export_state_page reply from SOURCE")?;

    let raw = raw.map_err(|code| anyhow::anyhow!("SOURCE replied with error code: {:?}", code))?;

    let mut cursor = raw.as_slice();
    let _: String = Decode::decode(&mut cursor).context("decode Sails route prefix")?;
    let _: String = Decode::decode(&mut cursor).context("decode Sails method prefix")?;

    let legacy = LegacyMigrationPage::decode(&mut cursor)
        .context("SCALE decode LegacyMigrationPage — ensure SOURCE is the pre-freebet format")?;

    let bets = legacy.bets.into_iter().map(|b| bolao_client::Bet {
        user:                b.user,
        match_id:            b.match_id,
        score:               b.score,
        penalty_winner:      b.penalty_winner,
        stake_in_match_pool: b.stake_in_match_pool,
        freebet_principal:   0,
        claimed:             b.claimed,
    }).collect();

    let user_payloads = legacy.user_payloads.into_iter().map(|u| bolao_client::MigrationUserPayload {
        user:                  u.user,
        user_bets:             u.user_bets.into_iter().map(|r| bolao_client::UserBetRecord {
            match_id:            r.match_id,
            score:               r.score,
            penalty_winner:      r.penalty_winner,
            stake_in_match_pool: r.stake_in_match_pool,
            freebet_principal:   0,
        }).collect(),
        user_points:           u.user_points,
        pending_refund:        u.pending_refund,
        podium_pick:           u.podium_pick,
        final_prize_allocation: u.final_prize_allocation,
        final_prize_claimed:   u.final_prize_claimed,
    }).collect();

    Ok(bolao_client::MigrationPage {
        page:          legacy.page,
        total_pages:   legacy.total_pages,
        is_last_page:  legacy.is_last_page,
        matches:       legacy.matches,
        phases:        legacy.phases,
        bets,
        user_payloads,
    })
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let mnemonic    = std::env::var("MNEMONIC").context("MNEMONIC required")?;
    let source_id   = parse_actor(std::env::var("SOURCE_BOLAO_ID").context("SOURCE_BOLAO_ID required")?)?;
    let sink_id     = parse_actor(std::env::var("SINK_BOLAO_ID").context("SINK_BOLAO_ID required")?)?;
    let sink_oracle = parse_actor(std::env::var("SINK_ORACLE_ID").context("SINK_ORACLE_ID required")?)?;
    let sink_freebet = std::env::var("SINK_FREEBET_LEDGER_ID").ok()
        .map(parse_actor)
        .transpose()
        .context("SINK_FREEBET_LEDGER_ID invalid hex")?;

    let network = std::env::var("VARA_NETWORK").unwrap_or_else(|_| "testnet".into());
    let api = match network.to_lowercase().as_str() {
        "mainnet" => GearApi::vara().await.context("mainnet connect failed")?,
        _         => GearApi::vara_testnet().await.context("testnet connect failed")?,
    };
    let api = api.with(&mnemonic).context("Invalid mnemonic")?;
    let env = GclientEnv::new(api.clone());

    // Helper closures to build actor references
    let source = || Actor::<BolaoProgram, _>::new(env.clone(), source_id);
    let sink   = || Actor::<BolaoProgram, _>::new(env.clone(), sink_id);
    let oracle = || Actor::<OracleProgram, _>::new(env.clone(), sink_oracle);

    // ── Pre-flight ────────────────────────────────────────────────────────────
    println!("=== PRE-FLIGHT ===");
    let locked_before = {
        let actor = source();
        let svc   = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::query_locked_vara(&svc).await.context("query_locked_vara SOURCE")?
    };
    println!("  SOURCE locked VARA : {} planck  ({:.6} VARA)",
        locked_before, locked_before as f64 / 1e12);

    if let Some(fb) = sink_freebet {
        println!("  FreebetLedger to wire: 0x{}", hex::encode(fb.as_ref()));
    } else {
        println!("  FreebetLedger: not configured (SINK_FREEBET_LEDGER_ID not set)");
    }

    // ── Phase 1: Lock SOURCE ──────────────────────────────────────────────────
    println!("\n=== PHASE 1: Lock SOURCE ===");
    {
        let actor = source();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::lock_for_migration(&mut svc).await.context("lock_for_migration")?;
    }
    println!("  SOURCE locked ✓");

    // ── Phase 2: Export metadata (legacy decode) ──────────────────────────────
    // SOURCE is pre-freebet format — MigrationMetadata lacks freebet_ledger_program_id.
    // We use a raw gclient call + legacy struct to avoid SCALE decode mismatch.
    println!("\n=== PHASE 2: Export metadata (legacy SOURCE format) ===");
    let metadata = export_metadata_legacy(&api, source_id)
        .await
        .context("export_metadata from legacy SOURCE")?;
    println!("  admins          : {}", metadata.admins.len());
    println!("  operators       : {}", metadata.operators.len());
    println!("  next_match_id   : {}", metadata.next_match_id);
    println!("  protocol_fee    : {} planck", metadata.protocol_fee_accumulated);
    println!("  final_prize     : {} planck", metadata.final_prize_accumulated);
    println!("  pending_refunds : {} planck (informational)", metadata.pending_refunds_scalar);

    // ── Phase 3: Export all state in a single call ───────────────────────────
    // With 80 matches + ~5 bets the whole state fits in page 0 (MAX_MIGRATION_PAGE_SIZE=50
    // applies to bets/user_payloads only; matches always come in full on page 0).
    // Single-call export was tested and verified before this migration.
    println!("\n=== PHASE 3: Export state (single call) ===");
    let state_page = export_state_page_legacy(&api, source_id, 0, 50)
        .await
        .context("export_state_page_legacy(0)")?;
    println!("  {} matches, {} phases, {} bets, {} user_payloads",
        state_page.matches.len(), state_page.phases.len(),
        state_page.bets.len(), state_page.user_payloads.len());

    // ── Phase 4: Import all state into SINK in a single call ─────────────────
    println!("\n=== PHASE 4: Import state into SINK (single call) ===");
    {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::import_state_page(&mut svc, state_page.clone()).await
            .context("import_state_page(0)")?;
    }
    println!("  state imported ✓");

    // ── Phase 5: Import metadata into SINK ───────────────────────────────────
    println!("\n=== PHASE 5: Import metadata into SINK ===");
    {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::import_metadata(&mut svc, metadata.clone()).await.context("import_metadata")?;
    }
    println!("  metadata imported ✓  (freebet_ledger_program_id = None, wired in Phase 6b)");

    // ── Phase 6: Re-wire oracle on SINK ──────────────────────────────────────
    println!("\n=== PHASE 6: Re-wire oracle on SINK ===");
    {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        svc.set_price_oracle(sink_oracle).await.context("set_price_oracle SINK")?;
    }
    {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        svc.set_oracle_authorized(sink_oracle, true).await.context("set_oracle_authorized SINK")?;
    }
    println!("  oracle re-wired: 0x{}", hex::encode(sink_oracle.as_ref()));

    // ── Phase 6b: Wire FreebetLedger on SINK ─────────────────────────────────
    // set_freebet_ledger is safe pre-seal: only checks check_not_locked_for_export + admin.
    if let Some(freebet_id) = sink_freebet {
        println!("\n=== PHASE 6b: Wire FreebetLedger on SINK ===");
        {
            let actor   = sink();
            let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
            svc.set_freebet_ledger(Some(freebet_id))
                .await
                .context("set_freebet_ledger SINK")?;
        }
        println!("  freebet_ledger_program_id set: 0x{}", hex::encode(freebet_id.as_ref()));
    } else {
        println!("\n=== PHASE 6b: Skipped (SINK_FREEBET_LEDGER_ID not set) ===");
    }

    // ── Phase 7: Seal SINK ────────────────────────────────────────────────────
    println!("\n=== PHASE 7: Seal SINK ===");
    {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::seal_migration(&mut svc).await.context("seal_migration")?;
    }
    println!("  SINK sealed ✓ — normal operations now enabled");

    // ── Phase 8: Drain VARA SOURCE → SINK (with bounce detection) ───────────────
    // SOURCE's drain_vara_to uses msg::send_with_gas(dest, (), 0, amount).
    // With a program as dest, gas=0 + empty payload causes SINK to panic and
    // the value bounces back to SOURCE asynchronously. We detect this and fall
    // back to draining to the admin wallet so the VARA is never stranded.
    println!("\n=== PHASE 8: Drain VARA SOURCE → SINK ===");
    {
        let actor   = source();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::drain_vara_to(&mut svc, sink_id).await.context("drain_vara_to")?;
    }
    println!("  drain sent ✓ — waiting 4 blocks for settlement (~24s)...");
    tokio::time::sleep(std::time::Duration::from_secs(24)).await;

    // ── Phase 8b: Verify drain — fallback to admin wallet if bounced ─────────
    println!("\n=== PHASE 8b: Verify drain ===");
    let source_balance_after = api.free_balance(source_id).await
        .context("query SOURCE on-chain balance post-drain")?;

    if source_balance_after > 0 {
        println!("  ⚠  Drain to SINK bounced — SOURCE still holds {} planck ({:.6} VARA)",
            source_balance_after, source_balance_after as f64 / 1e12);
        println!("  Fallback: draining to admin wallet...");

        let deployer_bytes: [u8; 32] = *api.account_id().as_ref();
        let admin_actor: ActorId = deployer_bytes.into();

        {
            let actor   = source();
            let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
            BolaoService::drain_vara_to(&mut svc, admin_actor).await
                .context("drain_vara_to fallback → admin wallet")?;
        }
        println!("  ✓ VARA drained to admin wallet: 0x{}", hex::encode(deployer_bytes));
        println!();
        println!("  ╔══════════════════════════════════════════════════════════════╗");
        println!("  ║  ACTION REQUIRED — Manual transfer needed                   ║");
        println!("  ╠══════════════════════════════════════════════════════════════╣");
        println!("  ║  {} planck are now in the admin wallet.       ║", source_balance_after);
        println!("  ║  Transfer them to the SINK so users can claim their prizes.  ║");
        println!("  ║                                                              ║");
        println!("  ║  From : admin wallet (MNEMONIC)                             ║");
        println!("  ║  To   : SINK = 0x{}  ║", hex::encode(sink_id.as_ref()));
        println!("  ║  Amount: {} planck                             ║", source_balance_after);
        println!("  ║                                                              ║");
        println!("  ║  Use polkadot.js → Developer → Extrinsics →                ║");
        println!("  ║       balances.transferKeepAlive                            ║");
        println!("  ╚══════════════════════════════════════════════════════════════╝");
    } else {
        println!("  ✓ SINK received the VARA — drain successful");
    }

    // ── Phase 9: Update Oracle back-link to new SINK ──────────────────────────
    // The existing Oracle still has the old BolaoCore as back-link. Update it now
    // that SINK is sealed and operational. This is informational/off-chain only —
    // the Oracle never uses bolao_program_id for on-chain authorization.
    println!("\n=== PHASE 9: Update Oracle back-link to SINK ===");
    {
        let actor   = oracle();
        let mut svc = actor.service::<oracle_client::service::ServiceImpl>("Service");
        OracleService::set_bolao_program(&mut svc, sink_id)
            .await
            .context("set_bolao_program on Oracle — ensure MNEMONIC is Oracle admin")?;
    }
    println!("  Oracle back-link updated to SINK: 0x{}", hex::encode(sink_id.as_ref()));

    // ── Validation ────────────────────────────────────────────────────────────
    println!("\n=== VALIDATION ===");
    let locked_sink = {
        let actor = sink();
        let svc   = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::query_locked_vara(&svc).await.context("query_locked_vara SINK")?
    };
    let locked_source_after = {
        let actor = source();
        let svc   = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::query_locked_vara(&svc).await.context("query_locked_vara SOURCE after")?
    };

    println!("  Exported — matches: {}, phases: {}, bets: {}, users: {}",
        state_page.matches.len(), state_page.phases.len(),
        state_page.bets.len(), state_page.user_payloads.len());
    println!("  SOURCE locked before drain : {locked_before} planck");
    println!("  SOURCE locked after  drain : {locked_source_after} planck  (expected 0)");
    println!("  SINK   locked after  drain : {locked_sink} planck  ({:.6} VARA)", locked_sink as f64 / 1e12);

    let drain_ok = locked_sink >= locked_before;
    println!("\n  VARA drain   : {}", if drain_ok { "✓ SINK received all VARA" } else { "✗ MISMATCH" });
    println!("  Migration    : {}", if drain_ok { "SUCCESS ✓" } else { "FAILED ✗" });

    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║  MIGRATION COMPLETE                                          ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("  SOURCE : 0x{}", hex::encode(source_id.as_ref()));
    println!("  SINK   : 0x{}", hex::encode(sink_id.as_ref()));
    println!("  ORACLE : 0x{}", hex::encode(sink_oracle.as_ref()));
    if let Some(fb) = sink_freebet {
        println!("  FREEBET: 0x{}", hex::encode(fb.as_ref()));
    }
    println!("  VARA   : {locked_sink} planck  ({:.6} VARA)", locked_sink as f64 / 1e12);
    println!("╟──────────────────────────────────────────────────────────────╢");
    println!("║  Next steps:                                                 ║");
    println!("║  • Update oracle-server .env with new BOLAO_PROGRAM_ID       ║");
    println!("║  • Restart oracle-server on Render                           ║");
    println!("╚══════════════════════════════════════════════════════════════╝");

    Ok(())
}

fn parse_actor(s: String) -> anyhow::Result<ActorId> {
    let s = s.trim().trim_start_matches("0x");
    let bytes = hex::decode(s).context("Invalid hex")?;
    if bytes.len() != 32 { anyhow::bail!("Expected 32 bytes, got {}", bytes.len()); }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr.into())
}
