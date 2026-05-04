use sails_client_gen::ClientGenerator;
use std::{env, fs, path::PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let idl_path = out_dir.join("bolao.idl");
    sails_idl_gen::generate_idl_to_file::<bolao_app::Program>(idl_path.clone()).unwrap();

    let tmp_client = out_dir.join("bolao_client_gen.rs");
    ClientGenerator::from_idl_path(&idl_path)
        .generate_to(tmp_client.clone())
        .unwrap();

    fs::copy(&tmp_client, manifest_dir.join("src/bolao_client.rs")).unwrap();
}
