export async function createNativeGraphRunner() {
  return {
    supported: false,
    reason:
      'native runtime binary is not built yet; run the explicit native-runtime build after the Rust backend passes the benchmark gate',
  };
}
