import type * as monaco from 'monaco-editor';

const MAX_CACHED_CODE_EDITOR_MODELS = 12;

type CachedCodeEditorModel = {
  model: monaco.editor.ITextModel;
  lastInputText: string;
};

const modelCache = new Map<string, CachedCodeEditorModel>();

function encodeCodeEditorModelCachePart(value: string | null | undefined): string {
  return encodeURIComponent(value?.trim() || 'none');
}

function getCodeEditorModelProjectPrefix(projectId: string): string {
  return `project:${encodeCodeEditorModelCachePart(projectId)}|`;
}

export function getCodeEditorModelUri(cacheKey: string): string {
  return `inmemory://rivet/node-editor/${encodeURIComponent(cacheKey)}`;
}

export function getOrCreateCodeEditorModel(params: {
  cacheKey: string | undefined;
  text: string;
  getExistingModel?: () => monaco.editor.ITextModel | null;
  createModel: () => monaco.editor.ITextModel;
}): {
  model: monaco.editor.ITextModel;
  isCached: boolean;
} {
  const { cacheKey, text, createModel, getExistingModel } = params;

  if (!cacheKey) {
    return {
      model: createModel(),
      isCached: false,
    };
  }

  const cached = modelCache.get(cacheKey);
  if (cached) {
    modelCache.delete(cacheKey);
    modelCache.set(cacheKey, cached);

    if (cached.lastInputText !== text && cached.model.getValue() !== text) {
      cached.model.setValue(text);
    }
    cached.lastInputText = text;

    return {
      model: cached.model,
      isCached: true,
    };
  }

  const model = getExistingModel?.() ?? createModel();
  modelCache.set(cacheKey, { model, lastInputText: text });
  evictOldModels();

  return {
    model,
    isCached: true,
  };
}

export function clearCodeEditorModelCacheForProject(projectId: string): void {
  const prefix = getCodeEditorModelProjectPrefix(projectId);
  for (const [cacheKey, cached] of modelCache) {
    if (cacheKey.startsWith(prefix)) {
      cached.model.dispose();
      modelCache.delete(cacheKey);
    }
  }
}

export function clearCodeEditorModelCache(): void {
  for (const cached of modelCache.values()) {
    cached.model.dispose();
  }
  modelCache.clear();
}

export function getCachedCodeEditorModelCount(): number {
  return modelCache.size;
}

function evictOldModels(): void {
  while (modelCache.size > MAX_CACHED_CODE_EDITOR_MODELS) {
    const oldestKey = modelCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      return;
    }

    const oldest = modelCache.get(oldestKey);
    oldest?.model.dispose();
    modelCache.delete(oldestKey);
  }
}
