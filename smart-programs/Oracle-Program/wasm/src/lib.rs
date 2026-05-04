#![no_std]

#[cfg(target_arch = "wasm32")]
pub use app::wasm::*;

#[cfg(not(target_arch = "wasm32"))]
pub const WASM_BINARY: &[u8] = include_bytes!(
    concat!(env!("CARGO_MANIFEST_DIR"), "/../target/wasm32-gear/release/wasm.wasm")
);
