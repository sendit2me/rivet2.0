import { type FC } from 'react';
import { css } from '@emotion/react';
import Button from '@atlaskit/button';
import {
  type ChartNode,
  type Outputs,
  type PortId,
  type ReadDirectoryNode,
  expectType,
  type DataValue,
} from '@valerypopoff/rivet2-core';
import { type NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';
import { isPathBasedIOProvider } from '../../io/IOProvider.js';
import { type InputsOrOutputsWithRefs } from '../../state/dataFlow';
import { wrapAsync } from '../../utils/errorHandling';
import { useIOProvider } from '../../providers/ProvidersContext.js';
import { ScalableToggle } from '../ScalableToggle.js';

const container = css`
  font-family: var(--font-family);
  color: var(--foreground);
  background-color: var(--grey-darker);

  display: grid;
  grid-template-columns: auto 1fr auto;
  row-gap: 16px;
  column-gap: 32px;
  align-items: center;
  grid-auto-rows: 40px;

  .row {
    display: contents;
  }

  .label {
    font-weight: 500;
    color: var(--foreground);
  }

  .input {
    padding: 6px 12px;
    background-color: var(--grey-darkish);
    border: 1px solid var(--grey);
    border-radius: 8px;
    corner-shape: squircle;
    @supports not (corner-shape: squircle) {
      border-radius: 4px;
    }
    color: var(--foreground);
    outline: none;
    transition: border-color 0.3s;

    &:hover {
      border-color: var(--primary);
    }
  }

  .checkbox-input {
    margin-left: 8px;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }
  }
`;

export type ReadDirectoryNodeEditorProps = {
  node: ReadDirectoryNode;
  onChange?: (node: ChartNode<'readDirectory', ReadDirectoryNode['data']>) => void;
};

export const ReadDirectoryNodeEditor: FC<ReadDirectoryNodeEditorProps> = ({ node, onChange }) => {
  const ioProvider = useIOProvider();
  const handleBrowseClick = wrapAsync(
    async () => {
      if (!isPathBasedIOProvider(ioProvider)) return;
      const directory = await ioProvider.openDirectory();
      if (directory) {
        onChange?.({
          ...node,
          data: { ...node.data, path: directory as string },
        });
      }
    },
    'Open read directory picker',
  );

  return (
    <div css={container}>
      <div className="row">
        <label className="label" htmlFor="baseDirectory">
          Pick Directory
        </label>
        <div>
          <Button onClick={handleBrowseClick}>Browse...</Button>
          <div>Current Directory: {node.data.path}</div>
        </div>
        <ScalableToggle
          id="usePathInput"
          isChecked={node.data.usePathInput}
          onChange={() =>
            onChange?.({
              ...node,
              data: { ...node.data, usePathInput: !node.data.usePathInput },
            })
          }
        />
      </div>
      <div className="row">
        <label className="label" htmlFor="recursive">
          Recursive
        </label>
        <ScalableToggle
          id="recursive"
          isChecked={node.data.recursive}
          onChange={(e) => onChange?.({ ...node, data: { ...node.data, recursive: e.target.checked } })}
        />
        <ScalableToggle
          id="useRecursiveInput"
          isChecked={node.data.useRecursiveInput}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, useRecursiveInput: e.target.checked },
            })
          }
        />
      </div>
      <div className="row">
        <label className="label" htmlFor="includeDirectories">
          Include Directories
        </label>
        <ScalableToggle
          id="includeDirectories"
          isChecked={node.data.includeDirectories}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, includeDirectories: e.target.checked },
            })
          }
        />
        <ScalableToggle
          id="useIncludeDirectoriesInput"
          isChecked={node.data.useIncludeDirectoriesInput}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, useIncludeDirectoriesInput: e.target.checked },
            })
          }
        />
      </div>
      <div className="row">
        <label className="label" htmlFor="relative">
          Relative
        </label>
        <ScalableToggle
          id="relative"
          isChecked={node.data.relative}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, relative: e.target.checked },
            })
          }
        />
        <ScalableToggle
          id="useRelativeInput"
          isChecked={node.data.useRelativeInput}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, useRelativeInput: e.target.checked },
            })
          }
        />
      </div>
      <div className="row">
        <label className="label" htmlFor="filterGlobs">
          Filter Glob
        </label>
        <input
          id="filterGlobs"
          className="input"
          type="text"
          value={node.data.filterGlobs[0]}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, filterGlobs: [e.target.value] },
            })
          }
        />
        <ScalableToggle
          id="useFilterGlobsInput"
          isChecked={node.data.useFilterGlobsInput}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, useFilterGlobsInput: e.target.checked },
            })
          }
        />
      </div>
      <div className="row">
        <label className="label" htmlFor="ignores">
          Excludes (comma separated)
        </label>
        <input
          id="ignores"
          className="input"
          type="text"
          value={node.data.ignores?.join(',') ?? ''}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, ignores: e.target.value.split(',').map((s) => s.trim()) },
            })
          }
        />
        <ScalableToggle
          id="useIgnoresInput"
          isChecked={node.data.useIgnoresInput}
          onChange={(e) =>
            onChange?.({
              ...node,
              data: { ...node.data, useIgnoresInput: e.target.checked },
            })
          }
        />
      </div>
    </div>
  );
};

export const readDirectoryNodeDescriptor: NodeComponentDescriptor<'readDirectory'> = {
  Editor: ReadDirectoryNodeEditor,
};
