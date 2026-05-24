#!/usr/bin/env bash
set -euo pipefail

bundle_dir="${1:-packages/app/src-tauri/target/universal-apple-darwin/release/bundle}"

if [[ ! -d "$bundle_dir" ]]; then
  printf 'macOS bundle directory does not exist: %s\n' "$bundle_dir" >&2
  exit 1
fi

app_path="$(find "$bundle_dir" -type d -name '*.app' -print -quit)"
dmg_path="$(find "$bundle_dir" -type f -name '*.dmg' -print -quit)"

if [[ -z "$app_path" ]]; then
  printf 'No .app bundle found under %s\n' "$bundle_dir" >&2
  exit 1
fi

if [[ -z "$dmg_path" ]]; then
  printf 'No .dmg bundle found under %s\n' "$bundle_dir" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
codesign --verify --verbose=2 "$dmg_path"
spctl --assess --type execute --verbose=4 "$app_path"
xcrun stapler validate "$app_path"
xcrun stapler validate "$dmg_path"
spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg_path"
