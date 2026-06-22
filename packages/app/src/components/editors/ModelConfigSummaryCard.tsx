import { type FC } from 'react';
import {
  type ChartNode,
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
    node.data as never,
  );

  const completeness = assessLLMChatV2Completeness(effective as never);
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

  // Complete → show the resolved config, read-only (model-config is layer-owned in R2).
  const fields = deriveModelConfigSummary(effective, node.data as never, effective as never, true);
  return (
    <div css={styles}>
      {fields.map((field) => (
        <div className="summary-row" key={field.key}>
          <span className="summary-label">{field.label}</span>
          <span className="summary-value">{field.value}</span>
        </div>
      ))}
    </div>
  );
};
