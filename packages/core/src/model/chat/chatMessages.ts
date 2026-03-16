import { coerceType, coerceTypeOptional } from '../../utils/coerceType.js';
import { getScalarTypeOf, isArrayDataValue, type ChatMessage, type ScalarDataValue, type DataValue } from '../DataValue.js';

export function coercePromptToChatMessages(prompt: unknown, options: { requirePrompt?: boolean } = {}): ChatMessage[] {
  if (!prompt) {
    if (options.requirePrompt) {
      throw new Error('Prompt is required');
    }

    return [];
  }

  const value = prompt as DataValue;

  if (value.type === 'chat-message') {
    return [value.value];
  }

  if (value.type === 'chat-message[]') {
    return [...value.value];
  }

  if (value.type === 'string') {
    return [{ type: 'user', message: value.value }];
  }

  if (value.type === 'string[]') {
    return value.value.map((entry: string) => ({ type: 'user', message: entry }));
  }

  if (isArrayDataValue(value)) {
    const stringValues = (value.value as readonly unknown[]).map((entry) =>
      coerceType(
        {
          type: getScalarTypeOf(value.type),
          value: entry,
        } as ScalarDataValue,
        'string',
      ),
    );

    return stringValues.filter((entry) => entry != null).map((entry) => ({ type: 'user', message: entry }));
  }

  const coercedMessage = coerceTypeOptional(value, 'chat-message');
  if (coercedMessage != null) {
    return [coercedMessage];
  }

  const coercedString = coerceTypeOptional(value, 'string');
  return coercedString != null ? [{ type: 'user', message: coerceType(value, 'string') }] : [];
}

export function prependSystemPrompt(messages: ChatMessage[], systemPrompt: unknown): ChatMessage[] {
  if (!systemPrompt) {
    return messages;
  }

  const systemMessage = coerceType(systemPrompt as never, 'string');
  const nextMessages = [...messages];

  if (nextMessages.length > 0 && nextMessages[0]!.type === 'system') {
    nextMessages.splice(0, 1);
  }

  return [{ type: 'system', message: systemMessage }, ...nextMessages];
}
