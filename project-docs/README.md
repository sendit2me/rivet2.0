# project-docs — Rivet Model-Configuration Layer

Planning and reference material for adding a reusable model-configuration layer to
**Rivet 2** (`valerypopoff/rivet2.0`, MIT) so any node can use a different model,
credential, and behavior — the foundation for multi-model graphs (adversarial agents,
arbitration, role-based pipelines).

> **This folder lives inside the rivet2.0 fork** (at `<fork>/project-docs/`). The fork's
> own `README.md` stays at the fork root — this is the index for the *planning* material
> only. The two operating files, `CLAUDE.md` and `STARTING_PROMPT.md`, sit one level up at
> the **fork root** (so Claude Code finds `CLAUDE.md` automatically). See `REPO-LAYOUT.md`.

## Reading order

**For a human picking up the project:**
1. `PROJECT-CONTEXT.md` — what we're doing, what we evaluated, where we're going.
2. `DECISIONS.md` — the key choices and their evidence (why rivet2.0, why Studio Server,
   composition-not-inheritance, build order, risk).
3. `VERIFIED-FINDINGS.md` — dated, checked code facts (use these; don't re-investigate).
4. `REPO-LAYOUT.md` — how the fork, Studio Server, and these docs sit on disk.
5. `features/ROADMAP.md` — the three-feature plan and invariants.

**For the implementing agent (Claude Code):**
- `../CLAUDE.md` (at the fork root) — operating constraints, rails, dev/headless workflow.
- `../STARTING_PROMPT.md` — the kickoff prompt for Feature 001.
- `features/001-llm-profiles/SPEC.md` — first task (then 002, then 003).

## Layout (this folder)

```
project-docs/
├── README.md             (this file)
├── PROJECT-CONTEXT.md
├── DECISIONS.md
├── VERIFIED-FINDINGS.md
├── REPO-LAYOUT.md
└── features/
    ├── ROADMAP.md
    ├── 001-llm-profiles/SPEC.md
    ├── 002-skills/SPEC.md
    └── 003-presets-agents/SPEC.md
```

(At the fork root, alongside this folder: `CLAUDE.md`, `STARTING_PROMPT.md`, and Rivet's
own `README.md` / `package.json` / `packages/`.)

## One-line status

Architecture **decided**, code facts **verified against rivet2.0** (2026-06-17),
implementation **not started** — Feature 001 is specified and ready.

## Build target & hosting (summary)

- **Build on:** a fork of `valerypopoff/rivet2.0` (`@valerypopoff/rivet2-*`).
- **Host with:** `valerypopoff/Rivet-Studio-Server`, **built from source**, pointing
  `RIVET_REPO_URL`/`RIVET_REPO_REF` at the fork. Gives browser editing over a port,
  endpoint publishing, run recordings, remote debugger, and auth for free.
  **You do not edit Studio Server for these features** — see `REPO-LAYOUT.md`.
- **Still ours to build:** this config layer now; multi-agent primitives later.