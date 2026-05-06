import { css } from '@emotion/react';

export const nodeStyles = css`
  .node {
    --node-card-radius: calc(20px * var(--ui-font-scale));
    --node-card-corner-shape: squircle;
    --node-output-min-height: 46px;
    --node-output-collapsed-max-height: calc(3 * 1.4em + 200px);
    --node-output-hover-max-height: calc(20 * 1.4em + 36px);
    --node-output-multi-collapsed-max-height: calc(3 * 1.4em + 60px);
    --node-output-multi-hover-max-height: calc(20 * 1.4em + 60px);
    background-color: var(--grey-darker-darker);
    background-clip: padding-box;
    border-radius: var(--node-card-radius);
    corner-shape: var(--node-card-corner-shape);
    /* border: 2px solid transparent; */
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    position: absolute;
    /* min-width: 300px; */
    /* max-width: 500px; */
    width: 450px;
    padding: 12px;
    font-family: var(--font-family-monospace);
    /* transition-duration: 0.2s; TODO */
    transition-timing-function: ease-out;
    transition-property: box-shadow;
    transform-origin: top left;
    contain: layout;
    isolation: isolate;
    pointer-events: auto;
  }

  .node:focus {
    outline: none;
  }

  .node:focus-visible:not(.selected):not(.hovered):not(.overlayNode) {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .node.changed-added {
    --node-frame-border-color: var(--success);
  }

  .node.changed {
    --node-frame-border-color: var(--warning);
  }

  .node.not-changed {
    opacity: 0.5;
  }

  .node-skeleton {
    background: var(--grey-light);
    height: 100px;
  }

  .node.isComment {
    background-color: rgba(46, 46, 46, 0.1);
    pointer-events: auto;
    padding: 0;
  }

  .node.isComment .node-body {
    pointer-events: auto;
  }

  .node.isComment .node-body * {
    pointer-events: none;
  }

  .node.zoomedOut {
    min-width: 200px;
  }

  .node.overlayNode {
    --node-frame-border-color: var(--primary);
    transition-duration: 0;
    pointer-events: none;
    box-shadow: 10px 10px 16px rgba(0, 0, 0, 0.4);
  }

  .node.selected:not(.isComment) {
    --node-frame-border-color: var(--primary);
    z-index: 10000 !important;
  }

  /* Keep selected Comment nodes behind normal nodes so overlapping node headers stay grabbable. */
  .node.isComment.selected {
    --node-frame-border-color: var(--primary);
  }

  .node.hovered:not(.isComment) {
    --node-frame-border-color: var(--primary);
    z-index: 10001 !important;
  }

  .node.searchMatch:not(.selected):not(.hovered) {
    --node-frame-border-color: color-mix(in srgb, var(--primary) 55%, var(--node-border) 45%);
  }

  .node-border-overlay {
    position: absolute;
    inset: 0;
    border: 2px solid var(--node-frame-border-color, transparent);
    border-radius: inherit;
    corner-shape: inherit;
    pointer-events: none;
    z-index: 2;
    transition: border-color 0.2s ease-out;
  }

  .node.hasCustomBorderColor .node-border-overlay {
    border-color: var(--node-frame-border-color, var(--node-border));
  }

  .node-title {
    background-color: var(--node-bg);
    font-family: var(--font-family);
    color: var(--node-bg-foreground);
    padding: 14px 14px 12px 14px;
    margin: -12px -12px 8px -11px;
    border-radius: var(--node-card-radius) var(--node-card-radius) 0 0;
    corner-shape: var(--node-card-corner-shape);
    letter-spacing: 0.05em;
    display: flex;
    justify-content: space-between;
    position: relative;
    user-select: none;
    overflow: hidden;
    word-break: break-word;
    hyphens: auto;
    cursor: pointer;
  }

  .node-title.grabbable {
    cursor: grab;
  }

  .node-title.grabbable:active,
  .node.dragging .node-title.grabbable,
  .node.overlayNode .node-title.grabbable {
    cursor: grabbing;
  }

  .node.conditional .node-title {
    padding-left: 30px;
  }

  .node.isSplit::before,
  .node.isSplit::after {
    content: '';
    position: absolute;
    border-radius: var(--node-card-radius) var(--node-card-radius) 0 0;
    corner-shape: var(--node-card-corner-shape);
    pointer-events: none;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.16);
  }

  .node.isSplit::before {
    top: calc(-11px * var(--ui-font-scale));
    height: calc(10px * var(--ui-font-scale));
    left: calc(8px * var(--ui-font-scale));
    right: calc(8px * var(--ui-font-scale));
    background: var(--node-bg);
    background: var(--node-stack-front-bg);
    opacity: 0.35;
    z-index: -1;
  }

  .node.isSplit::after {
    top: calc(-20px * var(--ui-font-scale));
    height: calc(8px * var(--ui-font-scale));
    left: calc(17px * var(--ui-font-scale));
    right: calc(17px * var(--ui-font-scale));
    background: var(--node-bg);
    background: var(--node-stack-back-bg);
    opacity: 0.15;
    z-index: -2;
  }

  .node.node.isComment .node-title {
    padding: 4px;
    background-color: var(--grey-darkish);
    pointer-events: auto;
    margin: 0;
  }

  .node.node.isComment .node-title * {
    pointer-events: auto;
  }

  .node.isComment .node-border-overlay {
    display: none;
  }

  .node.isComment.selected .node-border-overlay,
  .node.isComment.overlayNode .node-border-overlay,
  .node.isComment.searchMatch .node-border-overlay {
    display: block;
  }

  .node.isComment.overlayNode {
    box-shadow: none;
  }

  .node.isComment.overlayNode .node-title,
  .node.isComment.overlayNode .node-title * {
    pointer-events: none;
  }

  .node.zoomedOut .node-title {
    padding: 24px;
    line-height: 35px;
  }

  .grab-area {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: -12px;
    margin-bottom: -12px;
    padding: 12px 0;
  }

  .node:not(.isComment) .grab-area {
    padding-right: calc(66px * var(--ui-font-scale));
  }

  .split-run-mode-icon {
    flex: 0 0 auto;
    width: calc(16px * var(--ui-font-scale));
    height: calc(16px * var(--ui-font-scale));
  }

  .split-run-mode-icon-sequential {
    width: calc(20px * var(--ui-font-scale));
  }

  .subgraph-link-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(24px * var(--ui-font-scale));
    height: calc(46px * var(--ui-font-scale));
    margin: calc(-12px * var(--ui-font-scale)) 0;
    margin-left: calc(-5px * var(--ui-font-scale));
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--node-bg-foreground);
    cursor: pointer;
    transition: color 0.2s ease-out;

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .subgraph-link-button:hover {
    color: var(--primary-text);
  }

  .subgraph-link-tooltip {
    display: flex;
    align-items: center;
  }

  .title-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 3px;
    min-width: 0;
  }

  .title-text-label {
    min-width: 0;
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
    font-weight: bold;
    font-size: var(--ui-font-size-base);
    text-transform: uppercase;
  }

  .title-text-description {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    color: currentColor;
    font-size: var(--ui-font-size-xs);
    font-weight: 500;
    line-height: 1.25;
    letter-spacing: 0;
    opacity: 0.72;
    overflow-wrap: anywhere;
    text-transform: none;
  }

  .split-run-summary-tooltip {
    display: inline-flex;
  }

  .split-run-summary {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--ui-font-scale));
    min-height: calc(24px * var(--ui-font-scale));
    padding: 0.1em 0.6em 0.1em 0.4em;
    border: 0;
    border-radius: 0.8em;
    corner-shape: squircle;
    background: color-mix(in srgb, var(--node-bg-foreground) 85%, transparent);
    color: var(--node-bg);
    cursor: pointer;
    width: max-content;
    white-space: nowrap;
    font-family: inherit;
    font-size: var(--ui-font-size-xs);
    font-weight: 700;
    line-height: 1.3;
    text-transform: none;
    margin-top: calc(6px * var(--ui-font-scale));
    margin-left: -0.1em;
  }

  .split-run-summary-mode {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: calc(1.0px * var(--ui-font-scale));
  }

  .split-run-summary:hover {
    background: var(--primary);
    color: black;
  }

  .node.isComment .title-text {
    display: none;
  }

  .node.zoomedOut .title-text-label {
    font-size: calc(var(--ui-font-size-xl) * 1.25);
  }

  .node.zoomedOut .title-text-description {
    font-size: var(--ui-font-size-compact);
  }

  .title-controls {
    display: flex;
    align-items: flex-start;
    gap: calc(6px * var(--ui-font-scale));
    justify-content: flex-end;
    min-height: calc(22px * var(--ui-font-scale));
    margin-right: calc(-8px * var(--ui-font-scale));
    flex: 0 0 66px;
    width: calc(66px * var(--ui-font-scale));
    position: relative;
    pointer-events: none;

    .changed-button,
    .edit-button {
      background-color: transparent;
      border: none;
      color: var(--node-bg-foreground);
      cursor: pointer;
      font-size: calc(var(--ui-font-size-base) * 1.2857142857);
      transition: color 0.2s ease-out;
      margin: calc(-12px * var(--ui-font-scale)) 0;
      width: calc(30px * var(--ui-font-scale));
      height: calc(46px * var(--ui-font-scale));
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;

      svg {
        width: calc(18px * var(--ui-font-scale));
        height: calc(18px * var(--ui-font-scale));
      }
    }

    .changed-button:hover,
    .edit-button:hover {
      color: var(--primary-text);
    }
  }

  .node:not(.isComment) .title-controls {
    flex: none;
    margin-right: 0;
    position: absolute;
    right: 6px;
    top: 14px;
    z-index: 4;
  }

  .title-controls .node-running-indicator {
    color: var(--node-bg-foreground);
    margin-top: calc(3px * var(--ui-font-scale));
  }

  .node:not(:hover):not(.hovered):not(:focus-within) .title-controls .node-running-indicator {
    margin-right: 8px;
  }

  .title-controls > :not(.node-running-indicator) {
    pointer-events: auto;
  }

  .title-controls .tooltip {
    display: flex;
    align-items: center;
  }

  .title-controls .edit-button-tooltip,
  .title-controls > .edit-button {
    opacity: 0;
    position: absolute;
    right: 0;
    pointer-events: none;
  }

  .title-controls .edit-button {
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 0.15s ease-out,
      color 0.2s ease-out;
  }

  .node:is(:hover, .hovered, .showHoverControls, :focus-within)
    .title-controls
    :is(.edit-button, .edit-button-tooltip) {
    opacity: 1;
    position: static;
    pointer-events: auto;
  }

  .node.zoomedOut .title-controls {
    position: absolute;
    right: 10px;
    top: 10px;
  }

  .node-body {
    color: var(--foreground);
    font-family: inherit;
    font-size: var(--ui-font-size-sm);
    margin-bottom: 12px;
    line-height: 1.4;
  }

  .node-body pre {
    font-family: inherit;
  }

  .node.isComment .node-body {
    border-radius: 0 0 var(--node-card-radius) var(--node-card-radius);
    corner-shape: var(--node-card-corner-shape);
    flex: 1;
    height: auto;
    margin-bottom: 0;
    min-height: 0;
    overflow: hidden;
  }

  .node.isComment .node-body > * {
    border-radius: inherit;
    corner-shape: inherit;
  }

  .node-title-ports {
    position: absolute;
    left: 10px;
    top: 16px;
    display: flex;
    justify-content: space-between;
    margin: 0 0 0 -12px;
    z-index: 3;
  }

  .node-ports {
    display: flex;
    justify-content: space-between;
    margin: 0 -12px 0 -12px;
    position: relative;
    z-index: 3;
  }

  .node-ports-groups {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .node-ports-group {
    display: flex;
    flex-direction: column;
    gap: 8px;

    > header {
      background: var(--node-bg);
      color: var(--node-bg-foreground);
      align-self: flex-start;
      padding: 4px 8px;
      margin-left: -12px;
      font-size: var(--ui-font-size-sm);
      font-family: inherit;
      border-radius: 0 8px 8px 0;
      corner-shape: squircle;
      user-select: none;
    }
  }

  .input-ports,
  .output-ports {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .input-ports .port {
    flex-direction: row;
    justify-content: flex-start;
  }

  .output-ports .port {
    flex-direction: row-reverse;
    justify-content: flex-start;
  }

  .port {
    display: flex;
    align-items: center;
    position: relative;
    z-index: 3;
  }

  .port-label-uppercase {
    text-transform: uppercase;
  }

  .port-label {
    color: var(--grey-lighter);
    font-size: var(--ui-font-size-2xs);
    letter-spacing: 1px;
    margin: 0 4px;
    white-space: nowrap;
    user-select: none;
    opacity: 0.5;
    cursor: default;
  }

  .node.zoomedOut .port-label {
    display: none;
  }

  .node.selected .port-label,
  .node.overlayNode .port-label,
  .port-label:hover {
    opacity: 1;
  }

  .node.zoomedOut .port:hover .port-label {
    display: block;
    font-size: var(--ui-font-size-xl);
    line-height: 12px;
  }

  .input-port {
    margin-left: -8px;
  }

  .output-port {
    margin-right: -8px;
  }

  .port-circle {
    position: relative;
  }

  .input-port,
  .output-port {
    background-color: var(--grey-dark);
    border: 2px solid var(--grey);
    border-radius: 50%;
    height: 16px;
    width: 16px;
    transition: all 0.2s ease-in-out;
  }

  .input-port:hover,
  .output-port:hover {
    border-color: var(--primary);
    cursor: pointer;
  }

  .input-ports .port-label {
    text-align: left;
    position: static;
  }

  .output-ports .port-label {
    text-align: right;
    position: static;
  }

  .node.zoomedOut .input-ports .port-label {
    text-align: right;
    position: absolute;
    right: calc(100% + 8px);
  }

  .node.zoomedOut .output-ports .port-label {
    text-align: left;
    position: absolute;
    left: calc(100% + 8px);
  }

  .port.connected .port-circle,
  .port.closest .port-circle {
    background-color: var(--primary);
    border: 2px solid var(--primary-dark);
  }

  .port.compatible:not(.connected) .port-circle {
    border: 2px solid var(--success);
  }

  .port.coerced .port-circle {
    border: 2px solid var(--warning);
  }

  .port.incompatible .port-circle {
    border: 2px solid var(--error);
  }

  .port.connected .port-label {
    color: var(--primary-text);
  }

  .node-output {
    position: relative;
    z-index: 0;
  }

  .node.isComment .node-output {
    display: none;
  }

  .node-output-inner,
  .multi-node-output {
    background-color: var(--grey-darkest);
    /*background-image: linear-gradient(to bottom, var(--grey-darker) 0%, var(--grey-darkest) 100%);*/
    border-radius: 0 0 var(--node-card-radius) var(--node-card-radius);
    corner-shape: var(--node-card-corner-shape);
    border-top: 2px solid var(--success-light);
    color: var(--foreground);
    font-size: var(--ui-font-size-sm);
    line-height: 1.4;
    margin: 8px -12px -12px -12px;
    min-height: var(--node-output-min-height);
    padding: 12px;
    position: relative;
    transition: border-color 0.2s ease-out;
    transition: max-height 0.2s ease-out;
    overflow: hidden;
  }

  .node-output-inner {
    max-height: var(--node-output-collapsed-max-height);
  }

  .multi-node-output {
    padding: 0;
    margin-bottom: -8px;
    max-height: var(--node-output-multi-collapsed-max-height);
  }

  .node-output-warnings {
    background-color: var(--grey-darker);
    background-image: linear-gradient(to bottom, var(--grey-darker) 0%, var(--grey-darkest) 100%);
    border-radius: 0 0 var(--node-card-radius) var(--node-card-radius);
    corner-shape: var(--node-card-corner-shape);
    border-top: 2px solid var(--warning-light);
    color: var(--foreground-bright);
    font-size: var(--ui-font-size-sm);
    line-height: 1.4;
    margin: -2px -12px -12px -12px;
    padding: 12px;
    position: relative;
    transition: border-color 0.2s ease-out;
    margin-top: 8px;
    max-height: var(--node-output-collapsed-max-height);
    transition: max-height 0.2s ease-out;
    overflow: hidden;
  }

  .node.running .node-output:not(.multi) .node-output-inner,
  .node.running .multi-node-output {
    border-top-color: var(--primary);
  }

  .node.error,
  .node.interrupted {
    --node-output-status-bg: color-mix(in srgb, var(--error) 10%, var(--grey-darker) 90%);
    --node-output-status-border: var(--error-light);
  }

  .node.success .node-output:not(.multi) .node-output-inner,
  .node.success .multi-node-output {
    border-top-color: var(--success-light);
  }

  .node.error .node-output:not(.multi) .node-output-inner,
  .node.interrupted .node-output:not(.multi) .node-output-inner,
  .node.error .multi-node-output,
  .node.interrupted .multi-node-output {
    background-color: var(--node-output-status-bg);
    background-image: none;
    border-top-color: var(--node-output-status-border);
  }

  .node.not-ran .node-output:not(.multi) .node-output-inner,
  .node.not-ran .multi-node-output {
    border-top-style: dashed;
    border-top-color: var(--grey-lightish);
  }

  .node-output.multi .node-output-inner.node-output-inner {
    border-top: 1px solid var(--grey-light);
  }

  .node:hover .node-output-inner,
  .node:hover .node-output-warnings {
    max-height: var(--node-output-hover-max-height);
  }

  .node:hover .multi-node-output {
    max-height: var(--node-output-multi-hover-max-height);
  }

  .node.isOutputExpanded .node-output-inner {
    max-height: unset;
    overflow: auto;
  }

  .node.isOutputExpanded .multi-node-output {
    max-height: unset;
    overflow: visible;
  }

  .node .node-output.errored:not(.multi) {
    border-top: 2px solid var(--error-light);
  }

  .node-output.multi:before {
    top: 2px;
  }

  .node-output:before {
    content: '';
    position: absolute;
    top: 1px;
    left: 50%;
    z-index: 2;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid var(--success-light);
  }

  .node.success .node-output:before {
    border-top-color: var(--success-light);
  }

  .node.error .node-output:before,
  .node.interrupted .node-output:before {
    border-top-color: var(--node-output-status-border);
  }

  .node.not-ran .node-output:before {
    border-top-color: var(--grey-lightish);
  }

  .node-output.errored:before {
    border-top: 8px solid var(--error-light);
  }

  .node.running .node-output:before {
    border-top-color: var(--primary);
  }

  .overlay-buttons {
    position: absolute;
    top: 8px;
    right: 4px;
    display: flex;
    gap: calc(8px * var(--ui-font-scale));
    z-index: 10;
  }

  .copy-button,
  .expand-button,
  .output-toggle-button,
  .prompt-designer-button {
    width: calc(24px * var(--ui-font-scale));
    height: calc(24px * var(--ui-font-scale));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--ui-font-size-2xl);
    opacity: 0.2;
    cursor: pointer;
    transition:
      opacity 0.2s,
      background-color 0.2s,
      box-shadow 0.2s;
    z-index: 1;
  }

  .node:hover .copy-button,
  .node:hover .expand-button,
  .node:hover .output-toggle-button,
  .node:hover .prompt-designer-button {
    opacity: 0.35;
  }

  .node .copy-button:hover,
  .node .expand-button:hover,
  .node .output-toggle-button:hover,
  .node .prompt-designer-button:hover {
    opacity: 1;
  }

  .copy-button svg,
  .expand-button svg,
  .output-toggle-button svg,
  .prompt-designer-button svg {
    width: 80%;
    height: 80%;
  }

  .node.isOutputExpanded .output-toggle-button {
    opacity: 1;
    background-color: transparent;
    box-shadow: none;
    color: var(--primary);
  }

  .node .running {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .node-resize-handles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }

  .resize-handle {
    position: absolute;
    background: transparent;
    pointer-events: auto;
    touch-action: none;
  }

  .resize-handle-left,
  .resize-handle-right {
    top: 0;
    bottom: 0;
    width: 12px;
  }

  .resize-handle-left {
    left: -8px;
    cursor: var(--resize-edge-horizontal-cursor);
  }

  .resize-handle-right {
    right: -8px;
    cursor: var(--resize-edge-horizontal-cursor);
  }

  .resize-handle-top,
  .resize-handle-bottom {
    left: 0;
    right: 0;
    height: 12px;
  }

  .resize-handle-top {
    top: -8px;
    cursor: var(--resize-edge-vertical-cursor);
  }

  .resize-handle-bottom {
    bottom: -8px;
    cursor: var(--resize-edge-vertical-cursor);
  }

  .resize-handle-top-left,
  .resize-handle-top-right,
  .resize-handle-bottom-left,
  .resize-handle-bottom-right {
    width: 18px;
    height: 18px;
    z-index: 1;
  }

  .resize-handle-top-left {
    top: -9px;
    left: -9px;
    cursor: var(--resize-edge-diagonal-down-cursor);
  }

  .resize-handle-top-right {
    top: -9px;
    right: -9px;
    cursor: var(--resize-edge-diagonal-up-cursor);
  }

  .resize-handle-bottom-left {
    bottom: -9px;
    left: -9px;
    cursor: var(--resize-edge-diagonal-up-cursor);
  }

  .resize-handle-bottom-right {
    right: -9px;
    bottom: -9px;
    cursor: var(--resize-edge-diagonal-down-cursor);
  }

  .node.isComment .resize-handle {
    pointer-events: auto;
  }

  .node.running {
    box-shadow:
      0 0 16px var(--shadow-primary-bright),
      0 8px 16px rgba(0, 0, 0, 0.4);
  }

  .split-output {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .picker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    user-select: none;
    height: 32px;

    .picker-left,
    .picker-right {
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      cursor: pointer;
      border: 0;
      margin: 0;
      padding: 0;
      width: 32px;
      height: 32px;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    }

    .picker-left {
      border-right: 1px solid rgba(255, 255, 255, 0.1);
    }

    .picker-right {
      border-left: 1px solid rgba(255, 255, 255, 0.1);
    }
  }

  .multi-node-output-inner {
    padding: 12px;
  }

  .port-hover-area {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    position: absolute;
    left: 8px;
    top: 8px;
    transform: translate(-50%, -50%);
    /* background-color: rgba(1, 1, 1, 0.5); */
  }

  .node-output .function-call,
  .node-output .function-calls {
    h4 {
      margin-top: 0;
      margin-bottom: 0;
      text-decoration: none;
      font-size: var(--ui-font-size-sm);
      font-weight: normal;
      color: var(--primary-text);
    }
  }

  .node.disabled {
    opacity: 0.5;

    .node-title {
      text-decoration: line-through;
    }
  }

`;
