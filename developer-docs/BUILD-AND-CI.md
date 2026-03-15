# Build System & CI/CD

> How to build, test, lint, and release Rivet.

## Prerequisites

- **Node.js 20.4+** (managed via Volta)
- **Yarn 4** (PnP mode, included in repo)
- **Rust** (via rustup, for Tauri builds)
- **Platform-specific**: See per-platform sections below

## Package Manager: Yarn 4 (PnP)

Rivet uses Yarn 4 with Plug'n'Play (PnP) - no `node_modules` directory.
Dependencies are stored in `.yarn/cache/` as zip files and resolved via `.pnp.cjs`.

```bash
# Install dependencies (from repo root)
yarn

# Use blobless clone for faster checkout
git clone --filter=blob:none https://github.com/Ironclad/rivet.git
```

**VS Code setup:**
- Install the **ZipFS** extension (required for PnP)
- Set **TypeScript → "Use Workspace Version"**

## Root Scripts

```bash
yarn dev          # Build executor + start app dev server
yarn build        # Full production build (all packages, in order)
yarn test         # Run tests (rivet-core only currently)
yarn lint         # Lint all packages
yarn prettier:fix # Auto-format all files
yarn publish      # Publish npm packages (requires OTP)
yarn publish-docs # Deploy documentation to docs branch
```

## Per-Package Build

### `rivet-core`

```bash
cd packages/core
yarn build        # Rollup (ESM) + esbuild (CJS) → dist/
yarn watch        # Watch mode for development
yarn test         # Vitest test suite
yarn lint         # ESLint
```

**Output:**
- `dist/esm/` - ES modules
- `dist/cjs/bundle.cjs` - CommonJS bundle
- `dist/esm/*.d.ts` - TypeScript declarations

### `rivet-node`

```bash
cd packages/node
yarn build        # Rollup → dist/
yarn lint
```

### `rivet-app`

```bash
cd packages/app
yarn start        # Vite dev server only (port 5173)
yarn dev          # Full Tauri dev (opens desktop window)
yarn build        # Vite production build → dist/
```

**Tauri build** (creates desktop installers):
```bash
cd packages/app/src-tauri
cargo tauri build
```

### `app-executor`

```bash
cd packages/app-executor
yarn build        # esbuild → single bundle
yarn dev          # Watch mode for development
```

### `rivet-cli`

```bash
cd packages/cli
yarn build        # Build CLI
```

### `trivet`

```bash
cd packages/trivet
yarn build        # Rollup → dist/
```

### `docs`

```bash
cd packages/docs
yarn start        # Docusaurus dev server (port 3000)
yarn build        # Static site build
```

## Development Workflow

### App Development

```bash
# Terminal 1: Start the full dev environment
yarn dev
# This runs:
#   1. yarn workspace @ironclad/rivet-app-executor run build
#   2. yarn workspace @ironclad/rivet-app run dev (Vite + Tauri)
```

### Core Development (with app hot-reload)

```bash
# Terminal 1: Watch core for changes
cd packages/core && yarn watch

# Terminal 2: Watch executor for changes
cd packages/app-executor && yarn dev

# Terminal 3: Run the app
cd packages/app && yarn dev
```

### Node Executor Development

When working on the app-executor sidecar:

```bash
# Terminal 1: Watch core changes
cd packages/core && yarn watch

# Terminal 2: Dev executor (separate from app)
cd packages/app-executor && yarn dev

# Terminal 3: Run app
yarn dev
```

## TypeScript Configuration

