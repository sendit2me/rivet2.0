/**
 * Prototype — multi-agent arbitration harness, composed from existing nodes (no new node, no prod
 * code). Proves the session-token resume live against oMLX: ask → agentA + agentB answer (opposing
 * personas) → labeled list → arbiter picks → the winner's stored session is fetched and resumed with
 * an "expand" turn, demonstrably building on the winner's own earlier answer.
 *
 * Flow: question → {agentA, agentB} (LLM Chat, each binds a Profile+Skill; persona via systemPrompt)
 *   each agent's All Messages → SetGlobal "session-agent{A,B}"
 *   responses → Object {agentA,agentB} → ToYaml → arbiter (LLM Chat) → "agentA"/"agentB"
 *   ExtractRegex (agentA|agentB) → Text "session-{{choice}}" → GetGlobal (useIdInput, wait:true)
 *   winner messages + AssembleMessage("expand") → Array(flatten) → resume (LLM Chat) → final answer
 *
 * Run:
 *   OMLX_HOST=host.lima.internal OMLX_PORT=9090 OMLX_MODEL=Qwen3.6-35B-A3B-nvfp4 \
 *   yarn workspace @valerypopoff/rivet2-node exec tsx scripts/arbitration-harness.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runGraph,
  serializeProject,
  globalRivetNodeRegistry,
  type LlmProfile,
  type LlmSkill,
  type ModelConfig,
  type Project,
} from '../src/index.js';

const MODEL = process.env.OMLX_MODEL ?? 'Qwen3.6-35B-A3B-nvfp4';
// Baked interactive default in the saved fixture: the Mac-browser case Peter opens manually — oMLX
// runs on the Mac, so the Mac browser reaches it at localhost. Profiles are keyless (no env var).
const FIXTURE_BASE_URL = 'http://localhost:9090/v1';
// Automation override: VM runs (this headless script, Playwright-in-VM) where `localhost` is the VM,
// not the Mac — set OMLX_BASE_URL=http://host.lima.internal:9090/v1 (or the host LAN IP) to point the
// RUN at the real oMLX while the SAVED fixture keeps the localhost default.
const RUN_BASE_URL = process.env.OMLX_BASE_URL ?? FIXTURE_BASE_URL;

const QUESTION =
  'Should a 3-person startup build its core product in a brand-new programming language? Answer in 2–3 sentences with a clear yes/no position.';
const PERSONA_A =
  'You are Agent A, a bold technical optimist. Argue YES — the startup SHOULD adopt the brand-new language — with one concrete, memorable specific reason. 2–3 sentences. Take a clear stance.';
const PERSONA_B =
  'You are Agent B, a cautious pragmatist. Argue NO — the startup should NOT adopt the brand-new language — with one concrete, memorable specific reason. 2–3 sentences. Take a clear stance.';
const PERSONA_ARBITER =
  'You are an impartial arbiter. Two answers follow, labeled agentA and agentB. Decide which is more compelling. Respond with EXACTLY one token — agentA or agentB — and nothing else.';
const EXPAND_PROMPT =
  'You won the arbitration. Expand your previous answer: add two NEW, specific details that build directly on the exact position and reason you already gave. Do not restate — extend it.';

// --- model-config: a Profile + Skill per agent/arbiter/resume (all oMLX initially) ---------------
function profile(id: string): LlmProfile {
  // customProviderApiKeyEnvVarName: '' → keyless: resolveConfiguredProviderApiKey returns undefined
  // (no env-var coupling), so this runs in the browser executor without seeding any env var. oMLX
  // needs no key.
  return {
    id,
    name: id,
    provider: 'custom',
    customProviderBaseURL: FIXTURE_BASE_URL,
    customProviderApiKeyEnvVarName: '',
    defaultModel: MODEL,
  };
}
function skill(id: string, temperature: number, maxTokens: number): LlmSkill {
  return {
    id,
    name: id,
    base: { temperature, maxTokens, extraBody: { chat_template_kwargs: { enable_thinking: false } } },
  };
}
const modelConfig: ModelConfig = {
  profiles: [profile('profile-agentA'), profile('profile-agentB'), profile('profile-arbiter'), profile('profile-resume')],
  skills: [
    skill('skill-agentA', 0.7, 400),
    skill('skill-agentB', 0.7, 400),
    skill('skill-arbiter', 0, 50),
    skill('skill-resume', 0.6, 600),
  ],
};

// --- graph construction ---------------------------------------------------------------------------
let yCursor = 0;
function node(type: string, id: string, data: Record<string, unknown>, x: number): Record<string, unknown> {
  const base = globalRivetNodeRegistry.createDynamic(type) as { data: Record<string, unknown>; visualData: unknown };
  yCursor += 1;
  return {
    id,
    type,
    title: id,
    data: { ...base.data, ...data },
    visualData: { x, y: (yCursor % 6) * 180, width: 280 },
  };
}
const text = (id: string, t: string, x: number) => node('text', id, { text: t }, x);
const llm = (id: string, prof: string, sk: string, x: number) =>
  node('llmChatV2', id, { llmProfileId: prof, llmSkillId: sk, maxTokens: 1024 }, x);
const conn = (outputNodeId: string, outputId: string, inputNodeId: string, inputId: string) => ({
  outputNodeId,
  outputId,
  inputNodeId,
  inputId,
});

const nodes = [
  text('q', QUESTION, 0),
  text('personaA', PERSONA_A, 0),
  text('personaB', PERSONA_B, 0),
  text('personaArbiter', PERSONA_ARBITER, 0),
  llm('agentA', 'profile-agentA', 'skill-agentA', 320),
  llm('agentB', 'profile-agentB', 'skill-agentB', 320),
  node('setGlobal', 'sgA', { id: 'session-agentA', dataType: 'chat-message[]', useIdInput: false }, 640),
  node('setGlobal', 'sgB', { id: 'session-agentB', dataType: 'chat-message[]', useIdInput: false }, 640),
  node('object', 'answers', { jsonTemplate: '{\n  "agentA": "{{agentA}}",\n  "agentB": "{{agentB}}"\n}' }, 640),
  node('toYaml', 'yaml', {}, 960),
  llm('arbiter', 'profile-arbiter', 'skill-arbiter', 1280),
  node('extractRegex', 'choice', { regex: '(agentA|agentB)', errorOnFailed: true }, 1600),
  text('winnerId', 'session-{{choice}}', 1600),
  node('getGlobal', 'getWinner', { dataType: 'chat-message[]', useIdInput: true, wait: true }, 1920),
  text('expandText', EXPAND_PROMPT, 1920),
  node('assembleMessage', 'expandMsg', { type: 'user' }, 2240),
  node('array', 'resumeMessages', { flatten: true }, 2240),
  llm('resume', 'profile-resume', 'skill-resume', 2560),
  node('graphOutput', 'out_result', { id: 'result', dataType: 'string' }, 2880),
  node('graphOutput', 'out_choice', { id: 'choice', dataType: 'string' }, 2880),
  node('graphOutput', 'out_a', { id: 'agentA_answer', dataType: 'string' }, 2880),
  node('graphOutput', 'out_b', { id: 'agentB_answer', dataType: 'string' }, 2880),
];

const connections = [
  conn('q', 'output', 'agentA', 'prompt'),
  conn('q', 'output', 'agentB', 'prompt'),
  conn('personaA', 'output', 'agentA', 'systemPrompt'),
  conn('personaB', 'output', 'agentB', 'systemPrompt'),
  conn('personaArbiter', 'output', 'arbiter', 'systemPrompt'),
  conn('agentA', 'all-messages', 'sgA', 'value'),
  conn('agentB', 'all-messages', 'sgB', 'value'),
  conn('agentA', 'response', 'answers', 'agentA'),
  conn('agentB', 'response', 'answers', 'agentB'),
  conn('answers', 'output', 'yaml', 'object'),
  conn('yaml', 'yaml', 'arbiter', 'prompt'),
  conn('arbiter', 'response', 'choice', 'input'),
  conn('choice', 'output1', 'winnerId', 'choice'),
  conn('winnerId', 'output', 'getWinner', 'id'),
  conn('getWinner', 'value', 'resumeMessages', 'input1'),
  conn('expandText', 'output', 'expandMsg', 'part1'),
  conn('expandMsg', 'message', 'resumeMessages', 'input2'),
  conn('resumeMessages', 'output', 'resume', 'prompt'),
  conn('resume', 'response', 'out_result', 'value'),
  conn('arbiter', 'response', 'out_choice', 'value'),
  conn('agentA', 'response', 'out_a', 'value'),
  conn('agentB', 'response', 'out_b', 'value'),
];

const graphId = 'arbitration-graph';
const project = {
  metadata: { id: 'arbitration-harness', title: 'Arbitration Harness', description: '', mainGraphId: graphId },
  graphs: {
    [graphId]: { metadata: { id: graphId, name: 'Arbitration', description: '' }, nodes, connections },
  },
  plugins: [],
  modelConfig,
} as unknown as Project;

// --- run + prove ----------------------------------------------------------------------------------
const text2 = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));
const distinctiveWords = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4),
  );
const overlap = (a: string, b: string): number => {
  const wb = distinctiveWords(b);
  return [...distinctiveWords(a)].filter((w) => wb.has(w)).length;
};

async function main(): Promise<void> {
  console.log(`Arbitration harness — live vs oMLX (model ${MODEL}).\n`);
  // Run against RUN_BASE_URL (the saved fixture keeps the localhost default); patch the 4 Profiles.
  const runProject = {
    ...project,
    modelConfig: {
      ...modelConfig,
      profiles: modelConfig.profiles!.map((p) => ({ ...p, customProviderBaseURL: RUN_BASE_URL })),
    },
  } as unknown as Project;
  console.log(`(run base URL: ${RUN_BASE_URL}; saved fixture base URL: ${FIXTURE_BASE_URL})\n`);
  const outputs = await runGraph(runProject, { graph: graphId, registry: globalRivetNodeRegistry });

  const agentA = text2(outputs['agentA_answer']?.value);
  const agentB = text2(outputs['agentB_answer']?.value);
  const choice = text2(outputs['choice']?.value).match(/agentA|agentB/)?.[0] ?? text2(outputs['choice']?.value);
  const resume = text2(outputs['result']?.value);
  const winnerAnswer = choice === 'agentA' ? agentA : agentB;
  const loserAnswer = choice === 'agentA' ? agentB : agentA;

  console.log('AGENT A:', agentA, '\n');
  console.log('AGENT B:', agentB, '\n');
  console.log('ARBITER CHOICE:', choice, '\n');
  console.log('RESUMED (winner expands):', resume, '\n');

  const winOverlap = overlap(resume, winnerAnswer);
  const loseOverlap = overlap(resume, loserAnswer);
  console.log(`CONTEXT-CARRY: resume↔winner distinctive-word overlap = ${winOverlap}, resume↔loser = ${loseOverlap}`);

  let failures = 0;
  const assert = (cond: boolean, msg: string) => {
    console.log(`  ${cond ? '✓' : '✗ FAIL'}: ${msg}`);
    if (!cond) failures += 1;
  };
  assert(agentA.trim().length > 0 && agentB.trim().length > 0, 'both agents answered');
  assert(choice === 'agentA' || choice === 'agentB', `arbiter picked a valid label (got "${choice}")`);
  assert(resume.trim().length > 0, 'the winner resumed and produced an expansion');
  assert(
    winOverlap > loseOverlap,
    `the expansion builds on the WINNER's answer more than the loser's (${winOverlap} > ${loseOverlap}) — session carried`,
  );

  // Serialize the durable project for review (not committed).
  const fixturePath = join(import.meta.dirname, '..', '..', '..', 'ui-testing', 'fixtures', 'arbitration-harness.rivet-project');
  writeFileSync(fixturePath, serializeProject(project) as string, 'utf8');
  console.log(`\nSAVED project → ${fixturePath}`);

  if (failures > 0) {
    console.error(`\nHARNESS FAILED: ${failures} assertion(s).`);
    process.exit(1);
  }
  console.log('\nHARNESS PASSED: ask → both answer → arbiter picks → winner resumes with its prior context.');
}

await main();
