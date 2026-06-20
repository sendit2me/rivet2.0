import { type FC, type ReactNode, useState } from 'react';
import { css } from '@emotion/react';
import Button from '@atlaskit/button';
import { useAtom } from 'jotai';
import { nanoid } from 'nanoid/non-secure';
import { type LlmPreset, type LlmProfile, type LlmSkill, type ModelConfig } from '@valerypopoff/rivet2-core';
import { projectState } from '../../state/savedGraphs.js';
import { flushHybridStorageGroup } from '../../state/storage.js';
import { handleError } from '../../utils/errorHandling.js';
import { LlmProfileForm } from './LlmProfileForm.js';
import { LlmSkillForm } from './LlmSkillForm.js';
import { LlmPresetForm } from './LlmPresetForm.js';

const styles = css`
  display: flex;
  flex-direction: column;
  gap: 20px;

  .model-config-intro {
    margin: 0;
    color: var(--foreground-muted);
    font-size: var(--ui-font-size-sm);
    line-height: 1.4;
  }

  .model-config-axis-title {
    color: var(--foreground-muted);
    font-weight: var(--font-weight-semibold);
    margin-bottom: 6px;
  }

  .model-config-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 0 8px;
  }

  .model-config-empty {
    color: var(--foreground-muted);
    font-style: italic;
    margin: 0 0 8px;
  }

  .model-config-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--grey-darkish);
    border-radius: 6px;
    padding: 8px 10px;
  }

  .model-config-row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .model-config-row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-config-row-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
`;

/** Persist project edits to app-local storage immediately (the 'project' hybrid group is debounced). */
function persistProjectModelConfig(): void {
  void flushHybridStorageGroup('project').catch((error) => {
    handleError(error, 'Failed to persist project model config', { toastError: false });
  });
}

type AxisKey = keyof Pick<ModelConfig, 'profiles' | 'skills' | 'presets'>;
type Editing = { axis: AxisKey; id: string } | null;

/**
 * Project-scoped authoring of the model-config (Feature 005 Phase B): CRUD over
 * `Project.modelConfig` profiles / skills / presets, so what you author travels with the project and
 * runs headless (006). This component owns the store (`projectState`) read/write and the flush; the
 * per-entity edit forms are presentational and store-decoupled (reusable by the deferred global
 * library). The Phase A node selectors read this same `Project.modelConfig` via `getEditorModelConfig`.
 */
