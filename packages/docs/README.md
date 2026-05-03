# Rivet 2.0 Docs

This package contains the Docusaurus documentation site for Rivet 2.0.

The docs should describe the current Rivet 2.0 package and app shape:

- User Guide pages, especially the introduction, are for desktop app users; introduce Rivet as a visual low-code tool for AI and non-AI workflows, quick experiments, production workflows, and the optional self-hosted web-app form through Rivet Studio Server, while runtime package, CLI, source-checkout, and wrapper embedding details belong in the API Reference
- public runtime packages: `@valerypopoff/rivet2-core`, `@valerypopoff/rivet2-node`, and `@valerypopoff/rivet2-cli`
- desktop/editor package: `@valerypopoff/rivet-app`
- Node executor package: `@valerypopoff/rivet-app-executor`
- app-level plugin installation with project YAML plugin declarations derived from actual plugin-node usage
- LLM Chat as the recommended chat node for new graphs
- Browser, Node, and remote executor behavior
- `/download`, including official Windows release metadata from the main-branch Pages workflow and developer Windows release metadata from the develop-branch Pages workflow
- wrapper/embedding seams documented in the repo's developer docs
- article typography should keep body text close to its preceding heading while preserving larger default gaps between adjacent headings

The GitHub Pages deployment uses `baseUrl: /rivet2.0/` and serves docs from the site root. The custom Docusaurus pages plugin is disabled so the first page is the documentation introduction rather than a marketing landing page.

### Installation

```bash
yarn install --immutable
```

### Local Development

```bash
yarn workspace docs start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```bash
yarn workspace docs build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Maintenance

When app/runtime behavior changes, update both these public docs and the matching developer docs under `developer-docs/`. The developer docs are the implementation-facing source of truth; this site is the user-facing/API-facing version of the same contract.
