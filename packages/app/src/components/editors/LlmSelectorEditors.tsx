import {
  type ChartNode,
  type LlmPreset,
  type LlmPresetSelectorEditorDefinition,
  type LlmProfile,
  type LlmProfileSelectorEditorDefinition,
  type LlmSkill,
  type LlmSkillSelectorEditorDefinition,
  getSkillKind,
} from '@valerypopoff/rivet2-core';
import { type FC, useState } from 'react';
import Button from '@atlaskit/button';
import { nanoid } from 'nanoid/non-secure';
import { LlmEntityAuthoringModal, type ModelConfigAxis } from './LlmEntityAuthoringModal.js';
import { LlmSelectorField } from './LlmSelectorField.js';
import { type SharedEditorProps } from './SharedEditorProps';
import { useAtomValue } from 'jotai';
import { projectState } from '../../state/savedGraphs';
import { getHelperMessage } from './editorUtils';
import { getEditorModelConfig } from '../../utils/projectModelConfig';


/** A Skill with no `kind` is the chat signature; the chat node's selectors filter to this. */
const DEFAULT_SKILL_KIND = 'text-to-text';

/**
 * A selector is input-driven when its "drive from input" toggle (useInputToggleDataKey) is on — then
 * the value comes from the node's input port, so the dropdown is display-only (disabled). The plug
 * toggle itself is rendered by DefaultNodeEditorField.
 */
function selectorInputDriven(
  editor: { useInputToggleDataKey?: string },
  data: Record<string, unknown>,
): boolean {
  return editor.useInputToggleDataKey != null && Boolean(data[editor.useInputToggleDataKey]);
}

/**
 * A selector + inline authoring affordances (R3): the dropdown plus "New" / "Edit" that mount the
 * shared entity form in a draft modal. "New" is always available (add a project entity, then auto-select
 * it on save). "Edit" targets the selected entity and is disabled when the selector is input-driven
 * (no static selection) or nothing is selected. Inline-edit modifies the SHARED project entity (R2).
 */
const LlmSelectorWithAuthoring: FC<{
  axis: ModelConfigAxis;
  items: ReadonlyArray<LlmProfile | LlmSkill | LlmPreset>;
  value: string | undefined;
  inputDriven: boolean;
  isReadonly: boolean;
  name: string;
  label: string;
  placeholder: string;
  helperMessage?: string;
  seed: () => LlmProfile | LlmSkill | LlmPreset;
  onSelect: (id: string) => void;
}> = ({ axis, items, value, inputDriven, isReadonly, name, label, placeholder, helperMessage, seed, onSelect }) => {
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; initial: LlmProfile | LlmSkill | LlmPreset } | null>(null);
  const selected = items.find((item) => item.id === value);
  const canEdit = !inputDriven && !isReadonly && selected != null;

  return (
    <>
      <LlmSelectorField
        items={items}
        value={value}
        name={name}
        label={label}
        isReadonly={isReadonly || inputDriven}
        helperMessage={helperMessage}
        placeholder={placeholder}
        onChange={onSelect}
      />
      <div className="llm-selector-authoring-actions">
        <Button appearance="link" spacing="compact" isDisabled={isReadonly} onClick={() => setModal({ mode: 'add', initial: seed() })}>
          + New
        </Button>
        <Button appearance="link" spacing="compact" isDisabled={!canEdit} onClick={() => selected && setModal({ mode: 'edit', initial: selected })}>
          Edit
        </Button>
      </div>
      {modal && (
        <LlmEntityAuthoringModal
          axis={axis}
          mode={modal.mode}
          initial={modal.initial}
          onSaved={(entity) => {
            if (modal.mode === 'add') onSelect(entity.id); // auto-select the newly created entity
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
};

export const DefaultLlmProfileSelectorEditor: FC<
  SharedEditorProps & { editor: LlmProfileSelectorEditorDefinition<ChartNode> }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const project = useAtomValue(projectState);
  return (
    <LlmSelectorWithAuthoring
      axis="profiles"
      items={getEditorModelConfig(project).profiles ?? []}
      value={data[editor.dataKey] as string | undefined}
      inputDriven={selectorInputDriven(editor, data)}
      isReadonly={isReadonly || isDisabled}
      name={editor.dataKey}
      label={editor.label}
      placeholder="Select Profile..."
      helperMessage={getHelperMessage(editor, node.data)}
      seed={() => ({ id: nanoid(), name: 'New profile', provider: 'openai' })}
      onSelect={(selected) => onChange({ ...node, data: { ...data, [editor.dataKey]: selected } })}
    />
  );
};

export const DefaultLlmSkillSelectorEditor: FC<
  SharedEditorProps & { editor: LlmSkillSelectorEditorDefinition<ChartNode> }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const project = useAtomValue(projectState);

  // Kind-filter: a node's Skill picker shows only Skills of the node's signature (absent kind = text-to-text).
  const wantKind = editor.skillKind ?? DEFAULT_SKILL_KIND;
  const skills = (getEditorModelConfig(project).skills ?? []).filter((s) => getSkillKind(s) === wantKind);

  return (
    <LlmSelectorWithAuthoring
      axis="skills"
      items={skills}
      value={data[editor.dataKey] as string | undefined}
      inputDriven={selectorInputDriven(editor, data)}
      isReadonly={isReadonly || isDisabled}
      name={editor.dataKey}
      label={editor.label}
      placeholder="Select Skill..."
      helperMessage={getHelperMessage(editor, node.data)}
      // Kind-respecting add (R1): a new Skill from a chat node's selector mints a text-to-text skill,
      // so the kind-filter shows it immediately and it auto-selects on save.
      seed={() => ({ id: nanoid(), name: 'New skill', kind: wantKind }) as LlmSkill}
      onSelect={(selected) => onChange({ ...node, data: { ...data, [editor.dataKey]: selected } })}
    />
  );
};

export const DefaultLlmPresetSelectorEditor: FC<
  SharedEditorProps & { editor: LlmPresetSelectorEditorDefinition<ChartNode> }
> = ({ node, isReadonly, isDisabled, onChange, editor }) => {
  const data = node.data as Record<string, unknown>;
  const project = useAtomValue(projectState);

  // Transitive kind-filter: a Preset's kind = its Skill's kind. Show only Presets whose Skill matches
  // the node's signature (a Preset with no Skill is connection-only → always shown).
  const cfg = getEditorModelConfig(project);
  const wantKind = editor.skillKind ?? DEFAULT_SKILL_KIND;
  const skillKindById = new Map((cfg.skills ?? []).map((s) => [s.id, getSkillKind(s)]));
  const presets = (cfg.presets ?? []).filter(
    (p) => !p.skillId || (skillKindById.get(p.skillId) ?? DEFAULT_SKILL_KIND) === wantKind,
  );

  return (
    <LlmSelectorWithAuthoring
      axis="presets"
      items={presets}
      value={data[editor.dataKey] as string | undefined}
      inputDriven={selectorInputDriven(editor, data)}
      isReadonly={isReadonly || isDisabled}
      name={editor.dataKey}
      label={editor.label}
      placeholder="Select Preset..."
      helperMessage={getHelperMessage(editor, node.data)}
      seed={() => ({ id: nanoid(), name: 'New preset', profileId: '' })}
      onSelect={(selected) => onChange({ ...node, data: { ...data, [editor.dataKey]: selected } })}
    />
  );
};
