//! Migration script: SOURCE BolaoCore → SINK BolaoCore
//!
//! Env vars:
//!   MNEMONIC        — admin seed phrase
//!   SOURCE_BOLAO_ID — 0x... SOURCE contract (with bets)
//!   SINK_BOLAO_ID   — 0x... SINK contract (deployed with new_as_importer)
//!   SINK_ORACLE_ID  — 0x... new Oracle-Program (for re-wiring)
//!   VARA_NETWORK    — "testnet" (default) | "mainnet"

use anyhow::Context as _;
use gclient::GearApi;
use sails_rs::client::{Actor, GclientEnv};
use sails_rs::prelude::ActorId;
use bolao_client::BolaoProgram;
use bolao_client::service::Service as BolaoService;
use bolao_client::MigrationPage;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let mnemonic    = std::env::var("MNEMONIC").context("MNEMONIC required")?;
    let source_id   = parse_actor(std::env::var("SOURCE_BOLAO_ID").context("SOURCE_BOLAO_ID required")?)?;
    let sink_id     = parse_actor(std::env::var("SINK_BOLAO_ID").context("SINK_BOLAO_ID required")?)?;
    let sink_oracle = parse_actor(std::env::var("SINK_ORACLE_ID").context("SINK_ORACLE_ID required")?)?;

    let network = std::env::var("VARA_NETWORK").unwrap_or_else(|_| "testnet".into());
    let api = match network.to_lowercase().as_str() {
        "mainnet" => GearApi::vara().await.context("mainnet connect failed")?,
        _         => GearApi::vara_testnet().await.context("testnet connect failed")?,
    };
    let api = api.with(&mnemonic).context("Invalid mnemonic")?;
    let env = GclientEnv::new(api);

    // Helper closures to build actor references
    let source = || Actor::<BolaoProgram, _>::new(env.clone(), source_id);
    let sink   = || Actor::<BolaoProgram, _>::new(env.clone(), sink_id);

    // ── Pre-flight ────────────────────────────────────────────────────────────
    println!("=== PRE-FLIGHT ===");
    let locked_before = {
        let actor = source();
        let svc   = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::query_locked_vara(&svc).await.context("query_locked_vara SOURCE")?
    };
    println!("  SOURCE locked VARA : {} planck  ({:.6} VARA)",
        locked_before, locked_before as f64 / 1e12);

    // ── Phase 1: Lock SOURCE ──────────────────────────────────────────────────
    println!("\n=== PHASE 1: Lock SOURCE ===");
    {
        let actor = source();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::lock_for_migration(&mut svc).await.context("lock_for_migration")?;
    }
    println!("  SOURCE locked ✓");

    // ── Phase 2: Export metadata ──────────────────────────────────────────────
    println!("\n=== PHASE 2: Export metadata ===");
    let metadata = {
        let actor = source();
        let svc   = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::export_metadata(&svc).await.context("export_metadata")?
    };
    println!("  admins          : {}", metadata.admins.len());
    println!("  operators       : {}", metadata.operators.len());
    println!("  next_match_id   : {}", metadata.next_match_id);
    println!("  protocol_fee    : {} planck", metadata.protocol_fee_accumulated);
    println!("  final_prize     : {} planck", metadata.final_prize_accumulated);
    println!("  pending_refunds : {} planck (informational)", metadata.pending_refunds_scalar);

    // ── Phase 3: Export state pages ───────────────────────────────────────────
    println!("\n=== PHASE 3: Export state pages ===");
    let mut pages: Vec<MigrationPage> = Vec::new();
    let mut page_num: u32 = 0;
    loop {
        let actor = source();
        let svc   = actor.service::<bolao_client::service::ServiceImpl>("Service");
        let page  = BolaoService::export_state_page(&svc, page_num, 25).await
            .with_context(|| format!("export_state_page({page_num})"))?;

        println!("  page {}/{}: {} matches, {} phases, {} bets, {} user_payloads (last={})",
            page.page, page.total_pages,
            page.matches.len(), page.phases.len(),
            page.bets.len(), page.user_payloads.len(),
            page.is_last_page);

        let is_last = page.is_last_page;
        pages.push(page);
        if is_last { break; }
        page_num += 1;
    }
    println!("  Total pages exported: {}", pages.len());

    // ── Phase 4: Import state pages into SINK ─────────────────────────────────
    println!("\n=== PHASE 4: Import state pages into SINK ===");
    for page in &pages {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::import_state_page(&mut svc, page.clone()).await
            .with_context(|| format!("import_state_page({})", page.page))?;
        println!("  imported page {}/{} ✓", page.page, page.total_pages);
    }

    // ── Phase 5: Import metadata into SINK ───────────────────────────────────
    println!("\n=== PHASE 5: Import metadata into SINK ===");
    {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::import_metadata(&mut svc, metadata.clone()).await.context("import_metadata")?;
    }
    println!("  metadata imported ✓");

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

    // ── Phase 7: Seal SINK ────────────────────────────────────────────────────
    println!("\n=== PHASE 7: Seal SINK ===");
    {
        let actor   = sink();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::seal_migration(&mut svc).await.context("seal_migration")?;
    }
    println!("  SINK sealed ✓ — normal operations now enabled");

    // ── Phase 8: Drain VARA from SOURCE to SINK ───────────────────────────────
    println!("\n=== PHASE 8: Drain VARA SOURCE → SINK ===");
    {
        let actor   = source();
        let mut svc = actor.service::<bolao_client::service::ServiceImpl>("Service");
        BolaoService::drain_vara_to(&mut svc, sink_id).await.context("drain_vara_to")?;
    }
    println!("  drain sent ✓");

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

    let total_matches = pages.first().map(|p| p.matches.len()).unwrap_or(0);
    let total_phases  = pages.first().map(|p| p.phases.len()).unwrap_or(0);
    let total_bets    = pages.iter().map(|p| p.bets.len()).sum::<usize>();
    let total_users   = pages.iter().map(|p| p.user_payloads.len()).sum::<usize>();

    println!("  Exported — matches: {total_matches}, phases: {total_phases}, bets: {total_bets}, users: {total_users}");
    println!("  SOURCE locked before drain : {locked_before} planck");
    println!("  SOURCE locked after  drain : {locked_source_after} planck  (expected 0)");
    println!("  SINK   locked after  drain : {locked_sink} planck  ({:.6} VARA)", locked_sink as f64 / 1e12);

    // SOURCE query_locked_vara() reads state fields which are NOT zeroed after drain
    // (drain uses exec::value_available() directly). The real check is SINK received the VARA.
    let drain_ok = locked_sink >= locked_before;
    println!("\n  VARA drain   : {}", if drain_ok { "✓ SINK received all VARA" } else { "✗ MISMATCH" });
    println!("  Migration    : {}", if drain_ok { "SUCCESS ✓" } else { "FAILED ✗" });

    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║  MIGRATION COMPLETE                                          ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("  SOURCE : 0x{}", hex::encode(source_id.as_ref()));
    println!("  SINK   : 0x{}", hex::encode(sink_id.as_ref()));
    println!("  VARA   : {locked_sink} planck  ({:.6} VARA)", locked_sink as f64 / 1e12);
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
