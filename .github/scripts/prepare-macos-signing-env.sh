#!/usr/bin/env bash
set -euo pipefail

required=(
  APPLE_CERTIFICATE
  APPLE_CERTIFICATE_PASSWORD
  APPLE_SIGNING_IDENTITY
  APPLE_API_ISSUER
  APPLE_API_KEY
  APPLE_API_PRIVATE_KEY
)

missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Missing required macOS signing/notarization secrets: %s\n' "${missing[*]}" >&2
  exit 1
fi

key_path="${RUNNER_TEMP:?}/apple-notarization-key.p8"
tmp_key_path="${key_path}.tmp"

if [[ "$APPLE_API_PRIVATE_KEY" == *'\n'* ]]; then
  printf '%b\n' "$APPLE_API_PRIVATE_KEY" > "$tmp_key_path"
else
  printf '%s\n' "$APPLE_API_PRIVATE_KEY" > "$tmp_key_path"
fi

tr -d '\r' < "$tmp_key_path" > "$key_path"
rm -f "$tmp_key_path"
chmod 600 "$key_path"
printf 'APPLE_API_KEY_PATH=%s\n' "$key_path" >> "${GITHUB_ENV:?}"
