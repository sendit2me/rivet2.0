fn main() {
    if let Err(error) = rivet2_native_runtime::run_worker_stdio() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
