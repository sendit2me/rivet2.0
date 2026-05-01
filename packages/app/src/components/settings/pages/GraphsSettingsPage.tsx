import { Field } from '@atlaskit/form';
import { useAtom } from 'jotai';
import { type FC } from 'react';
import { showGraphReferenceIndicatorsState, showUnreachableGraphTagsState } from '../../../state/ui.js';
import { LabeledToggle } from '../../LabeledToggle.js';
import { fields } from '../settingsPageStyles.js';

export const GraphsSettingsPage: FC = () => {
  const [showUnreachableGraphTags, setShowUnreachableGraphTags] = useAtom(showUnreachableGraphTagsState);
  const [showGraphReferenceIndicators, setShowGraphReferenceIndicators] = useAtom(showGraphReferenceIndicatorsState);

  return (
    <div css={fields}>
      <Field name="show-unreachable-graph-tags">
        {() => (
          <LabeledToggle
            id="show-unreachable-graph-tags"
            isChecked={showUnreachableGraphTags}
            onChange={setShowUnreachableGraphTags}
            label="Show unreachable graph tags"
            helperMessage="Marks graphs that are not reachable from the project's Main Graph."
            className="settings-toggle-field"
          />
        )}
      </Field>
      <Field name="show-graph-reference-indicators">
        {() => (
          <LabeledToggle
            id="show-graph-reference-indicators"
            isChecked={showGraphReferenceIndicators}
            onChange={setShowGraphReferenceIndicators}
            label="Show graph reference indicators"
            helperMessage="Shows which graphs directly reference the currently open graph."
            className="settings-toggle-field"
          />
        )}
      </Field>
    </div>
  );
};
