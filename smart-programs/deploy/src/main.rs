use anyhow::{bail, Context as _};
use bolao_client::service::Service as BolaoService;
use bolao_client::{BolaoCtors, BolaoProgram};
use dao_client::service::Service as DaoService;
use dao_client::{DaoCtors, DaoProgram};
use gclient::GearApi;
use oracle_client::service::Service as OracleService;
use oracle_client::{OracleCtors, OracleProgram};
use sails_rs::{
    client::{GclientEnv, GearEnv},
    prelude::ActorId,
    CodeId,
};
use smartcup_freebet_ledger_client::freebet_ledger::FreebetLedger as FreebetLedgerService;
use smartcup_freebet_ledger_client::{
    FreebetLedger as FreebetLedgerActor, FreebetLedgerCtors, FreebetLedgerInit,
    FreebetLedgerProgram,
};

/// Upload code, tolerating CodeAlreadyExists (deterministic code_id = blake2_256 of bytes).
async fn upload_or_reuse(api: &GearApi, wasm: &[u8], label: &str) -> anyhow::Result<CodeId> {
    match api.upload_code(wasm).await {
        Ok((code_id, _)) => {
            println!("      uploaded  code_id: 0x{}", hex::encode(code_id.as_ref()));
            Ok(code_id)
        }
        Err(e) if e.to_string().contains("CodeAlreadyExists") => {
            let hash = gclient::ext::sp_core::hashing::blake2_256(wasm);
            let code_id: CodeId = hash.into();
            println!(
                "      already on-chain — code_id: 0x{}",
                hex::encode(code_id.as_ref())
            );
            Ok(code_id)
        }
        Err(e) => Err(e).with_context(|| format!("Failed to upload {label} code")),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let mnemonic = std::env::var("MNEMONIC")
        .context("MNEMONIC is required (seed phrase / SURI for the deployer account)")?;
    let deploy_version = std::env::var("DEPLOY_VERSION").unwrap_or_else(|_| "v1".into());

    let oracle_wasm_path = env_path(
        "ORACLE_WASM",
        "../Oracle-Program/target/wasm32-gear/release/oracle_program.opt.wasm",
    );
    let bolao_wasm_path = env_path(
        "BOLAO_WASM",
        "../BolaoCore-Program/target/wasm32-gear/release/bolao_program.opt.wasm",
    );
    let freebet_wasm_path = env_path(
        "FREEBET_LEDGER_WASM",
        "../FreebetLedger-Program/target/wasm32-gear/release/smartcup_freebet_ledger.opt.wasm",
    );
    let dao_wasm_path = env_path(
        "DAO_WASM",
        "../DAO-SmartCupLeague-Program/target/wasm32-gear/release/dao_program.opt.wasm",
    );

    let oracle_wasm = read_wasm(&oracle_wasm_path, "Oracle")?;
    let bolao_wasm = read_wasm(&bolao_wasm_path, "BolaoCore")?;
    let freebet_wasm = read_wasm(&freebet_wasm_path, "FreebetLedger")?;
    let dao_wasm = read_wasm(&dao_wasm_path, "DAO")?;

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
    let admin = env_actor("ADMIN").unwrap_or(deployer);
    let treasury =
        env_actor("TREASURY").context("TREASURY is required — protocol fee wallet")?;
    let gateway = env_actor("GATEWAY_PUBKEY");
    let explicit_feeder = env_actor("FEEDER_PUBKEY");
    let rewards_admin = env_actor("REWARDS_PUBKEY");
    let extra_admins = env_actors("EXTRA_ADMIN_PUBKEYS")?;
    let add_dao_as_admin = env_bool("ADD_DAO_AS_ADMIN", true);
    let register_bolao_code = env_bool("REGISTER_BOLAO_CODE_IN_DAO", true);

    println!("Deployer : {}", actor_hex(deployer));
    println!("Admin    : {}", actor_hex(admin));
    println!("Treasury : {}", actor_hex(treasury));
    if let Some(gw) = gateway {
        println!("Gateway  : {}", actor_hex(gw));
    }
    if let Some(feeder) = explicit_feeder {
        println!("Feeder   : {}", actor_hex(feeder));
    }
    if let Some(rewards) = rewards_admin {
        println!("Rewards  : {}", actor_hex(rewards));
    }

    let env = GclientEnv::new(api.clone());

    println!(
        "\n[1/16] Uploading Oracle-Program code ({} bytes)...",
        oracle_wasm.len()
    );
    let oracle_code_id = upload_or_reuse(&api, &oracle_wasm, "Oracle-Program").await?;
    wait_block().await;

    println!("[2/16] Deploying Oracle-Program...");
    let oracle = env
        .deploy::<OracleProgram>(oracle_code_id, salt("scl-oracle", &deploy_version))
        .new(admin)
        .await
        .context("Failed to deploy Oracle-Program")?;
    let oracle_id = oracle.id();
    println!("      program_id: {}", actor_hex(oracle_id));
    wait_block().await;

    println!(
        "\n[3/16] Uploading BolaoCore-Program code ({} bytes)...",
        bolao_wasm.len()
    );
    let bolao_code_id = upload_or_reuse(&api, &bolao_wasm, "BolaoCore-Program").await?;
    wait_block().await;

    let import_mode = env_bool("IMPORT_MODE", false);
    println!(
        "[4/16] Deploying BolaoCore-Program{}...",
        if import_mode { " (importer mode)" } else { "" }
    );
    let bolao_deployment =
        env.deploy::<BolaoProgram>(bolao_code_id, salt("scl-bolao", &deploy_version));
    let bolao = if import_mode {
        bolao_deployment
            .new_as_importer(admin, treasury)
            .await
            .context("Failed to deploy BolaoCore-Program as importer")?
    } else {
        bolao_deployment
            .new(admin, treasury)
            .await
            .context("Failed to deploy BolaoCore-Program")?
    };
    let bolao_id = bolao.id();
    println!("      program_id: {}", actor_hex(bolao_id));
    wait_block().await;

    println!(
        "\n[5/16] Uploading FreebetLedger code ({} bytes)...",
        freebet_wasm.len()
    );
    let freebet_code_id = upload_or_reuse(&api, &freebet_wasm, "FreebetLedger").await?;
    wait_block().await;

    println!("[6/16] Deploying FreebetLedger...");
    let freebet = env
        .deploy::<FreebetLedgerProgram>(
            freebet_code_id,
            salt("scl-freebet-ledger", &deploy_version),
        )
        .new(FreebetLedgerInit { admin })
        .await
        .context("Failed to deploy FreebetLedger")?;
    let freebet_id = freebet.id();
    println!("      program_id: {}", actor_hex(freebet_id));
    wait_block().await;

    println!("\n[7/16] Uploading DAO code ({} bytes)...", dao_wasm.len());
    let dao_code_id = upload_or_reuse(&api, &dao_wasm, "DAO").await?;
    wait_block().await;

    println!("[8/16] Deploying DAO...");
    let dao = env
        .deploy::<DaoProgram>(dao_code_id, salt("scl-dao", &deploy_version))
        .new(bolao_id)
        .await
        .context("Failed to deploy DAO")?;
    let dao_id = dao.id();
    println!("      program_id: {}", actor_hex(dao_id));
    wait_block().await;

    println!("\n[9/16] Wiring BolaoCore price oracle...");
    {
        let mut svc = bolao.service("Service");
        svc.set_price_oracle(oracle_id)
            .await
            .context("Failed to call set_price_oracle on BolaoCore")?;
    }
    wait_block().await;

    println!("[10/16] Authorizing Oracle in BolaoCore...");
    {
        let mut svc = bolao.service("Service");
        svc.set_oracle_authorized(oracle_id, true)
            .await
            .context("Failed to call set_oracle_authorized on BolaoCore")?;
    }
    wait_block().await;

    println!("[11/16] Wiring FreebetLedger <-> BolaoCore...");
    {
        let mut svc = bolao.service("Service");
        svc.set_freebet_ledger(Some(freebet_id))
            .await
            .context("Failed to call set_freebet_ledger on BolaoCore")?;
    }
    wait_block().await;
    {
        let mut svc = freebet.freebet_ledger();
        svc.authorize_bet_program(bolao_id)
            .await
            .context("Failed to authorize BolaoCore in FreebetLedger")?;
    }
    wait_block().await;

    println!("[12/16] Setting Oracle back-link to BolaoCore...");
    {
        let mut svc = oracle.service("Service");
        OracleService::set_bolao_program(&mut svc, bolao_id)
            .await
            .context("Failed to call set_bolao_program on Oracle")?;
    }
    wait_block().await;

    println!("[13/16] Configuring gateway / feeder roles...");
    if let Some(feeder) = explicit_feeder {
        let mut svc = oracle.service("Service");
        svc.set_feeder_authorized(feeder, true)
            .await
            .context("Failed to authorize FEEDER_PUBKEY in Oracle")?;
        wait_block().await;
    }
    if let Some(gw) = gateway {
        {
            let mut svc = oracle.service("Service");
            OracleService::add_operator(&mut svc, gw)
                .await
                .context("Failed to add GATEWAY_PUBKEY as Oracle operator")?;
        }
        wait_block().await;
        {
            let mut svc = oracle.service("Service");
            svc.set_feeder_authorized(gw, true)
                .await
                .context("Failed to authorize GATEWAY_PUBKEY as Oracle feeder")?;
        }
        wait_block().await;
        {
            let mut svc = bolao.service("Service");
            BolaoService::add_operator(&mut svc, gw)
                .await
                .context("Failed to add GATEWAY_PUBKEY as BolaoCore operator")?;
        }
        wait_block().await;
    } else {
        println!("      skipped gateway roles — GATEWAY_PUBKEY is not set");
    }

    println!("[14/16] Configuring admin lists...");
    if add_dao_as_admin {
        add_program_admins(&oracle, &bolao, &freebet, dao_id).await?;
    } else {
        println!("      skipped DAO admin grants — ADD_DAO_AS_ADMIN=false");
    }
    if let Some(rewards) = rewards_admin {
        let mut svc = freebet.freebet_ledger();
        svc.add_admin(rewards)
            .await
            .context("Failed to add REWARDS_PUBKEY as FreebetLedger admin")?;
        wait_block().await;
    }
    for extra in extra_admins {
        {
            let mut svc = oracle.service("Service");
            OracleService::add_admin(&mut svc, extra)
                .await
                .context("Failed to add EXTRA_ADMIN_PUBKEYS entry to Oracle")?;
        }
        wait_block().await;
        {
            let mut svc = bolao.service("Service");
            BolaoService::add_admin(&mut svc, extra)
                .await
                .context("Failed to add EXTRA_ADMIN_PUBKEYS entry to BolaoCore")?;
        }
        wait_block().await;
        {
            let mut svc = freebet.freebet_ledger();
            svc.add_admin(extra)
                .await
                .context("Failed to add EXTRA_ADMIN_PUBKEYS entry to FreebetLedger")?;
        }
        wait_block().await;
        {
            let mut svc = dao.service("Service");
            DaoService::add_admin(&mut svc, extra)
                .await
                .context("Failed to add EXTRA_ADMIN_PUBKEYS entry to DAO")?;
        }
        wait_block().await;
    }

    println!("[15/16] Registering BolaoCore code in DAO...");
    if register_bolao_code {
        let mut svc = dao.service("Service");
        svc.register_bolao_code(code_id_bytes(&bolao_code_id))
            .await
            .context("Failed to register BolaoCore code in DAO")?;
        wait_block().await;
    } else {
        println!("      skipped — REGISTER_BOLAO_CODE_IN_DAO=false");
    }

    println!("[16/16] Reading deployment summary...");
    println!("\n╔══════════════════════════════════════════════════════════════╗");
    println!("║  DEPLOY COMPLETE                                             ║");
    println!("╠══════════════════════════════════════════════════════════════╣");
    println!("ORACLE_PROGRAM_ID={}", actor_hex(oracle_id));
    println!("BOLAO_PROGRAM_ID={}", actor_hex(bolao_id));
    println!("FREEBET_LEDGER_ID={}", actor_hex(freebet_id));
    println!("DAO_PROGRAM_ID={}", actor_hex(dao_id));
    println!("BOLAO_CODE_ID=0x{}", hex::encode(bolao_code_id.as_ref()));
    println!("╟──────────────────────────────────────────────────────────────╢");
    println!("║  Check these before opening production traffic:              ║");
    println!("║  • oracle-server uses ORACLE_PROGRAM_ID + BOLAO_PROGRAM_ID   ║");
    println!("║  • rewards-backend uses FREEBET_LEDGER_ID + rewards admin    ║");
    println!("║  • frontend uses all three visible program IDs               ║");
    println!("╚══════════════════════════════════════════════════════════════╝");

    Ok(())
}

async fn add_program_admins(
    oracle: &sails_rs::client::Actor<OracleProgram, GclientEnv>,
    bolao: &sails_rs::client::Actor<BolaoProgram, GclientEnv>,
    freebet: &sails_rs::client::Actor<FreebetLedgerProgram, GclientEnv>,
    dao_id: ActorId,
) -> anyhow::Result<()> {
    {
        let mut svc = oracle.service("Service");
        OracleService::add_admin(&mut svc, dao_id)
            .await
            .context("Failed to add DAO as Oracle admin")?;
    }
    {
        let mut svc = bolao.service("Service");
        BolaoService::add_admin(&mut svc, dao_id)
            .await
            .context("Failed to add DAO as BolaoCore admin")?;
    }
    {
        let mut svc = freebet.freebet_ledger();
        svc.add_admin(dao_id)
            .await
            .context("Failed to add DAO as FreebetLedger admin")?;
    }
    Ok(())
}

fn env_path(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.into())
}

fn read_wasm(path: &str, label: &str) -> anyhow::Result<Vec<u8>> {
    std::fs::read(path).with_context(|| format!("Cannot read {label} WASM from '{path}'"))
}

fn env_bool(key: &str, default: bool) -> bool {
    std::env::var(key)
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(default)
}

fn env_actor(key: &str) -> Option<ActorId> {
    let val = std::env::var(key).ok()?;
    parse_actor_hex(&val).ok()
}

fn env_actors(key: &str) -> anyhow::Result<Vec<ActorId>> {
    let Some(value) = std::env::var(key).ok() else {
        return Ok(Vec::new());
    };
    value
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(parse_actor_hex)
        .collect()
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

fn actor_hex(actor: ActorId) -> String {
    format!("0x{}", hex::encode(actor.as_ref()))
}

fn salt(prefix: &str, version: &str) -> Vec<u8> {
    format!("{prefix}-{version}").into_bytes()
}

fn code_id_bytes(code_id: &CodeId) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(code_id.as_ref());
    bytes
}

async fn wait_block() {
    tokio::time::sleep(std::time::Duration::from_secs(6)).await;
}