export const ProjectModelConfigConfiguration: FC = () => {
  const [project, setProject] = useAtom(projectState);
  const [editing, setEditing] = useState<Editing>(null);

  const profiles = project.modelConfig?.profiles ?? [];
  const skills = project.modelConfig?.skills ?? [];
  const presets = project.modelConfig?.presets ?? [];

  const writeAxis = <K extends AxisKey>(axis: K, next: NonNullable<ModelConfig[K]>) => {
    setProject((prev) => ({
      ...prev,
      modelConfig: { ...prev.modelConfig, [axis]: next },
    }));
    persistProjectModelConfig();
  };

  const isEditing = (axis: AxisKey, id: string) => editing?.axis === axis && editing.id === id;
  const toggleEditing = (axis: AxisKey, id: string) =>
    setEditing((cur) => (cur?.axis === axis && cur.id === id ? null : { axis, id }));

  // --- Profiles ---
  const addProfile = () => {
    const entity: LlmProfile = { id: nanoid(), name: 'New profile', provider: 'openai' };
    writeAxis('profiles', [...profiles, entity]);
    setEditing({ axis: 'profiles', id: entity.id });
  };
  const updateProfile = (next: LlmProfile) =>
    writeAxis('profiles', profiles.map((p) => (p.id === next.id ? next : p)));
  const removeProfile = (id: string) => {
    writeAxis('profiles', profiles.filter((p) => p.id !== id));
    if (isEditing('profiles', id)) setEditing(null);
  };

  // --- Skills ---
  const addSkill = () => {
    const entity: LlmSkill = { id: nanoid(), name: 'New skill' };
    writeAxis('skills', [...skills, entity]);
    setEditing({ axis: 'skills', id: entity.id });
  };
  const updateSkill = (next: LlmSkill) => writeAxis('skills', skills.map((s) => (s.id === next.id ? next : s)));
  const removeSkill = (id: string) => {
    writeAxis('skills', skills.filter((s) => s.id !== id));
    if (isEditing('skills', id)) setEditing(null);
  };

  // --- Presets ---
  const addPreset = () => {
    const entity: LlmPreset = { id: nanoid(), name: 'New preset', profileId: '' };
    writeAxis('presets', [...presets, entity]);
    setEditing({ axis: 'presets', id: entity.id });
  };
  const updatePreset = (next: LlmPreset) => writeAxis('presets', presets.map((p) => (p.id === next.id ? next : p)));
  const removePreset = (id: string) => {
    writeAxis('presets', presets.filter((p) => p.id !== id));
    if (isEditing('presets', id)) setEditing(null);
  };

  return (
    <div css={styles}>
      <p className="model-config-intro">
        Define the LLM Profiles (connections), Skills (behavior) and Presets (one-pick Profile + Skill bundles) for
        this project. They are saved in the project file, so they travel with it and run without a browser (headless,
        published or scheduled). Select them per node in the Chat node editor.
      </p>

      <section>
        <div className="model-config-axis-title">Presets</div>
        {presets.length === 0 ? (
          <p className="model-config-empty">No presets defined.</p>
        ) : (
          <div className="model-config-list">
            {presets.map((preset) => (
              <EntityRow
                key={preset.id}
                name={preset.name}
                isEditing={isEditing('presets', preset.id)}
                onToggleEdit={() => toggleEditing('presets', preset.id)}
                onRemove={() => removePreset(preset.id)}
              >
                <LlmPresetForm value={preset} onChange={updatePreset} profiles={profiles} skills={skills} />
              </EntityRow>
            ))}
          </div>
        )}
        <Button appearance="default" onClick={addPreset}>
          Add Preset
        </Button>
      </section>

      <section>
        <div className="model-config-axis-title">Profiles</div>
        {profiles.length === 0 ? (
          <p className="model-config-empty">No profiles defined.</p>
        ) : (
          <div className="model-config-list">
            {profiles.map((profile) => (
              <EntityRow
                key={profile.id}
                name={profile.name}
                isEditing={isEditing('profiles', profile.id)}
                onToggleEdit={() => toggleEditing('profiles', profile.id)}
                onRemove={() => removeProfile(profile.id)}
              >
                <LlmProfileForm value={profile} onChange={updateProfile} profiles={profiles} />
              </EntityRow>
            ))}
          </div>
        )}
        <Button appearance="default" onClick={addProfile}>
          Add Profile
        </Button>
      </section>

      <section>
        <div className="model-config-axis-title">Skills</div>
        {skills.length === 0 ? (
          <p className="model-config-empty">No skills defined.</p>
        ) : (
          <div className="model-config-list">
            {skills.map((skill) => (
              <EntityRow
                key={skill.id}
                name={skill.name}
                isEditing={isEditing('skills', skill.id)}
                onToggleEdit={() => toggleEditing('skills', skill.id)}
                onRemove={() => removeSkill(skill.id)}
              >
                <LlmSkillForm value={skill} onChange={updateSkill} skills={skills} />
              </EntityRow>
            ))}
          </div>
        )}
        <Button appearance="default" onClick={addSkill}>
          Add Skill
        </Button>
      </section>
    </div>
  );
};

const EntityRow: FC<{
  name?: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onRemove: () => void;
  children: ReactNode;
}> = ({ name, isEditing, onToggleEdit, onRemove, children }) => (
  <div className="model-config-row">
    <div className="model-config-row-header">
      <span className="model-config-row-name">{name?.trim() ? name : '(Unnamed)'}</span>
      <div className="model-config-row-actions">
        <Button appearance="link" onClick={onToggleEdit}>
          {isEditing ? 'Done' : 'Edit'}
        </Button>
        <Button appearance="link" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
    {isEditing && children}
  </div>
);
