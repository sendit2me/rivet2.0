import { HelperMessage, Field } from '@atlaskit/form';
import { type FC, useLayoutEffect, useRef, useState } from 'react';
import TextField from '@atlaskit/textfield';
import Button from '@atlaskit/button';
import Modal, { ModalTransition, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '@atlaskit/modal-dialog';
import { type PackagePluginInfo } from '../../plugins.js';

export const PluginLogModal: FC<{
  isOpen: boolean;
  log: string;
  onClose: () => void;
}> = ({ isOpen, log, onClose }) => {
  const logPreRef = useRef<HTMLPreElement>(null);

  useLayoutEffect(() => {
    if (logPreRef.current) {
      logPreRef.current.scrollTop = logPreRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <ModalTransition>
      {isOpen && (
        <Modal width="large" onClose={onClose}>
          <ModalHeader>
            <ModalTitle>Installing...</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="plugin-log">
              <pre style={{ whiteSpace: 'pre-wrap' }} ref={logPreRef}>
                {log}
              </pre>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Close</Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
};

export const AddNpmPluginModal: FC<{
  isOpen: boolean;
  onClose: () => void;
  onAddPlugin: (plugin: PackagePluginInfo) => void;
  pluginStoreDirectory: string;
}> = ({ isOpen, onClose, onAddPlugin, pluginStoreDirectory }) => {
  const [pluginName, setPluginName] = useState('');
  const [pluginVersion, setPluginVersion] = useState('');

  const addPlugin = () => {
    const version = pluginVersion.trim() || 'latest';
    onAddPlugin({
      type: 'package',
      id: `${pluginName}@${version}`,
      package: pluginName,
      tag: version,
      author: '',
      name: pluginName,
      description: '',
    });
  };

  return (
    <ModalTransition>
      {isOpen && (
        <Modal width="large" onClose={onClose}>
          <ModalHeader>
            <ModalTitle>Add NPM Plugin</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="add-npm-plugin">
              <div className="inputs">
                <Field name="packageName" label="Package Name">
                  {({ fieldProps }) => (
                    <TextField
                      {...fieldProps}
                      placeholder="Package Name"
                      value={pluginName}
                      onChange={(event) => setPluginName((event.target as HTMLInputElement).value)}
                    />
                  )}
                </Field>
                <Field name="packageVersion" label="Version">
                  {({ fieldProps }) => (
                    <TextField
                      {...fieldProps}
                      placeholder="Latest"
                      value={pluginVersion}
                      onChange={(event) => setPluginVersion((event.target as HTMLInputElement).value)}
                    />
                  )}
                </Field>
              </div>
              <HelperMessage>
                Plugins are stored in: <code>{pluginStoreDirectory}</code>
              </HelperMessage>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button appearance="primary" onClick={addPlugin}>
              Add
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
};
