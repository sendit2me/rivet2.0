# KICKOFF — Feature 005, Phase C2 (Override badges)

Working in `~/project/rivet2.0` (fork `sendit2me/rivet2.0`), on `main` (001–004, 005A, 005B, 005C1,
006 merged). This kicks off **Phase C2** — the final 005 phase: show an "overridden" badge on a node
field whose **own** value differs from what its Preset/Skill/Profile (+ overrides) would compose to.
**Read-only visualization — it must not change execution.** The design is SPEC 005 §3 Phase C2; this
is the brief over it (no new SPEC).

**This builds directly on C1.** C1's shared field groups gave you the canonical model-config field
list (`CONNECTION_KEYS` / `BEHAVIOR_KEYS` in `modelConfigFields.tsx`) and the presence-keyed
overrides — that field list is exactly the set C2 composes and compares.

## Read first
1. `project-docs/features/005-model-config-ui/SPEC.md` — §3 Phase C2 (the design) + §2 anchors.
2. `project-docs/VERIFIED-FINDINGS.md` — §J.2 (C1 anchors: shared field groups, the advanced gate),
   §K (006: the assembled `merge(project, global)` composition).
3. The 001–004 resolution — `model/LlmPresetResolution.ts` (`resolveNodeModelComposition`) and its
   siblings — the chain C2 mirrors.
4. `project-docs/CLAUDE.md`, `DECISIONS.md`.

## Rails (non-negotiable)
- **Gated.** Investigate → pre-code report → STOP for sign-off → implement → STOP at the boundary.
- **Read-only / no execution change.** The badge is a UI indicator computed from data that already
  exists; it must NOT alter node data, the composition, or the request. The byte-identical rail is
  untouched here.
- **Compare by RESOLVED VALUE, not key presence.** A node field that is unset — including a cleared
  `extraBody` (`undefined`) — **inherits** → no badge. Only a node field that is **set AND differs**
  from the composed value is "overridden". (This is the C1 `extraBody`-`undefined` note: `undefined`
  ≠ overridden.)
- **No hardcoded domain knowledge. No Rust.**

## Scope (C2 — confirm or refine in your report)
1. **`describeNodeComposition`** — given the effective `modelConfig` + the node's selectors
   (preset/skill/profile ids), compute the **per-field composed value** from the
   `Preset overrides > Skill > Profile > Global` chain, **excluding the node's own values** (that's
   the baseline the node is compared against). **Reuse the existing resolution chain — do not
   reimplement the merge.** Use the C1 field list (`CONNECTION_KEYS` / `BEHAVIOR_KEYS`) as the field set.
2. **Per-field comparison (app)** — for each model-config field, compare the node's own value to the
   composed value. Badge it "overridden" iff the node value is **set AND differs** from composed.
   Unset / wired / equal → no badge.
3. **Input-wired exclusion** — a field driven by an input wire is the wire's, not an override; don't
   badge it.
4. **Badge UI** — a small "overridden" indicator on the node-editor field (placement + style to
   propose). Read-only.

## The design questions your report must resolve
1. **THE composition anchor (load-bearing).** What does `resolveNodeModelComposition` take/return,
   and can you obtain the **composed-sans-the-node's-own-values** per-field from it (or a sibling
   helper that taps the same chain)? Quote `file:line`. This decides whether `describeNodeComposition`
   is a thin wrapper or a parallel traversal — confirm before any code.
2. **Where `describeNodeComposition` lives** — core (beside the resolution, reusing its internals —
   preferred, so the chain isn't duplicated in the app) vs app `utils/`.
3. **The node-data ↔ composed-field mapping** — which Chat node data keys correspond to which
   composed fields (the node's own `temperature`/`maxTokens`/`model`/… that participate in the
   `Node > …` precedence). Confirm the node carries its own per-field values to compare.
4. **modelConfig source** — the badge reads the **same source the selectors use**
   (`getEditorModelConfig(project)`, project-scoped). Confirm; note that since the global library is
   deferred, this matches execution's `merge(project, global)`.
5. **Input-wired detection** — how a field's input-toggle / wired state is read in the node editor.
6. **Badge placement** — where in `DefaultNodeEditorField` / the field row the indicator renders,
   read-only.

## Investigate, then REPORT (no code yet)
1. **Understanding** — C2 in your words; what's read-only; what stays out.
2. **Composition anchor (the load-bearing item)** — per design-question 1, `file:line`, plus your
   `describeNodeComposition` shape (signature + return: the per-field composed map).
3. **Where it lives + the node-field mapping + the modelConfig source** (questions 2–4), `file:line`.
4. **Input-wired detection + badge placement** (questions 5–6), `file:line`.
5. **Comparison rule** — set-and-differs badges; unset / wired / equal / `undefined` don't. State
   explicitly how `undefined` node values (incl. a cleared `extraBody`) are treated as inherit (no
   badge), and how you compare object values (e.g. `extraBody`) for equality.
6. **Decisions** — restate: read-only / no execution change; compare by resolved value; reuse the
   resolution chain + the C1 field list; project-scoped `modelConfig` source.
7. **File list.**
8. **Test plan** — source-contract / pure (no DOM renderer): `describeNodeComposition` unit tests
   (a preset/skill/profile chain composes the expected per-field values; the node's own values are
   excluded); the comparison rule (set-and-differs vs unset / equal / `undefined`); input-wired
   excluded. Note the Playwright deltas (a badge appears when a node field overrides its preset, and
   clears when matched or unset) for the post-merge `ui-testing` run.
9. **Conflicts / surprises** — especially if the resolution chain can't cleanly yield the
   sans-node per-field composition (which would change the approach).

Then **STOP** for alignment.

## After sign-off
- Implement as one gated unit. Prove read-only (no execution / byte-identical change); prove the
  comparison rule.
- Green: app `tsc` + `vite build`, lint, app + core suites, new tests.
- **One logical commit** on `feature/005c2-override-badges`. **STOP at the boundary** — 005 is
  complete after this; don't start anything new. Don't push — leave for diff review → merge to `main`.