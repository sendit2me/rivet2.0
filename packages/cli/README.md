# @rivet2/rivet-cli

Command-line tools for running and serving Rivet 2.0 projects through the Node runtime.

## Usage

```bash
npx @rivet2/rivet-cli --help
npx @rivet2/rivet-cli run my-project.rivet-project
npx @rivet2/rivet-cli serve my-project.rivet-project --port 8080
```

The CLI package exposes the `rivet` binary when installed globally:

```bash
npm install -g @rivet2/rivet-cli
rivet --help
```

## Development

```bash
yarn workspace @rivet2/rivet-cli run build
yarn workspace @rivet2/rivet-cli run test
yarn workspace @rivet2/rivet-cli run lint
```

See the root [README](../../README.md), [package docs](../../developer-docs/PACKAGES.md), and public CLI docs under [packages/docs/docs/cli.md](../docs/docs/cli.md).
