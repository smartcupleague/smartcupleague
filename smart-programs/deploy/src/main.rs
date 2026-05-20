use anyhow::{bail, Context as _};
use gclient::GearApi;
use sails_rs::CodeId;
use oracle_client::{OracleCtors, OracleProgram};
use oracle_client::service::Service as OracleService;
use bolao_client::{BolaoCtors, BolaoProgram};
use bolao_client::service::Service as BolaoService;
use sails_rs::{client::{GclientEnv, GearEnv}, prelude::ActorId};

/// Upload code, tolerating CodeAlreadyExists (deterministic code_id = blake2_256 of bytes).
async fn upload_or_reuse(api: &GearApi, wasm: &[u8], label: &str) -> anyhow::Result<CodeId> {
    match api.upload_code(wasm).await {
        Ok((code_id, _)) => {
            println!("      uploaded  code_id: {code_id:?}");
            Ok(code_id)
        }
        Err(e) if e.to_string().contains("CodeAlreadyExists") => {
            let hash = gclient::ext::sp_core::hashing::blake2_256(wasm);
            let code_id: CodeId = hash.into();
            println!("      already on-chain — code_id: {code_id:?}");
            Ok(code_id)
        }
        Err(e) => Err(e).with_context(|| format!("Failed to upload {label} code")),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    // ── Config ────────────────────────────────────────────────────────────────
    let mnemonic = std::env::var("MNEMONIC")
        .context("MNEMONIC is required (seed phrase for the deployer account)")?;
    let deploy_version = std::env::var("DEPLOY_VERSION").unwrap_or_else(|_| "v1".into());

    let oracle_wasm_path = std::env::var("ORACLE_WASM").unwrap_or_else(|_| {
        "../Oracle-Program/target/wasm32-gear/release/oracle_program.opt.wasm".into()
    });
    let bolao_wasm_path = std::env::var("BOLAO_WASM").unwrap_or_else(|_| {
        "../BolaoCore-Program/target/wasm32-gear/release/bolao_program.opt.wasm".into()
    });

    let oracle_wasm = std::fs::read(&oracle_wasm_path)
        .with_context(|| format!("Cannot read Oracle WASM from '{oracle_wasm_path}'"))?;
    let bolao_wasm = std::fs::read(&bolao_wasm_path)
        .with_context(|| format!("Cannot read Bolao WASM from '{bolao_wasm_path}'"))?;

    // ── Connect ───────────────────────────────────────────────────────────────
    let network = std::env::var("VARA_NETWORK").unwrap_or_else(|_| "testnet".into());
    let api = match network.to_lowercase().as_str() {
        "mainnet" => {
            println!("Connecting to Vara mainnet...");
            GearApi::vara()
                .await
                .context("Failed to connect to wss://rpc.vara.network")?
        }
        _ => {
            println!("Connecting to Vara testnet...");
            GearApi::vara_testnet()
                .await
                .context("Failed to connect to wss://testnet.vara.network")?
        }
    };
    let api = api.with(&mnemonic).context("Invalid mnemonic / SURI")?;

    let deployer_bytes: &[u8; 32] = api.account_id().as_ref();
    let deployer: ActorId = (*deployer_bytes).into();
    println!("Deployer : 0x{}", hex::encode(deployer.as_ref()));

    let admin    = env_actor("ADMIN").unwrap_or(deployer);
    let treasury = env_actor("TREASURY")
        .context("TREASURY is required — protocol fee wallet (64 hex chars)")?;
    // The gateway is the oracle-server's hot wallet. It becomes an operator in
    // both programs so it can register matches, refresh prices, force-finalize.
    let gateway  = env_actor("GATEWAY_PUBKEY");

    println!("Admin    : 0x{}", hex::encode(admin.as_ref()));
    println!("Treasury : 0x{}", hex::encode(treasury.as_ref()));
    if let Some(gw) = gateway {
        println!("Gateway  : 0x{}", hex::encode(gw.as_ref()));
    }

    let env = GclientEnv::new(api.clone());

    // ═══════════════════════════════════════════════════════════════════════════
    //  ORACLE-PROGRAM
    // ═══════════════════════════════════════════════════════════════════════════

    // [1] Upload code
    println!("\n[1/8] Uploading Oracle-Program code ({} bytes)...", oracle_wasm.len());
    let oracle_code_id = upload_or_reuse(&api, &oracle_wasm, "Oracle-Program").await?;

    // Wait one block so the code-upload tx is included before deploying
    tokio::time::sleep(std::time::Duration::from_secs(6)).await;

    // [2] Deploy (init)
    println!("[2/8] Deploying Oracle-Program...");
    let oracle = env
        .deploy::<OracleProgram>(oracle_code_id, format!("scl-oracle-{deploy_version}").into_bytes())
        .new(admin)
        .await
        .context("Failed to deploy Oracle-Program")?;
    let oracle_id = oracle.id();
    println!("      program_id: 0x{}", hex::encode(oracle_id.as_ref()));

    // Wait one block so the deploy tx is settled before setup calls
    tokio::time::sleep(std::time::Duration::from_secs(6)).await;

    // [3] Post-deploy: authorize feeder + gateway operator
    // Explicit FEEDER_PUBKEY takes priority; gateway is always authorized as feeder too.
    let explicit_feeder = env_actor("FEEDER_PUBKEY");
    if let Some(feeder) = explicit_feeder {
        println!("[3/8] Authorizing feeder 0x{}...", hex::encode(feeder.as_ref()));
        let mut svc = oracle.service("Service");
        svc.set_feeder_authorized(feeder, true)
            .await
            .context("Failed to authorize feeder in Oracle-Program")?;
    }

    if let Some(gw) = gateway {
        println!("[3b]  Adding Oracle operator 0x{}...", hex::encode(gw.as_ref()));
        {
            let mut svc = oracle.service("Service");
            OracleService::add_operator(&mut svc, gw)
                .await
                .context("Failed to add operator in Oracle-Program")?;
        }
        println!("[3c]  Authorizing gateway as feeder 0x{}...", hex::encode(gw.as_ref()));
        {
            let mut svc = oracle.service("Service");
            svc.set_feeder_authorized(gw, true)
                .await
                .context("Failed to authorize gateway as feeder in Oracle-Program")?;
        }
    } else {
        println!("[3/8] Skipped feeder auth — GATEWAY_PUBKEY not set (authorize feeders later)");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  BOLAOCORE-PROGRAM
    // ═══════════════════════════════════════════════════════════════════════════

    // Wait one block before switching to BolaoCore operations
    tokio::time::sleep(std::time::Duration::from_secs(6)).await;

    // [4] Upload code
    println!("[4/8] Uploading BolaoCore-Program code ({} bytes)...", bolao_wasm.len());
    let bolao_code_id = upload_or_reuse(&api, &bolao_wasm, "BolaoCore-Program").await?;

    // Wait one block so the code-upload tx is included before deploying
    tokio::time::sleep(std::time::Duration::from_secs(6)).await;

    // [5] Deploy (init)
    let import_mode = std::env::var("IMPORT_MODE").map(|v| v == "true").unwrap_or(false);
    println!("[5/8] Deploying BolaoCore-Program{}...", if import_mode { " (importer mode)" } else { "" });
    let bolao = if import_mode {
        env.deploy::<BolaoProgram>(bolao_code_id, format!("scl-bolao-{deploy_version}").into_bytes())
            .new_as_importer(admin, treasury)
            .await
            .context("Failed to deploy BolaoCore-Program as importer")?
    } else {
        env.deploy::<BolaoProgram>(bolao_code_id, format!("scl-bolao-{deploy_version}").into_bytes())
            .new(admin, treasury)
            .await
            .context("Failed to deploy BolaoCore-Program")?
    };
    let bolao_id = bolao.id();
    println!("      program_id: 0x{}", hex::encode(bolao_id.as_ref()));

    // [6] Wire price oracle (needed for dynamic min-bet)
    println!("[6/8] set_price_oracle on BolaoCore...");
    {
        let mut svc = bolao.service("Service");
        svc.set_price_oracle(oracle_id)
            .await
            .context("Failed to call set_price_oracle on BolaoCore-Program")?;
    }
    println!("      price oracle = 0x{}", hex::encode(oracle_id.as_ref()));

    // [7] Authorize Oracle-Program to be used in propose_from_oracle
    //     CRITICAL: without this, every propose_from_oracle call panics.
    println!("[7/8] set_oracle_authorized on BolaoCore (CRITICAL for propose_from_oracle)...");
    {
        let mut svc = bolao.service("Service");
        svc.set_oracle_authorized(oracle_id, true)
            .await
            .context("Failed to call set_oracle_authorized on BolaoCore-Program")?;
    }
    println!("      oracle authorized ✓");

    // [8] Gateway operator + back-link Oracle → Bolao
    if let Some(gw) = gateway {
        println!("[8/8] Adding BolaoCore operator 0x{}...", hex::encode(gw.as_ref()));
        let mut svc = bolao.service("Service");
        BolaoService::add_operator(&mut svc, gw)
            .await
            .context("Failed to add operator in BolaoCore-Program")?;
    } else {
        println!("[8/8] Skipped — GATEWAY_PUBKEY not set (add operators later)");
    }

    // Informational: register Bolao address in Oracle (off-chain tooling uses this)
    {
        let mut svc = oracle.service("Service");
        svc.set_bolao_program(bolao_id)
            .await
            .context("Failed to call set_bolao_program on Oracle-Program")?;
        println!("      Oracle → Bolao back-link set ✓");
    }

    // ── Done ──────────────────────────────────────────────────────────────────
    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║  DEPLOY COMPLETE                                             ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("║  Update oracle-server/.env and api/.env with:               ║");
    println!("╟──────────────────────────────────────────────────────────────╢");
    println!("  ORACLE_PROGRAM_ID=0x{}", hex::encode(oracle_id.as_ref()));
    println!("  BOLAO_PROGRAM_ID=0x{}", hex::encode(bolao_id.as_ref()));
    println!("╟──────────────────────────────────────────────────────────────╢");
    println!("║  Remaining manual steps:                                     ║");
    println!("║  • Authorize feeders if FEEDER_PUBKEY was not set            ║");
    println!("║  • Add operators if GATEWAY_PUBKEY was not set               ║");
    println!("║  • Update Render env vars and redeploy oracle-server         ║");
    println!("╚══════════════════════════════════════════════════════════════╝");

    Ok(())
}

fn env_actor(key: &str) -> Option<ActorId> {
    let val = std::env::var(key).ok()?;
    parse_actor_hex(&val).ok()
}

fn parse_actor_hex(s: &str) -> anyhow::Result<ActorId> {
    let s = s.trim().trim_start_matches("0x");
    let bytes = hex::decode(s).with_context(|| format!("Invalid hex: '{s}'"))?;
    if bytes.len() != 32 {
        bail!("Expected 32 bytes (64 hex chars), got {}", bytes.len());
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr.into())
}
