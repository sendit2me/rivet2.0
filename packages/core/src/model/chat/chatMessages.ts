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

/**
 * Inject a Skill's `systemPrompt` as a leading system message (the "pre-prompt"), per
 * SPEC 002 §5. Composed order is **skill system → the node's own system message → user turns**:
 * the skill frames the role, the node's existing system text refines it.
 *
 * Idempotent / loop-safe: any prior copy of *this exact* skill prompt is removed before
 * re-inserting it once at the front, so feedback loops (ChatLoop wiring `all-messages` back
 * into `prompt`) never accumulate duplicates. De-dupe is by exact text, so a legitimately
 * *different* node system message is preserved, never collapsed.
 *
 * The returned messages carry `type: 'system'`; the OpenAI role (`system` vs `developer`) is
 * applied downstream by `chatMessageToOpenAIChatCompletionMessage`, so `systemPromptMode` is
 * honored automatically. Empty/blank skill prompt → passthrough (returns the input array).
 */
export function prependSkillSystemPrompt(messages: ChatMessage[], skillSystemPrompt: string | undefined): ChatMessage[] {
  if (!skillSystemPrompt) {
    return messages;
  }

  const withoutPriorInjection = messages.filter(
    (message) => !(message.type === 'system' && message.message === skillSystemPrompt),
  );

  return [{ type: 'system', message: skillSystemPrompt }, ...withoutPriorInjection];
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
