use std::{env, fs, path::PathBuf};

fn main() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR should exist"));
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR should exist"));

    let idl_path = out_dir.join("freebet-ledger.idl");
    sails_idl_gen::generate_idl_to_file::<smartcup_freebet_ledger_app::FreebetLedgerProgram>(
        idl_path.clone(),
    )
    .expect("failed to generate SmartCup freebet ledger client IDL");

    let tmp_client = out_dir.join("freebet_ledger_client_gen.rs");
    sails_rs::ClientGenerator::from_idl_path(&idl_path)
        .generate_to(tmp_client.clone())
        .expect("failed to generate SmartCup freebet ledger client");

    fs::copy(
        &tmp_client,
        manifest_dir.join("src/freebet_ledger_client.rs"),
    )
    .expect("failed to copy generated SmartCup freebet ledger client");

    println!("cargo:rerun-if-changed=../app/src/lib.rs");
}
