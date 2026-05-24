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
certificate_path="${RUNNER_TEMP:?}/apple-signing-certificate.p12"
keychain_path="${RUNNER_TEMP:?}/rivet-macos-signing.keychain-db"
keychain_password="$(uuidgen)"

if [[ "$APPLE_API_PRIVATE_KEY" == *'\n'* ]]; then
  printf '%b\n' "$APPLE_API_PRIVATE_KEY" > "$tmp_key_path"
else
  printf '%s\n' "$APPLE_API_PRIVATE_KEY" > "$tmp_key_path"
fi

tr -d '\r' < "$tmp_key_path" > "$key_path"
rm -f "$tmp_key_path"
chmod 600 "$key_path"
printf 'APPLE_API_KEY_PATH=%s\n' "$key_path" >> "${GITHUB_ENV:?}"

printf '%s' "$APPLE_CERTIFICATE" | tr -d '\r\n ' | openssl base64 -d -A -out "$certificate_path"

rm -f "$keychain_path"
security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"
security import "$certificate_path" \
  -k "$keychain_path" \
  -P "$APPLE_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain_path"

existing_keychains=()
while IFS= read -r existing_keychain; do
  existing_keychains+=("${existing_keychain//\"/}")
done < <(security list-keychains -d user)
security list-keychains -d user -s "$keychain_path" "${existing_keychains[@]}"

if ! security find-identity -v -p codesigning "$keychain_path" | grep -F -- "$APPLE_SIGNING_IDENTITY" >/dev/null; then
  printf 'APPLE_SIGNING_IDENTITY did not match an identity imported from APPLE_CERTIFICATE.\n' >&2
  exit 1
fi

rm -f "$certificate_path"
printf 'APPLE_SIGNING_KEYCHAIN=%s\n' "$keychain_path" >> "${GITHUB_ENV:?}"
