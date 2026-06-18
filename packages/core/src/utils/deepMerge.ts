/** True for a plain object (recurse target). Arrays, null, and class instances replace, not merge. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep, per-key merge with the **override winning**. Nested plain objects recurse; non-object
 * values — including arrays — **replace** at their key (they are not concatenated or merged).
 *
 * Pure: returns a new object and never mutates either input. Used for the `extraBody` channel
 * (Feature 004) at every merge site — the Skill `extends` chain, the Node > Preset > Skill
 * composition, and the final fold onto the request body — so the same semantics hold throughout.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const incoming = override[key];
    const existing = result[key];
    if (isPlainObject(incoming) && isPlainObject(existing)) {
      result[key] = deepMerge(existing, incoming);
    } else {
      result[key] = incoming;
    }
  }
  return result;
}
