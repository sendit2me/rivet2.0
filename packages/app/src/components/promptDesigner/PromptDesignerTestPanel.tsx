import { type FC } from 'react';
import { Field } from '@atlaskit/form';
import TextField from '@atlaskit/textfield';
import Button from '@atlaskit/button';
import { type NodeTestGroup } from '@ironclad/rivet-core';
import { PromptDesignerTestGroup } from './PromptDesignerComponents';
import type { PromptDesignerState } from '../../state/promptDesigner';
import type { SetStateAction } from 'jotai';
import { wrapAsync } from '../../utils/errorHandling';

export type PromptDesignerTestPanelProps = {
  testGroups: NodeTestGroup[];
  canEditTestGroups: boolean;
  promptDesigner: PromptDesignerState;
  setPromptDesigner: (update: SetStateAction<PromptDesignerState>) => void;
  onTestGroupChanged: (newTestGroup: NodeTestGroup, index: number) => void;
  onDeleteTestGroup: (index: number) => void;
  onAddTestGroup: () => void;
  onStartTestGroup: (testGroup: NodeTestGroup) => Promise<void>;
  inProgress: boolean;
  onCancel: () => void;
};

export const PromptDesignerTestPanel: FC<PromptDesignerTestPanelProps> = ({
  testGroups,
  canEditTestGroups,
  promptDesigner,
  setPromptDesigner,
  onTestGroupChanged,
  onDeleteTestGroup,
  onAddTestGroup,
  onStartTestGroup,
  inProgress,
  onCancel,
}) => {
  return (
    <div className="panel">
      <div className="test-config-area">
        <div className="test-config">
          <Field name="test-samples" label="Samples">
            {({ fieldProps }) => (
              <TextField
                {...fieldProps}
                placeholder="Enter number of samples"
                type="number"
                min={1}
                max={100}
                value={promptDesigner.samples}
                onChange={(e) =>
                  setPromptDesigner((s) => ({
                    ...s,
                    samples: (e.target as HTMLInputElement).valueAsNumber,
                  }))
                }
              />
            )}
          </Field>
        </div>
        <div className="test-list">
          {!canEditTestGroups && (
            <div className="test-empty-state">
              Test groups are saved on a Chat node. Open Prompt Designer from a Chat node output to add and edit test
              groups for that node.
            </div>
          )}
          {testGroups.map((testGroup, index) => (
            <PromptDesignerTestGroup
              testGroup={testGroup}
              key={`test-${index}`}
              onChange={(newTestGroup) => onTestGroupChanged(newTestGroup, index)}
              onDelete={() => onDeleteTestGroup(index)}
              onStart={wrapAsync(onStartTestGroup, 'Run prompt designer test group')}
              inProgress={inProgress}
              onCancel={onCancel}
            />
          ))}
          <Button className="add-test" appearance="subtle-link" onClick={onAddTestGroup} isDisabled={!canEditTestGroups}>
            Add Test Group
          </Button>
        </div>
      </div>
    </div>
  );
};
