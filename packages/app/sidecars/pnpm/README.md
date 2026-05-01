# pnpm Tauri Sidecars

Rivet tracks these `pnpm` binaries intentionally because the desktop app uses Tauri sidecars to install package plugins without depending on a user-installed `pnpm`.

Runtime consumers:

- `packages/app/src-tauri/tauri.conf.json` lists `../sidecars/pnpm/pnpm` in `bundle.externalBin`.
- `packages/app/src/hooks/useLoadPackagePlugin.ts` starts `../sidecars/pnpm/pnpm` through the Tauri sidecar shell API.

Current policy:

- Keep the binaries in Git until the release pipeline has a checksum-verified download or Git LFS replacement.
- Treat these files as vendored binary artifacts, not generated source.
- Keep `SHA256SUMS` updated whenever any sidecar binary changes.
- Keep `.gitattributes` marking this directory as binary and vendored.

Current observed Windows sidecar version:

- `pnpm-x86_64-pc-windows-msvc.exe --version` reports `8.8.0`.

Update checklist:

1. Replace all target sidecar binaries together.
2. Run the Windows sidecar with `--version` and update this file if the version changes.
3. Regenerate checksums from the repository root:

   ```powershell
   Get-ChildItem packages/app/sidecars/pnpm -File |
     Where-Object { $_.Name -like 'pnpm-*' } |
     Get-FileHash -Algorithm SHA256 |
     Sort-Object Path |
     ForEach-Object {
       '{0}  {1}' -f $_.Hash.ToLowerInvariant(), (Resolve-Path -Relative $_.Path).TrimStart('.\').Replace('\', '/')
     }
   ```

4. Replace `packages/app/sidecars/pnpm/SHA256SUMS` with the regenerated output.
5. Verify Tauri can still start the sidecar and install a package plugin.

Future improvement:

- Move these artifacts to Git LFS or a checksum-verified release-artifact download step once the release pipeline can guarantee offline-safe packaging from a clean checkout.