### Base Config (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "composite": true,
    "declaration": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "ts-node": {
    "swc": true,
    "compilerOptions": {
      "module": "CommonJS"       // Only for ts-node scripts, NOT main builds
    }
  }
}
```

> **Note**: The base config does NOT set `module` or `moduleResolution` - these
> are configured per-package in their individual `tsconfig.json` files.

Each package extends this with its own `tsconfig.json`.

## Linting

**ESLint v9** with flat config (`eslint.config.mjs`):

```javascript
// Key rules:
{
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  'import/no-cycle': 'warn',
  // React hooks rules (for app package)
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
}
```

**Prettier** for formatting:
```yaml
# .prettierrc.yml
singleQuote: true
trailingComma: all
printWidth: 120
```

## CI/CD (GitHub Actions)

### Build Workflow (`.github/workflows/build.yml`)

Triggers on: all branches, all PRs

```yaml
runs-on: ubuntu-latest
node: 20.4.x
steps:
  - yarn --immutable    # Install (no lockfile changes)
  - yarn build          # Full build
  - yarn test           # Tests
  - yarn lint           # Linting
  - prettier --check .  # Format check
env:
  NODE_OPTIONS: --max-old-space-size=6144  # 6GB memory
```

### Release Workflow (`.github/workflows/release.yml`)

Triggers on: `app-v*` tags, `windows-builds` branch

**Matrix builds:**

| Platform | Runner | Target |
|----------|--------|--------|
| Windows | `windows-latest` | x64 |
| macOS | `macos-latest` | universal (x64 + ARM) |
| Linux x64 | `ubuntu-22.04` | x86_64 |
| Linux ARM | `ubuntu-22.04` (ARM) | aarch64 |

**Steps per platform:**
1. Setup Node.js 20.4.x + Rust toolchain
2. Install platform-specific deps (Linux: `libgtk-3-dev`, `libwebkit2gtk-4.0-dev`, etc.)
3. `yarn --immutable` + `yarn build`
4. `cargo tauri build` (creates platform installers)
5. Create draft GitHub release
6. Upload artifacts

**Secrets used:**
- `GITHUB_TOKEN` - Release creation
- `TAURI_PRIVATE_KEY` - App signing
- `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` - macOS code signing
- `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID` - macOS notarization

### Release Asset Renaming (`.github/scripts/rename-release-files.mts`)

After release, renames versioned files to permanent URLs:
```
Rivet_X.X.X_universal.dmg     → Rivet.dmg
Rivet_X.X.X_amd64.AppImage    → Rivet.AppImage
Rivet_X.X.X_x64-setup.exe     → Rivet-Setup.exe
```

## Release Process

### 1. Version Bump

Update version in relevant `package.json` files:
- `packages/core/package.json`
- `packages/node/package.json`
- `packages/app/package.json`
- `packages/app/src-tauri/tauri.conf.json`
- `packages/cli/package.json`
- `packages/trivet/package.json`

### 2. Publish npm Libraries

```bash
yarn publish
# Publishes: rivet-core, rivet-node, rivet-cli, trivet
# Requires OTP code
# Also builds Docker image for CLI
```

### 3. Create Git Tags

```bash
git tag v1.X.X           # Library version
git tag app-v1.X.X       # App version (triggers release build)
git push origin --tags
```

### 4. GitHub Release

1. CI creates a draft release from the `app-v*` tag
2. Wait for all platform builds to complete
3. Run rename script for permanent download URLs
4. Write release notes
5. Publish the release

### 5. Documentation

```bash
yarn publish-docs
# Builds docs, checks out docs branch, copies files, commits
```

## Docker (CLI)

The CLI can be deployed as a Docker container:

```dockerfile
FROM node:20-slim
RUN npm install -g @ironclad/rivet-cli
ENTRYPOINT ["rivet"]
```

See `packages/docs/docs/cli/docker.md` for full examples.

## Environment Variables

| Variable | Used By | Purpose |
|----------|---------|---------|
| `OPENAI_API_KEY` | core/app | OpenAI API access |
| `OPENAI_API_ENDPOINT` | core/app | Custom OpenAI endpoint |
| `OPENAI_ORGANIZATION` | core/app | OpenAI org ID |
| `ANTHROPIC_API_KEY` | core/app | Anthropic Claude access |
| `TAURI_PRIVATE_KEY` | CI | App signing |
| `APPLE_CERTIFICATE` | CI | macOS code signing |
| `APPLE_ID` / `APPLE_PASSWORD` | CI | macOS notarization |
