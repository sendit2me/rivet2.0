import Button from '@atlaskit/button';
import CrossIcon from '@atlaskit/icon/glyph/cross';
import Modal, { ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition } from '@atlaskit/modal-dialog';
import { css } from '@emotion/react';
import { useAtom } from 'jotai';
import type { FC } from 'react';
import { useDeleteNodesCommand } from '../commands/deleteNodeCommand';
import { deleteGraphInputConfirmState } from '../state/ui';

const modalBody = css`
  color: var(--foreground);
  font-size: 13px;

  p {
    margin: 0 0 12px;
  }

  ul {
    max-height: 180px;
    margin: 8px 0 0;
    padding-left: 18px;
    overflow: auto;
  }

  li + li {
    margin-top: 4px;
  }
`;

function getCallerTypeLabel(callerType: 'subGraph' | 'callGraph') {
  return callerType === 'callGraph' ? 'Call Graph' : 'Subgraph';
}

function formatGraphInputUsageCallerLabel({
  callerNodeTitle,
  callerType,
}: {
  callerNodeTitle: string;
  callerType: 'subGraph' | 'callGraph';
}) {
  const callerTypeLabel = getCallerTypeLabel(callerType);
  const callerTitle = callerNodeTitle.trim() || callerTypeLabel;

  return callerTitle === callerTypeLabel ? callerTitle : `${callerTitle} (${callerTypeLabel})`;
}

export const DeleteGraphInputConfirmModalRenderer: FC = () => {
  const [confirmState, setConfirmState] = useAtom(deleteGraphInputConfirmState);
  const deleteNodes = useDeleteNodesCommand();

  const close = () => setConfirmState(null);

  const confirmDelete = () => {
    if (!confirmState) {
      return;
    }

    const { nodeIds } = confirmState;
    close();
    deleteNodes({ nodeIds, skipGraphInputUsageConfirm: true });
  };

  const visibleUsages = confirmState?.usages.slice(0, 8) ?? [];
  const hiddenUsageCount = (confirmState?.usages.length ?? 0) - visibleUsages.length;

  return (
    <ModalTransition>
      {confirmState && (
        <Modal autoFocus={false} onClose={close} width="small">
          <ModalHeader>
            <ModalTitle>Delete Graph Input?</ModalTitle>
            <Button appearance="link" onClick={close}>
              <CrossIcon label="Close Modal" primaryColor="currentColor" />
            </Button>
          </ModalHeader>
          <ModalBody>
            <div css={modalBody}>
              <p>
                This input is used through Subgraph or Call Graph nodes. Deleting this input will break the connections.
              </p>
              <ul>
                {visibleUsages.map((usage) => (
                  <li key={`${usage.graphId}:${usage.callerType}:${usage.callerNodeId}:${usage.inputId}`}>
                    {usage.graphName} / {formatGraphInputUsageCallerLabel(usage)} / {usage.inputId}
                  </li>
                ))}
              </ul>
              {hiddenUsageCount > 0 && <p>And {hiddenUsageCount} more input usages.</p>}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={close}>
              Cancel
            </Button>
            <Button appearance="danger" onClick={confirmDelete}>
              Delete Input
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
};
