import type { Opaque } from 'type-fest';
import { type GraphId, type NodeGraph } from './NodeGraph.js';
import { type PluginLoadSpec } from './PluginLoadSpec.js';
import type { MCP } from '../integrations/mcp/MCPProvider.js';
import type { ModelConfig } from './Settings.js';

export type ProjectId = Opaque<string, 'ProjectId'>;

export type DataId = Opaque<string, 'DataId'>;

export type Project = {
  metadata: ProjectMetadata;

  plugins?: PluginLoadSpec[];

  graphs: Record<GraphId, NodeGraph>;

  data?: Record<DataId, string>;

  /** References to other projects. */
  references?: ProjectReference[];

  /**
   * The model-configuration (Profiles + Skills + Presets) embedded in this project so it travels
   * with the saved `.rivet-project` and a headless/published/triggered run can resolve models
   * without a global `Settings`. Merged over the global library by id (project wins) at runtime.
   * Optional and additive: absent/empty means the project carries no model-config and behaves
   * exactly as base rivet2.0. See {@link ModelConfig}.
   */
  modelConfig?: ModelConfig;
};

export type ProjectMetadata = {
  id: ProjectId;
  title: string;
  description: string;
  mainGraphId?: GraphId;
  path?: string;

  mcpServer?: MCP.Config;
};

/** A reference to another project file. Project references cannot be cyclic. */
export type ProjectReference = {
  /** The ID of the project being referenced. */
  id: ProjectId;

  /** Paths to use to attempt to resolve the reference. */
  hintPaths?: string[];

  /** A human-readable title for the project. */
  title?: string;
};
