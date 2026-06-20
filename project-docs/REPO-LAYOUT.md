# REPO LAYOUT — Workspace, Forks, and the Studio Server Relationship

> How the pieces sit on disk and in git, and — importantly — **what you edit vs. what
> you only consume.** Read this before assuming where a change belongs.
>
> **Last updated:** 2026-06-17

## The three pieces and their roles

| Piece | Role | Do you edit it? |
|-------|------|-----------------|
| **rivet2.0 fork** (`@valerypopoff/rivet2-*`) | The Rivet core. All Profiles/Skills/Presets work lives here (`packages/core/src/model/...`). | **Yes — this is the work.** |
| **Rivet Studio Server** | Hosting platform: browser editor over a port, endpoint publishing, run recordings, auth, Docker/K8s. *Consumes* Rivet as a read-only dependency. | **No, not for these features.** Point it at the fork. |
| **project-docs** (this material) | Planning: context, decisions, verified findings, specs. | Yes — kept separate from Rivet's own files. |

**Critical rule for Studio Server:** its `rivet/` directory is *read-only upstream input*
(its own docs: *"repo-specific behavior belongs in the wrapper layer, and real Rivet
changes should be contributed upstream"*). **Never make Rivet feature changes inside
Studio Server's `rivet/`.** They go in the rivet2.0 fork; Studio Server is pointed at it.

## Recommended on-disk structure

```
~/dev/rivet-workspace/                 ← plain folder, NOT a git repo (organisation only)
│
├── rivet2.0/                          ← git: YOUR FORK of valerypopoff/rivet2.0   ★ the work
│   ├── README.md                       (rivet2.0's own — untouched)
│   ├── CLAUDE.md                        (added — Claude Code finds it at the fork root)
│   ├── STARTING_PROMPT.md               (added)
│   ├── project-docs/                    (added — all planning material; this folder)
│   │   ├── README.md  PROJECT-CONTEXT.md  DECISIONS.md  VERIFIED-FINDINGS.md  REPO-LAYOUT.md
│   │   └── features/  (ROADMAP.md + 001/002/003 SPECs)
│   └── packages/core/...                (the Rivet code you edit)
│
└── rivet-studio-server/               ← git: clone of valerypopoff/Rivet-Studio-Server (Phase 2)
    └── rivet  ──symlink──▶ ../rivet2.0   (dev) │ or RIVET_REPO_URL→your fork (Docker)
```

**Why this shape:**
- **The parent is a plain folder, not a git repo** — nesting git repos inside a git repo
  creates submodule headaches. Keep the repos independent siblings.
- **Only `CLAUDE.md`, `STARTING_PROMPT.md`, and `project-docs/` are added to the fork
  root.** `README.md` is left as Rivet's own (this is why there is no top-level README in
  this set — the index lives at `project-docs/README.md`). Consolidating under
  `project-docs/` keeps the planning material as one thing to exclude from an upstream PR.
- **Docs live in the fork, not the parent**, because Claude Code runs with the fork as its
  working directory and reads them via relative paths.

## Connecting Studio Server to your fork

Two mechanisms (from Studio Server's architecture doc — VERIFIED-FINDINGS §G):

- **Local dev:** symlink `rivet-studio-server/rivet` → `../rivet2.0`. Studio Server
  supports *"a local symlink or Windows junction to another Rivet checkout."* Live edits in
  the fork are picked up.
- **Docker / prod:** set `RIVET_REPO_URL` to your fork's git URL and `RIVET_REPO_REF` to
  your branch/tag/SHA; its build clones that.

## Phasing — you don't need Studio Server yet

- **Phase 1 (now):** fork rivet2.0, build Features 001–003, validate **headlessly**
  (desktop app + `rivet-node` / `rivet serve`). Studio Server is **not involved**.
- **Phase 2 (hosting):** clone Studio Server, point it at the fork, build **from source**
  (not the prebuilt `ghcr.io` images — DECISIONS D2), deploy on the VM for browser editing
  and endpoint publishing.

## The one hosting integration point for later (not part of 001–003)

When hosting, two wrapper-side questions arise, both tied to VERIFIED-FINDINGS `[MV]`:
1. **Where per-profile API keys are entered/stored** in the hosted dashboard (Studio
   Server has its own settings + auth).
2. **Ensuring the `Settings` object (with `llmProfiles`) reaches Studio Server's
   server-side executor** at run time. If rivet2.0 passes `Settings` wholesale, this likely
   works unchanged; if not, a small wrapper change.

These are Phase 2 concerns. The three features themselves require **no** Studio Server edits.