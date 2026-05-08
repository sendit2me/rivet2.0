import { type FC, memo, useState } from 'react';
import { type HeightCache, useNodeBodyHeight } from '../hooks/useNodeBodyHeight';
import { useUnknownNodeComponentDescriptorFor } from '../hooks/useNodeTypes.js';
import {
  type ChartNode,
  type ColorizedNodeBodySpec,
  type MarkdownNodeBodySpec,
  type NodeBodySpec,
  type PlainNodeBodySpec,
  type NodeBody as RenderedNodeBody,
  type NodeId,
} from '@valerypopoff/rivet2-core';

import { useMarkdown } from '../hooks/useMarkdown';
import { match } from 'ts-pattern';
import styled from '@emotion/styled';
import ColorizedPreformattedText from './ColorizedPreformattedText';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import { useGetRivetUIContext } from '../hooks/useGetRivetUIContext';
import { useProjectNodeRegistry } from '../hooks/useProjectNodeRegistry';
import { useAsyncEffect } from 'use-async-effect';
import { handleError } from '../utils/errorHandling.js';

export const NodeBody: FC<{ heightCache: HeightCache; node: ChartNode; suspended?: boolean }> = memo(
  ({ heightCache, node, suspended = false }) =>
    suspended ? (
      <SuspendedNodeBody heightCache={heightCache} node={node} />
    ) : (
      <ActiveNodeBody heightCache={heightCache} node={node} />
    ),
);

NodeBody.displayName = 'NodeBody';

const ActiveNodeBody: FC<{ heightCache: HeightCache; node: ChartNode }> = ({ heightCache, node }) => {
  const { Body } = useUnknownNodeComponentDescriptorFor(node);
  useDependsOnPlugins();

  const body = Body ? <Body node={node} /> : <UnknownNodeBody heightCache={heightCache} node={node} />;

  return <div className="node-body">{body}</div>;
};

const SuspendedNodeBody: FC<{ heightCache: HeightCache; node: ChartNode }> = ({ heightCache, node }) => {
  const height = heightCache.get(node.id);

  return (
    <div className="node-body">
      {height == null ? null : <div aria-hidden="true" style={{ height: `${height}px` }} />}
    </div>
  );
};

const UnknownNodeBodyWrapper = styled.div<{
  fontSize: number;
  fontFamily: 'monospace' | 'sans-serif';
}>`
  overflow: hidden;
  font-size: calc(${(props) => props.fontSize}px * var(--ui-font-scale, 1));
  font-family: ${(props) => (props.fontFamily === 'monospace' ? 'var(--font-family-monospace)' : 'var(--font-family)')};

  .node-body-markdown > :first-child {
    margin-top: 0;
  }

  .node-body-markdown > :last-child {
    margin-bottom: 0;
  }

  pre {
    margin: 0;
  }

  .node-body-colorized-wrap {
    max-width: 100%;
    min-width: 0;
    overflow-wrap: normal;
    white-space: pre-wrap;
    width: 100%;
    word-break: normal;
  }
`;

// Fixes flickering due to async rendering of node body by caching the last rendered body
const previousRenderedBodyMap = new Map<NodeId, RenderedNodeBody>();

type UnknownNodeBodyState = {
  body: RenderedNodeBody | undefined;
  pending: boolean;
};

const UnknownNodeBody: FC<{ heightCache: HeightCache; node: ChartNode }> = ({ heightCache, node }) => {
  const getUIContext = useGetRivetUIContext();
  const projectNodeRegistry = useProjectNodeRegistry();

  const [bodyState, setBodyState] = useState<UnknownNodeBodyState>(() => ({
    body: previousRenderedBodyMap.get(node.id),
    pending: true,
  }));
  const { body, pending } = bodyState;
  const { ref, height } = useNodeBodyHeight(heightCache, node.id, {
    ready: body != null,
    preserveCachedHeight: pending,
  });

  useAsyncEffect(async () => {
    setBodyState((current) => ({
      body: current.body,
      pending: true,
    }));

    try {
      const impl = projectNodeRegistry.createDynamicImpl(node);
      const renderedBody = await impl.getBody(await getUIContext({ node }));

      setBodyState({
        body: renderedBody,
        pending: false,
      });

      if (renderedBody == null) {
        previousRenderedBodyMap.delete(node.id);
      } else {
        previousRenderedBodyMap.set(node.id, renderedBody);
      }
    } catch (err) {
      handleError(err, 'Failed to load body for node', {
        metadata: {
          nodeId: node.id,
          nodeType: node.type,
        },
      });
    }
  }, [getUIContext, node, projectNodeRegistry]);

  const bodySpec: NodeBodySpec | NodeBodySpec[] | undefined =
    typeof body === 'string' ? { type: 'plain', text: body } : body;
  let allSpecs = bodySpec ? (Array.isArray(bodySpec) ? bodySpec : [bodySpec]) : [];

  allSpecs = allSpecs.map((spec) => {
    if (spec.type === 'plain' && spec.text.startsWith('!markdown')) {
      return { type: 'markdown', text: spec.text.replace(/^!markdown/, '') };
    }

    return spec;
  });

  const renderedSpecs = allSpecs.map((spec) => ({
    spec,
    rendered: match(spec)
      .with({ type: 'plain' }, (spec) => <PlainNodeBody {...spec} />)
      .with({ type: 'markdown' }, (spec) => <MarkdownNodeBody {...spec} />)
      .with({ type: 'colorized' }, (spec) => <ColorizedNodeBody {...spec} />)
      .exhaustive(),
  }));

  if (!pending && renderedSpecs.length === 0) {
    return null;
  }

  return (
    <div ref={ref} style={{ height }}>
      {renderedSpecs.map(({ spec, rendered }, i) => (
        <UnknownNodeBodyWrapper key={i} fontFamily={spec.fontFamily ?? 'monospace'} fontSize={spec.fontSize ?? 12}>
          {rendered}
        </UnknownNodeBodyWrapper>
      ))}
    </div>
  );
};

export const PlainNodeBody: FC<PlainNodeBodySpec> = memo(({ text }) => {
  return <pre className="pre-wrap">{text}</pre>;
});

PlainNodeBody.displayName = 'PlainNodeBody';

export const MarkdownNodeBody: FC<MarkdownNodeBodySpec> = memo(({ text }) => {
  const markdownBody = useMarkdown(text);

  return <div className="pre-wrap node-body-markdown" dangerouslySetInnerHTML={markdownBody} />;
});

MarkdownNodeBody.displayName = 'MarkdownNodeBody';

function shouldWrapColorizedNodeBody(language: string): boolean {
  return language === 'prompt-interpolation-markdown';
}

export const ColorizedNodeBody: FC<ColorizedNodeBodySpec> = memo(({ text, language, theme }) => {
  const wrapWords = shouldWrapColorizedNodeBody(language);

  return (
    <ColorizedPreformattedText
      text={text}
      language={language}
      theme={theme}
      className={wrapWords ? 'node-body-colorized-wrap' : undefined}
      wrapWords={wrapWords}
    />
  );
});

ColorizedNodeBody.displayName = 'ColorizedNodeBody';
