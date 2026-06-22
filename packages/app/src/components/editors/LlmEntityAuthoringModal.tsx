import { type FC, useState } from 'react';
import { css } from '@emotion/react';
import Modal, { ModalBody, ModalFooter, ModalTransition } from '@atlaskit/modal-dialog';
import Button from '@atlaskit/button';
import { type LlmPreset, type LlmProfile, type LlmSkill } from '@valerypopoff/rivet2-core';
import { AppModalHeader } from '../AppModalHeader.js';
import { useModelConfigAuthoring } from '../../hooks/useModelConfigAuthoring.js';
import { LlmProfileForm } from '../modelConfig/LlmProfileForm.js';
import { LlmSkillForm } from '../modelConfig/LlmSkillForm.js';
import { LlmPresetForm } from '../modelConfig/LlmPresetForm.js';

export type ModelConfigAxis = 'profiles' | 'skills' | 'presets';

const AXIS_LABEL: Record<ModelConfigAxis, string> = { profiles: 'Profile', skills: 'Skill', presets: 'Preset' };

const sharedNoteStyles = css`
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--warning-subtle, rgba(226, 178, 3, 0.12));
  color: var(--foreground-muted);
  font-size: var(--ui-font-size-sm);
`;

/**
 * Inline node-editor authoring (R3). Mounts the SAME presentational entity form (no second authoring
 * surface) in a draft-state modal launched from a node's selector: edit a draft, **Save** commits via
 * the shared `useModelConfigAuthoring` path, **Cancel** discards. Edit acts on the **shared** project
 * entity (R2 — no per-node state), stated explicitly. Add is seeded by the caller (incl. the selector's
 * `kind`, R1); `onSaved` lets the caller auto-select the new id on add.
 */
export const LlmEntityAuthoringModal: FC<{
  axis: ModelConfigAxis;
  mode: 'add' | 'edit';
  /** Seed (a fresh entity for add) or the existing entity (for edit). */
  initial: LlmProfile | LlmSkill | LlmPreset;
  onSaved: (entity: LlmProfile | LlmSkill | LlmPreset) => void;
  onClose: () => void;
}> = ({ axis, mode, initial, onSaved, onClose }) => {
  const auth = useModelConfigAuthoring();
  const [draft, setDraft] = useState<LlmProfile | LlmSkill | LlmPreset>(initial);

  const save = () => {
    if (axis === 'profiles') {
      auth.upsertProfile(draft as LlmProfile);
    } else if (axis === 'skills') {
      auth.upsertSkill(draft as LlmSkill);
    } else {
      auth.upsertPreset(draft as LlmPreset);
    }
    onSaved(draft);
    onClose();
  };

  return (
    <ModalTransition>
      <Modal autoFocus={false} onClose={onClose} width="medium">
        <AppModalHeader
          title={`${mode === 'add' ? 'New' : 'Edit'} ${AXIS_LABEL[axis]}`}
          onClose={onClose}
        />
        <ModalBody>
          {mode === 'edit' && (
            <p css={sharedNoteStyles}>
              Editing the shared {AXIS_LABEL[axis]} “{draft.name}” — changes affect every node bound to it.
            </p>
          )}
          {axis === 'profiles' && (
            <LlmProfileForm value={draft as LlmProfile} onChange={(v) => setDraft(v)} profiles={auth.profiles} />
          )}
          {axis === 'skills' && <LlmSkillForm value={draft as LlmSkill} onChange={(v) => setDraft(v)} skills={auth.skills} />}
          {axis === 'presets' && (
            <LlmPresetForm
              value={draft as LlmPreset}
              onChange={(v) => setDraft(v)}
              profiles={auth.profiles}
              skills={auth.skills}
            />
          )}
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button appearance="primary" onClick={save}>
            Save
          </Button>
        </ModalFooter>
      </Modal>
    </ModalTransition>
  );
};
