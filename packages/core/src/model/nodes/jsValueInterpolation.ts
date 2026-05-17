import { dedent } from 'ts-dedent';
import type { Inputs } from '../GraphProcessor.js';
import type { NodeInputDefinition, PortId } from '../NodeBase.js';
import { createInterpolationInputDefinition } from '../interpolationInputDefinition.js';
import { getError } from '../../utils/errors.js';
import { extractInterpolationVariables, replaceInterpolationTokens } from '../../utils/interpolation.js';

type JsValueInterpolationOptions = {
  localIdentifiers?: ReadonlySet<string>;
  trim?: boolean;
};

export type JsValueInterpolationRuntimeContext = {
  inputNames: string[];
  inputsIdentifier: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsIdentifier(source: string, identifier: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(identifier)}($|[^A-Za-z0-9_$])`).test(source);
}

export function getSafeJsValueInterpolationIdentifier(source: string, baseIdentifier: string): string {
  let index = 0;
  let candidate = baseIdentifier;

  while (containsIdentifier(source, candidate)) {
    index += 1;
    candidate = `${baseIdentifier}_${index}`;
  }

  return candidate;
}

export function buildJsValuePreview(source: string, maxLines: number): string {
  return source.split('\n').slice(0, maxLines).join('\n').trim();
}

function isSpecialReference(inputName: string): boolean {
  return inputName.startsWith('@graphInputs.') || inputName.startsWith('@context.');
}

function isSimpleIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function getUserFacingInputName(inputName: string): string {
  return isSimpleIdentifier(inputName) ? inputName : `{{${inputName}}}`;
}

function buildJsValueReference(
  inputName: string | undefined,
  targetIdentifier: string,
  options: JsValueInterpolationOptions,
): string {
  if (!inputName || isSpecialReference(inputName)) {
    return 'undefined';
  }

  if (options.localIdentifiers?.has(inputName)) {
    return inputName;
  }

  return `${targetIdentifier}[${JSON.stringify(inputName)}]`;
}

function formatJsValuePreviewValue(
  inputName: string | undefined,
  inputs: Inputs,
  options: JsValueInterpolationOptions,
): string {
  if (!inputName || isSpecialReference(inputName)) {
    return 'undefined';
  }

  if (options.localIdentifiers?.has(inputName)) {
    return inputName;
  }

  const value = inputs[inputName as PortId]?.value;

  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return getUserFacingInputName(inputName);
}

export function getJsValueInterpolationInputNames(
  template: string,
  options: JsValueInterpolationOptions = {},
): string[] {
  return extractInterpolationVariables(template).filter((inputName) => !options.localIdentifiers?.has(inputName));
}

export function getJsValueInterpolationInputDefinitions(
  template: string,
  options: JsValueInterpolationOptions = {},
): NodeInputDefinition[] {
  return getJsValueInterpolationInputNames(template, options).map((inputName) =>
    createInterpolationInputDefinition({
      interpolationName: inputName,
      dataType: 'any',
      required: false,
    }),
  );
}

export function getJsValueInterpolationRuntimeContext(
  template: string,
  baseInputsIdentifier: string,
  options: JsValueInterpolationOptions = {},
): JsValueInterpolationRuntimeContext {
  return {
    inputNames: getJsValueInterpolationInputNames(template, options),
    inputsIdentifier: getSafeJsValueInterpolationIdentifier(template, baseInputsIdentifier),
  };
}

export function buildJsValueInterpolatedSource(
  template: string,
  targetIdentifier: string,
  options: JsValueInterpolationOptions = {},
): string {
  return replaceInterpolationTokens(
    template,
    (token) => buildJsValueReference(token.tokenName, targetIdentifier, options),
    {
      trim: options.trim ?? true,
    },
  );
}

export function interpolateJsValuePreviewSource(
  template: string,
  inputs: Inputs,
  options: JsValueInterpolationOptions = {},
): string {
  return replaceInterpolationTokens(template, (token) => formatJsValuePreviewValue(token.tokenName, inputs, options), {
    trim: options.trim ?? true,
  });
}

export function buildCloneJsInputValueFunction(): string {
  return dedent`
    const cloneJsInputValue = (value, seen = new WeakMap()) => {
      if (value == null || (typeof value !== 'object' && typeof value !== 'function')) {
        return value;
      }

      if (seen.has(value)) {
        return seen.get(value);
      }

      if (typeof value === 'function') {
        const clone = function (...args) {
          return value.apply(this, args);
        };
        seen.set(value, clone);
        for (const key of Reflect.ownKeys(value)) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (descriptor?.enumerable && 'value' in descriptor) {
            clone[key] = cloneJsInputValue(descriptor.value, seen);
          }
        }
        return clone;
      }

      if (typeof structuredClone === 'function') {
        try {
          const clone = structuredClone(value);
          seen.set(value, clone);
          return clone;
        } catch {
          // Fall through to the smaller clone path for values structuredClone cannot copy.
        }
      }

      if (Array.isArray(value)) {
        const clone = [];
        seen.set(value, clone);
        for (const item of value) {
          clone.push(cloneJsInputValue(item, seen));
        }
        return clone;
      }

      if (value instanceof Date) {
        return new Date(value.getTime());
      }

      if (value instanceof Map) {
        const clone = new Map();
        seen.set(value, clone);
        for (const [key, mapValue] of value.entries()) {
          clone.set(cloneJsInputValue(key, seen), cloneJsInputValue(mapValue, seen));
        }
        return clone;
      }

      if (value instanceof Set) {
        const clone = new Set();
        seen.set(value, clone);
        for (const item of value.values()) {
          clone.add(cloneJsInputValue(item, seen));
        }
        return clone;
      }

      if (value instanceof ArrayBuffer) {
        return value.slice(0);
      }

      if (ArrayBuffer.isView(value)) {
        if (value instanceof DataView) {
          return new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        }

        return new value.constructor(value);
      }

      const clone = Object.create(Object.getPrototypeOf(value));
      seen.set(value, clone);
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor?.enumerable && 'value' in descriptor) {
          clone[key] = cloneJsInputValue(descriptor.value, seen);
        }
      }
      return clone;
    };
  `;
}

export function buildClonedInputValueAssignments(
  inputNames: string[],
  targetIdentifier: string,
  cacheIdentifier: string,
): string {
  return inputNames
    .map(
      (inputName) =>
        `${targetIdentifier}[${JSON.stringify(inputName)}] = cloneJsInputValue(inputs[${JSON.stringify(
          inputName,
        )}]?.value, ${cacheIdentifier});`,
    )
    .join('\n');
}

export function buildJsValueInputClonePreamble({
  cacheIdentifier,
  inputsIdentifier,
}: {
  cacheIdentifier: string;
  inputsIdentifier: string;
}): string {
  return dedent`
    ${buildCloneJsInputValueFunction()}
    const ${inputsIdentifier} = Object.create(null);
    const ${cacheIdentifier} = new WeakMap();
  `;
}

export function buildJsValueInputsInitializer({
  cacheIdentifier,
  inputNames,
  inputsIdentifier,
}: {
  cacheIdentifier: string;
  inputNames: string[];
  inputsIdentifier: string;
}): string {
  return dedent`
    ${buildJsValueInputClonePreamble({ cacheIdentifier, inputsIdentifier })}
    ${buildClonedInputValueAssignments(inputNames, inputsIdentifier, cacheIdentifier)}
  `;
}

export function sanitizeGeneratedJsValueText(
  text: string | undefined,
  inputNames: string[],
  targetIdentifier: string,
  fallbackLabel: string,
): string | undefined {
  if (!text) {
    return text;
  }

  let sanitized = text;

  for (const inputName of inputNames) {
    const userFacingInputName = getUserFacingInputName(inputName);
    sanitized = sanitized
      .replaceAll(`${targetIdentifier}[${JSON.stringify(inputName)}]`, userFacingInputName)
      .replaceAll(`${targetIdentifier}.${inputName}`, userFacingInputName);
  }

  return sanitized.replaceAll(targetIdentifier, fallbackLabel);
}

export function sanitizeGeneratedJsValueError(
  error: unknown,
  inputNames: string[],
  targetIdentifier: string,
  fallbackLabel: string,
): Error {
  const jsValueError = getError(error);
  jsValueError.message =
    sanitizeGeneratedJsValueText(jsValueError.message, inputNames, targetIdentifier, fallbackLabel) ??
    jsValueError.message;
  jsValueError.stack = sanitizeGeneratedJsValueText(
    jsValueError.stack,
    inputNames,
    targetIdentifier,
    fallbackLabel,
  );

  return jsValueError;
}
