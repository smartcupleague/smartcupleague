#![cfg_attr(not(any(test, feature = "std")), no_std)]

#[cfg(all(not(target_arch = "wasm32"), any(feature = "wasm-binary", test)))]
mod code {
    include!(concat!(env!("OUT_DIR"), "/wasm_binary.rs"));
}

#[cfg(all(not(target_arch = "wasm32"), any(feature = "wasm-binary", test)))]
pub use code::WASM_BINARY_OPT as WASM_BINARY;

#[cfg(any(test, feature = "oracle-client"))]
pub use oracle_client as client;

#[cfg(target_arch = "wasm32")]
pub use oracle_app::wasm::*;
