# PROJECT CONTEXT — Rivet Model-Configuration Layer

> Orientation document. Read this to understand *what* we are building, *what we
> evaluated and rejected*, and *where this is going and why*. Decisions are recorded
> in `DECISIONS.md`; dated, verified code facts are in `VERIFIED-FINDINGS.md`; the
> feature plan is in `features/ROADMAP.md`.
>
> **Last updated:** 2026-06-17

## 1. What we are building

A **reusable model-configuration layer for Rivet** so that any node in a graph can
use a different model, credential, and behavior — instead of the single global
model config Rivet has today.

The destination this serves: a **visual multi-agent workflow harness** where *an
agent is a model + a skill*. Multi-model graphs unlock the patterns we actually
want — **adversarial agents** (same task, different brains, compared), **arbitration**
(one model reviews others' output), and **role-based pipelines** (spec writer →
developer → tester → reviewer → commit, with loops and best-of-N).

The three features in `ROADMAP.md` (LLM Profiles → Skills → Presets) are the
foundation that makes "model + skill, per node" expressible. The harness itself is
later and out of scope for now.

## 2. What we evaluated (and why we narrowed to Rivet)

We surveyed three layers of the agentic-tooling landscape:

- **Visual LLM-workflow builders** — Dify, Flowise, Langflow, Rivet. These give the
  drag-and-drop canvas. Dify and n8n were ruled out as a *product base* on licensing
  (Dify's Apache+extra terms restrict competing SaaS; n8n's Sustainable Use License
  forbids embedding in a sold product). Flowise (MIT, has first-class multi-agent
  Agentflow nodes) and Rivet (MIT, clean plugin model, embeddable runtime) were the
  finalists.
- **Agent frameworks** (the engine) — LangGraph, CrewAI, Microsoft Agent Framework,
  LlamaIndex Workflows, Claude Agent SDK. Candidates to sit *under* a canvas.
- **Coding-agent orchestrators** — Antfarm, Gastown, Conductor, vibe-kanban, tutti,
  Claude Squad. These nail Ralph loops / best-of-N / git-worktree fan-out but are
  config/CLI/Kanban-driven, not visual designers.

**Rivet vs Flowise:** Flowise is the faster path to a working pipeline (its
Agentflow already has Agent/Condition/Loop/HumanInput nodes). Rivet is the better
thing to *own and extend* — cleaner plugin model, pure MIT, and crucially **we
control the data types flowing between nodes**, which is exactly what reliable
typed agent-to-agent boundaries require (the dominant multi-agent failure mode is
agents exchanging messy/loose payloads at boundaries). We chose Rivet to build on.

**The decisive find on Rivet:** the original `Ironclad/rivet` is effectively dormant
(see `DECISIONS.md` / `VERIFIED-FINDINGS.md` — only dependency bumps since Oct 2025),
and **`valerypopoff/rivet2.0`** is the living continuation (MIT, 666 commits since the
fork) with explicit embedding seams. Alongside it, **`valerypopoff/Rivet-Studio-Server`**
(MIT) is a self-hosted platform that already provides a browser editor, one-click
endpoint publishing, run recordings, a remote debugger, auth, and Docker/K8s deploy.
That collapses most of the hosting/serving infrastructure we were about to build.

## 3. Where we are going, and why

- **Base all feature work on `rivet2.0`** (`@valerypopoff/rivet2-*`), not Ironclad
  Rivet. It is the maintained line and is built to be embedded. There is no upstream
  value being left behind (upstream added nothing of substance since the fork).
  → `DECISIONS.md` D1.
- **Host via Rivet Studio Server**, built from source (not the prebuilt GHCR images),
  consuming *our* rivet2.0 fork via `RIVET_REPO_URL` / `RIVET_REPO_REF`. This answers
  the "edit Rivet over a port on a headless VM" need as a product, and replaces the
  manual "build locally → sync .rivet-project → write a server" loop.
  → `DECISIONS.md` D2.
- **Model the config layer as composition, not cross-axis inheritance**: LLM Profiles
  (connection) × Skills (behavior), with optional single-axis `extends` and a Preset
  bundle for one-pick selection. This avoids an N×M explosion and is what makes
  "same skill on many models" trivial. → `DECISIONS.md` D3.
- **Build order:** Feature 001 → 002 → 003, each independently shippable. The
  multi-agent *primitives* (coding-agent-in-a-worktree node, Ralph loop, best-of-N,
  review gates) come **after** this layer and are not provided by Studio Server.
  → `DECISIONS.md` D4.

## 4. What remains ours to build vs. what we get for free

- **For free (from rivet2.0 + Studio Server):** the visual canvas, the embeddable
  headless runtime, browser editing over a port, endpoint publishing, run
  recordings/observability, remote debugger, auth, and Docker/K8s deployment.
- **Ours to build:** the LLM Profiles / Skills / Presets layer (this project), and
  later the multi-agent orchestration nodes. Studio Server publishes Rivet graphs as
  endpoints; it does not add agent execution primitives.

## 5. Status

- Architecture and direction: **decided** (this doc + `DECISIONS.md`).
- Code facts needed to implement: **verified against rivet2.0**, dated, in
  `VERIFIED-FINDINGS.md` — use these instead of re-investigating.
- Implementation: **not started.** Feature 001 is specified and ready.