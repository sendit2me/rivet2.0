import { type FC } from 'react';
import {
  type ChartNode,
  type LlmModelConfigSummaryEditorDefinition,
  type ModelConfigSummaryField,
  deriveModelConfigSummary,
  resolveEffectiveLLMChatV2Data,
} from '@valerypopoff/rivet2-core';
import { css } from '@emotion/react';
import { useAtomValue } from 'jotai';
import TextField from '@atlaskit/textfield';
import Select from '@atlaskit/select';
import { type SharedEditorProps } from './SharedEditorProps';
import { projectState } from '../../state/savedGraphs';
import { getEditorModelConfig } from '../../utils/projectModelConfig';
import { useProjectNodeRegistry } from '../../hooks/useProjectNodeRegistry';

/**
 * Feature 009 — the model-config Summary Card. Renders the LLM Chat node's **resolved** effective
 * config (what actually runs) below the selectors, with inherited/overridden markers and inline
 * tweak, so a bound node stops contradicting itself. Pure-presentational over `node` + the project
 * modelConfig: it runs the resolver (the editor-render path proven in 008b/009) and the node-agnostic
 * `deriveModelConfigSummary`. Tweaks write the same `node.data` fields the detailed groups edit, so
 * the two views stay consistent by construction.
 */

const styles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--grey-darkish);
  border-radius: 6px;
  padding: 10px;
  margin-top: 4px;

  .summary-hint {
    color: var(--foreground-muted);
    font-size: var(--ui-font-size-sm);
    line-height: 1.4;
    margin: 0;
  }

  .summary-row {
    display: grid;
    grid-template-columns: 110px 1fr auto;
    align-items: center;
    gap: 8px;
  }

  .summary-label {
    color: var(--foreground-muted);
  }

  .summary-control {
    min-width: 0;
  }

  .summary-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary-marker {
    font-size: var(--ui-font-size-xs);
    padding: 1px 6px;
    border-radius: 10px;
    white-space: nowrap;
  }
  .summary-marker.overridden {
    color: var(--warning, #ca8a04);
    border: 1px solid var(--warning, #ca8a04);
  }
  .summary-marker.inherited {
    color: var(--foreground-muted);
  }

  .summary-revert {
    background: none;
    border: none;
    color: var(--primary, #4c9aff);
    cursor: pointer;
    font-size: var(--ui-font-size-xs);
    padding: 0;
  }
`;

export const ModelConfigSummaryCard: FC<
  SharedEditorProps & { editor: LlmModelConfigSummaryEditorDefinition<ChartNode> }
> = ({ node, onChange, isReadonly, isDisabled }) => {
  const project = useAtomValue(projectState);
  const projectNodeRegistry = useProjectNodeRegistry();
  const data = node.data as Record<string, unknown>;

  const hasSelector = Boolean(data.llmPresetId || data.llmProfileId || data.llmSkillId);
  if (!hasSelector) {
    return (
      <div css={styles}>
        <p className="summary-hint">
          No source selected — this node uses its own settings (below). Select a Preset / Profile / Skill above to bind a
          shared config; the resolved values then show here.
        </p>
      </div>
    );
  }

  let defaults: Record<string, unknown> = {};
  try {
    defaults = projectNodeRegistry.createDynamic(node.type).data as Record<string, unknown>;
  } catch {
    // Unknown/uncreatable type — leave defaults empty; markers then never flag (safe).
  }

  const modelConfig = getEditorModelConfig(project);
  const effective = resolveEffectiveLLMChatV2Data(
    modelConfig,
    {
      llmPresetId: data.llmPresetId as string | undefined,
      llmProfileId: data.llmProfileId as string | undefined,
      llmSkillId: data.llmSkillId as string | undefined,
    },
    node.data as never,
  );
  const hasConnectionSource = Boolean(data.llmPresetId || data.llmProfileId);
  const fields = deriveModelConfigSummary(effective, node.data as never, defaults as never, hasConnectionSource);

  const readonly = isReadonly || isDisabled;
  const setField = (dataKey: string, value: unknown) => onChange({ ...node, data: { ...data, [dataKey]: value } });

  return (
    <div css={styles}>
      {fields.map((field) => (
        <div className="summary-row" key={field.key}>
          <span className="summary-label">{field.label}</span>
          <div className="summary-control">
            <FieldControl field={field} readonly={readonly} onSet={setField} />
          </div>
          <Markers field={field} readonly={readonly} defaults={defaults} onSet={setField} />
        </div>
      ))}
    </div>
  );
};

const FieldControl: FC<{
  field: ModelConfigSummaryField;
  readonly: boolean;
  onSet: (dataKey: string, value: unknown) => void;
}> = ({ field, readonly, onSet }) => {
  if (!field.editable || !field.dataKey) {
    return <span className="summary-value">{field.value}</span>;
  }
  const dataKey = field.dataKey as string;

  if (field.control === 'number') {
    return (
      <TextField
        type="number"
        value={typeof field.rawValue === 'number' ? String(field.rawValue) : ''}
        isReadOnly={readonly}
        onChange={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          const parsed = Number(raw);
          onSet(dataKey, raw.trim() === '' || Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
    );
  }
  if (field.control === 'enum') {
    const options = field.options ?? [];
    const current = options.find((o) => o.value === String(field.rawValue ?? '')) ?? null;
    return (
      <Select
        isDisabled={readonly}
        options={options as { value: string; label: string }[]}
        value={current}
        onChange={(o) => onSet(dataKey, (o as { value: string } | null)?.value ?? '')}
      />
    );
  }
  // string
  return (
    <TextField
      value={(field.rawValue as string) ?? ''}
      isReadOnly={readonly}
      onChange={(e) => onSet(dataKey, (e.target as HTMLInputElement).value)}
    />
  );
};

const Markers: FC<{
  field: ModelConfigSummaryField;
  readonly: boolean;
  defaults: Record<string, unknown>;
  onSet: (dataKey: string, value: unknown) => void;
}> = ({ field, readonly, defaults, onSet }) => (
  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
    <span className={`summary-marker ${field.overridden ? 'overridden' : 'inherited'}`}>
      {field.overridden ? 'overridden' : 'inherited'}
    </span>
    {field.overridden && field.editable && field.dataKey && !readonly && (
      <button
        type="button"
        className="summary-revert"
        title="Revert to the inherited value"
        onClick={() => onSet(field.dataKey as string, defaults[field.dataKey as string])}
      >
        revert
      </button>
    )}
  </span>
);
