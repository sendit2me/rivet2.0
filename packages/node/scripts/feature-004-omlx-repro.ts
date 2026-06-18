/**
 * Feature 004 — live oMLX reproduction (SPEC §8). NOT part of the no-network gate.
 *
 * Reproduces the two proofs against a real OpenAI-compatible reasoning server (e.g. oMLX):
 *   A. A "terse-fast" Skill carrying `extraBody:{chat_template_kwargs:{enable_thinking:false}}`
 *      disables thinking through the real node → reasoning ~0 and a sub-second call.
 *   B. With thinking on and `outputReasoning` set, the `reasoning` port surfaces non-empty
 *      reasoning_content (the streaming-accumulation path against a real server).
 *
 * Skips cleanly when no endpoint is configured.
 *
 * Env:
 *   RIVET_OMLX_ENDPOINT  (required) e.g. http://localhost:8080/v1/chat/completions
 *   RIVET_OMLX_MODEL     (optional) default "local-model"
 *   RIVET_OMLX_KEY       (optional) bearer key; default "" (keyless local)
 *
 * Run:  RIVET_OMLX_ENDPOINT=… yarn workspace @valerypopoff/rivet2-node exec tsx scripts/feature-004-omlx-repro.ts
 */
import { runGraph, globalRivetNodeRegistry, type LlmSkill, type Project } from '../src/index.js';

const endpoint = process.env.RIVET_OMLX_ENDPOINT;
const model = process.env.RIVET_OMLX_MODEL ?? 'local-model';
const apiKey = process.env.RIVET_OMLX_KEY ?? '';

function buildProject(chatData: Record<string, unknown>): { project: Project; graphId: string } {
  const text = { id: 'text', type: 'text', title: 'Text', data: { text: 'What is 17 * 23? Answer with just the number.' }, visualData: { x: 0, y: 0, width: 200 } };
  const chat = {
    id: 'chat',
    type: 'chat',
    title: 'Chat',
    data: {
      model,
      endpoint,
      useModelInput: false,
      temperature: 0.2,
      useTemperatureInput: false,
      top_p: 1,
      useTopPInput: false,
      useTopP: false,
      useUseTopPInput: false,
      maxTokens: 2048,
      useMaxTokensInput: false,
      useStop: false,
      useStopInput: false,
      usePresencePenaltyInput: false,
      useFrequencyPenaltyInput: false,
      cache: false,
      systemPromptMode: 'system',
      outputReasoning: true,
      ...chatData,
    },
    visualData: { x: 300, y: 0, width: 200 },
  };
  const respOut = { id: 'respOut', type: 'graphOutput', title: 'resp', data: { id: 'response', dataType: 'string' }, visualData: { x: 600, y: 0, width: 200 } };
  const reasonOut = { id: 'reasonOut', type: 'graphOutput', title: 'reason', data: { id: 'reasoning', dataType: 'string' }, visualData: { x: 600, y: 150, width: 200 } };
  const graphId = 'g';
  const project = {
    metadata: { id: 'p', title: 'oMLX repro', description: '', mainGraphId: graphId },
    graphs: {
      [graphId]: {
        metadata: { id: graphId, name: 'g', description: '' },
        nodes: [text, chat, respOut, reasonOut],
        connections: [
          { outputNodeId: 'text', outputId: 'output', inputNodeId: 'chat', inputId: 'prompt' },
          { outputNodeId: 'chat', outputId: 'response', inputNodeId: 'respOut', inputId: 'value' },
          { outputNodeId: 'chat', outputId: 'reasoning', inputNodeId: 'reasonOut', inputId: 'value' },
        ],
      },
    },
    plugins: [],
  } as unknown as Project;
  return { project, graphId };
}

async function main(): Promise<void> {
  if (!endpoint) {
    console.log('SKIP: set RIVET_OMLX_ENDPOINT to run the live oMLX reproduction (no network on the build VM).');
    return;
  }

  const terseFast: LlmSkill = { id: 'terse-fast', name: 'Terse Fast', extraBody: { chat_template_kwargs: { enable_thinking: false } } };

  const runOnce = async (chatData: Record<string, unknown>, skills: LlmSkill[]) => {
    const { project, graphId } = buildProject(chatData);
    const t0 = Date.now();
    const out = await runGraph(project, { graph: graphId, registry: globalRivetNodeRegistry, llmSkills: skills, openAiKey: apiKey });
    return { ms: Date.now() - t0, response: String(out['response']?.value ?? ''), reasoning: String(out['reasoning']?.value ?? '') };
  };

  console.log(`Endpoint: ${endpoint}  Model: ${model}\n`);

  console.log("A. 'terse-fast' Skill (extraBody disables thinking):");
  const a = await runOnce({ llmSkillId: 'terse-fast' }, [terseFast]);
  console.log(`   ${a.ms} ms · reasoning chars: ${a.reasoning.length} · response: ${a.response.slice(0, 60)}`);

  console.log('\nB. Thinking on (no extraBody), outputReasoning on:');
  const b = await runOnce({}, []);
  console.log(`   ${b.ms} ms · reasoning chars: ${b.reasoning.length} · response: ${b.response.slice(0, 60)}`);

  console.log('\nExpect: A reasoning≈0 and faster; B reasoning>0.');
  if (a.reasoning.length === 0 && b.reasoning.length > 0) {
    console.log('REPRO CONFIRMED: extraBody disabled thinking (A); reasoning surfaced (B).');
  } else {
    console.log('NOTE: outcome model-dependent — inspect the numbers above against your server.');
  }
}

await main();
