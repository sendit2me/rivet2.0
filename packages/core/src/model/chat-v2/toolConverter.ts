import type { GptFunction } from '../DataValue.js';
import { rivetToolsToAiSdk } from '../chat/aiSdkTools.js';
import type { ChatV2ToolSet } from './chatV2Types.js';

export function chatV2ToolsToAiSdk(functions: GptFunction[]): ChatV2ToolSet {
  return rivetToolsToAiSdk(functions);
}
