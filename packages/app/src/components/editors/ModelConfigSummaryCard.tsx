import { type FC, Fragment } from 'react';
import {
  type ChartNode,
  type LLMChatV2NodeData,
  type LlmModelConfigSummaryEditorDefinition,
  deriveModelConfigSummary,
  resolveEffectiveLLMChatV2Data,
  assessLLMChatV2Completeness,
} from '@valerypopoff/rivet2-core';
import { css } from '@emotion/react';
import { useAtomValue } from 'jotai';
import { type SharedEditorProps } from './SharedEditorProps';
import { projectState } from '../../state/savedGraphs';
import { getEditorModelConfig } from '../../utils/projectModelConfig';

/**
 * R2 — the model-config Resolved-config card. The node is **config-less**: model-config comes only
 * from the bound layer, so this card is **read-only** (no inline tweak / override markers — there is
 * no per-node override state). It shows either the resolved config (what actually runs) or, when the
 * binding is incomplete, a clear "bind a Profile + Skill or a Preset" state in place of the config.
 * Pure-presentational over `node` + the project modelConfig (the editor-render resolver path).
 */

const styles = css`
  display: flex;
  flex-direction: column;
  gap: 6px;

  .summary-group-label {
    color: var(--grey-light);
    font-size: 11px;
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 2px;
  }

  .summary-row {
    display: grid;
    grid-template-columns: 130px 1fr;
    align-items: baseline;
    gap: 8px;
  }

  .summary-label {
    color: var(--grey-light);
    font-size: 12px;
  }

  .summary-value {
    font-family: var(--font-family-monospace);
    font-size: 12px;
    word-break: break-word;
  }

  .summary-hint {
    color: var(--grey-light);
    font-size: 12px;
    margin: 0;
  }

  .summary-incomplete {
    color: var(--warning, #e2b203);
    font-size: 12px;
    margin: 0;
  }
`;

export const ModelConfigSummaryCard: FC<
  SharedEditorProps & { editor: LlmModelConfigSummaryEditorDefinition<ChartNode> }
> = ({ node }) => {
  const project = useAtomValue(projectState);
  const data = node.data as Record<string, unknown>;

  const effective = resolveEffectiveLLMChatV2Data(
    getEditorModelConfig(project),
    {
      llmPresetId: data.llmPresetId as string | undefined,
      llmProfileId: data.llmProfileId as string | undefined,
      llmSkillId: data.llmSkillId as string | undefined,
    },
    node.data as LLMChatV2NodeData,
  );

  const completeness = assessLLMChatV2Completeness(effective);
  if (!completeness.complete) {
    return (
      <div css={styles}>
        <p className="summary-incomplete">⚠ Incomplete — {completeness.reason}.</p>
        <p className="summary-hint">
          Bind a Profile + Skill (or a Preset) above to give the node a connection and a model; the resolved config then
          shows here.
        </p>
      </div>
    );
  }

  // Complete → show the resolved config, read-only (model-config is layer-owned in R2). The derivation
  // is schema-driven per kind (R4); the LLM Chat node passes its own signature, text-to-text. The card
  // renders groups generically — a header iff the group is labeled (chat = one unlabeled group → flat).
  const groups = deriveModelConfigSummary(completeness.effective as Record<string, unknown>, 'text-to-text');
  return (
    <div css={styles}>
      {groups.map((group, groupIndex) => (
        <Fragment key={group.label ?? `group-${groupIndex}`}>
          {group.label && <div className="summary-group-label">{group.label}</div>}
          {group.rows.map((row) => (
            <div className="summary-row" key={row.key}>
              <span className="summary-label">{row.label}</span>
              <span className="summary-value">{row.value}</span>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
};
