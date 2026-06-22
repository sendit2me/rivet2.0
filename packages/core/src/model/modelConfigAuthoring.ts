/**
 * Model-config authoring helpers (R3). Pure + UI-agnostic so they are unit-testable and shared by the
 * project-settings panel and the inline node-editor authoring modal.
 */

/**
 * **copy-new (clone)** — the *diverging* fork of a model-config entity (Profile / Skill / Preset),
 * complementing `extends` (the *live-link* fork). Returns a **deep** copy (`structuredClone`) with a
 * fresh id and a "Copy of …" name; editing the clone can never affect the original (incl. nested
 * `base` / `providers`). `extends` is copied verbatim (a pointer): cloning "X extends Y" yields
 * "Copy of X extends Y" — own fields diverge, inheritance from Y stays live. A flatten/standalone
 * snapshot is a different op (not R3). The caller supplies `newId` (e.g. `nanoid()`) so this stays pure.
 */
export function cloneModelConfigEntity<T extends { id: string; name: string }>(entity: T, newId: string): T {
  return { ...structuredClone(entity), id: newId, name: `Copy of ${entity.name}` };
}
