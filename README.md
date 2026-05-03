<h1 align="center"><img src="https://rivet.ironcladapp.com/img/logo-banner-wide.png" alt="Rivet Logo"></h1>

![License](https://img.shields.io/github/license/Ironclad/rivet)

<h3>
  <a href="https://github.com/valerypopoff/rivet2.0/releases">
    Download
  </a>
</h3>

<p>
  <a href="https://rivet.ironcladapp.com">Rivet</a>, the IDE for creating complex AI agents and prompt chaining, and embedding it in your application.
  <br />
  <br />
  <a href="https://github.com/valerypopoff/rivet2.0/issues">Report Bug</a>
  ·
  <a href="https://github.com/valerypopoff/rivet2.0/issues">Request Feature</a>
  ·
  <a href="https://github.com/valerypopoff/rivet2.0/discussions">Discussions</a>
</p>

- [About Rivet](#about-rivet)
  - [Rivet Application](#rivet-application)
  - [Rivet Core](#rivet-core)
- [Getting Started](#getting-started)
  - [Prebuilt Binaries](#prebuilt-binaries)
    - [Latest downloads](#latest-downloads)
    - [All Releases](#all-releases)
  - [Running from Source](#running-from-source)
- [Contributing](#contributing)
  - [Code of Conduct](#code-of-conduct)
- [Troubleshooting](#troubleshooting)

## About Rivet

### Rivet Application

Rivet is a desktop application for creating complex AI agents and prompt chaining, and embedding it in your application.

Rivet currently has LLM support for:

- [OpenAI GPT-3.5 and GPT-4](https://openai.com/gpt-4)
- [Anthropic Claude Instant and Claude 2](https://www.anthropic.com/index/claude-2)
- [Anthropic Claude 3 Haiku, Sonnet, and Opus] (https://www.anthropic.com/news/claude-3-family)
- [AssemblyAI LeMUR framework for voice data](https://www.assemblyai.com/products/speech-understanding?utm_source=rivet)

Rivet has embedding/vector database support for:

- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Pinecone](https://www.pinecone.io/)

Rivet also supports these additional integrations:

- [Speech-to-Text from AssemblyAI](https://www.assemblyai.com/discover/products/speech-to-text?utm_source=rivet)

For more information on how to use the application and all of its capabilities, see [the documentation](https://rivet.ironcladapp.com/docs)!

### Rivet Core

Rivet core is a TypeScript library for running graphs created in Rivet. It is used by the Rivet application, but can also be used in your own applications, so that Rivet can call into your own application's code, and your application can call into Rivet graphs.

For more information on using Rivet Core, see the [Rivet Integration Getting Started](https://rivet.ironcladapp.com/docs/api-reference/getting-started-integration) page and the related API documentation.

Rivet core is available on NPM as `@ironclad/rivet-core`. Rivet node is available as `@ironclad/rivet-node`. Documentation for each is available on the [Rivet website](https://rivet.ironcladapp.com/docs/api-reference).

## Getting Started

### Prebuilt Binaries

#### Latest downloads

- **[Download for MacOS](https://github.com/Ironclad/rivet/releases/latest/download/Rivet.dmg)**
- **[Download for Linux (AppImage)](https://github.com/Ironclad/rivet/releases/latest/download/Rivet.AppImage)**
- **[Download for Linux (dmg)](https://github.com/Ironclad/rivet/releases/latest/download/Rivet.dmg)**
- **[Download for Windows](https://github.com/Ironclad/rivet/releases/latest/download/Rivet-Setup.exe)**

#### All Releases

Check out the [releases page](https://github.com/Ironclad/rivet/releases) for all available releases.

### Running from Source

See [CONTRIBUTING.md](./CONTRIBUTING.md) for information on building and running Rivet from source.

## Contributing

All types of contributions are welcome - from code to documentation, bug reports, user experience feedback, and new feature suggestions!

Take a moment to read through the `CONTRIBUTING.md` file for help with setting up your development environment, and how to get started contributing to Rivet.

We use the All Contributors bot to recognize all our contributors, so every contribution is acknowledged. See the [Contributors](#contributors-) section below for everyone!

### Code of Conduct

The Rivet project is welcome to all contributors, and as such, we have a [Code of Conduct](./CODE_OF_CONDUCT.md) that all contributors must follow.

## Troubleshooting

If you have run into any issues while running the Rivet application, or when integrating it into your code, please check the [Issues](https://github.com/Ironclad/rivet/issues) page for any existing issues, and if you can't find any, please open a new issue!

If you have any other questions on using Rivet, or have any other ideas, feel free to open a [discussion](https://github.com/Ironclad/rivet/discussions)!

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind are welcome!
