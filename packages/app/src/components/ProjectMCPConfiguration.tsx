import { useToggle } from 'ahooks';
import { Field } from '@atlaskit/form';
import Button from '@atlaskit/button';
import Modal, { ModalTransition, ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { css } from '@emotion/react';
import { type MCP } from '@ironclad/rivet-core';
import { useAtom } from 'jotai';
import { Suspense, useState, type FC } from 'react';
import { toast } from 'react-toastify';
import { projectMetadataState } from '../state/savedGraphs';
import { handleError } from '../utils/errorHandling.js';
import { AppModalHeader } from './AppModalHeader';
import { LazyCodeEditor } from './LazyComponents';

export const ProjectMCPConfiguration: FC = () => {
  const [projectMetadata, setProjectMetadata] = useAtom(projectMetadataState);

  const mcpConfig = projectMetadata.mcpServer ?? {
    mcpServers: {
      serverName: {
        command: '',
        args: [''],
      },
    },
  } as unknown as MCP.Config;

  const [isModalOpen, toggleModalOpen] = useToggle(false);

  const onClose = () => {
    toggleModalOpen.setLeft();
  };

  const onSave = (newConfig: string) => {
    try {
      const cleanQuoteConfig = newConfig
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"');
      const config: MCP.Config = JSON.parse(cleanQuoteConfig);
      setProjectMetadata({ ...projectMetadata, mcpServer: config });
      toast.success('MCP Configuration saved successfully');
      onClose();
    } catch (err) {
      handleError(err, 'Failed to save MCP configuration', {
        metadata: {
          configLength: newConfig.length,
          projectId: projectMetadata.id,
        },
        toastError: false,
      });
      toast.error('Failed to save MCP Configuration: Please make sure your configuration is correctly JSON formatted.');
    }
  };

  return (
    <Field name="mcp-config" label="MCP Configuration">
      {() => (
        <>
          <div className="mcp-config-action">
            <Button appearance="default" onClick={toggleModalOpen.setRight}>
              Edit MCP Configuration
            </Button>
          </div>

          <ModalTransition>
            {isModalOpen && (
              <MCPConfigModal
                initialConfig={mcpConfig}
                onSave={onSave}
                onClose={onClose}
              />
            )}
          </ModalTransition>
        </>
      )}
    </Field>
  );
};

export const MCPConfigModal: FC<{
  initialConfig?: MCP.Config;
  onSave: (config: string) => void;
  onClose: () => void;
}> = ({ initialConfig, onSave, onClose }) => {
  const [config, setConfig] = useState(JSON.stringify(initialConfig, null, 2) ?? '');

  const handleSave = () => {
    onSave(config);
  };

  return (
    <Modal onClose={onClose}>
      <AppModalHeader title="Edit MCP Configuration" />
      <ModalBody>
        <div
          css={css`
            .editor {
              height: 400px;
              display: flex;
              resize: vertical;

              > div {
                width: 100%;
              }
            }
          `}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <p>
              To use local MCP servers with your Rivet project, add the MCP configuration in the field below.
              The configuration must be a JSON parsable string.
              MCP Configuration mentioned here will be saved with the Rivet project file.
            </p>

            <Field name="config" label="Configuration (JSON)">
              {() => (
                <div className="editor">
                  <Suspense fallback={<div />}>
                    <LazyCodeEditor text={config} onChange={(v) => setConfig(v)} autoFocus />
                  </Suspense>
                </div>
              )}
            </Field>
          </form>
        </div>
      </ModalBody>
      <ModalFooter>
        <div
          css={css`
            display: flex;
            flex-direction: row;
            justify-content: flex-end;
            gap: 8px;
          `}
        >
          <Button appearance="default" onClick={onClose}>
            Cancel
          </Button>
          <Button appearance="primary" onClick={handleSave}>
            Save
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
};
