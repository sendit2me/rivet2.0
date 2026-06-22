import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const card = readFileSync(join(dir, 'ModelConfigSummaryCard.tsx'), 'utf8');

test('the card renders the schema-driven groups GENERICALLY (iterate groups + rows, no hardcoded chat rows)', () => {
  // R4: the chat node passes its own signature; the derivation is generic per kind. (Post type-split,
  // the card consumes the gate's narrowed Complete effective config — no `as never`.)
  assert.match(card, /deriveModelConfigSummary\(completeness\.effective as Record<string, unknown>, 'text-to-text'\)/);
  assert.match(card, /groups\.map\(/);
  assert.match(card, /group\.rows\.map\(/);
  // The generic labeled-group render branch is exercised by the source even though only the unlabeled
  // chat group mounts today — keeping the render path faithful to the derivation's genericity.
  assert.match(card, /group\.label && <div className="summary-group-label">/);
});

test('the card is read-only and shows the incomplete state (R2)', () => {
  assert.match(card, /assessLLMChatV2Completeness/);
  assert.match(card, /Incomplete/);
  // No inline editing on the card (editing is the R3 selectors / inline authoring).
  assert.doesNotMatch(card, /onChange=\{.*setField|FieldControl|Markers/);
});
