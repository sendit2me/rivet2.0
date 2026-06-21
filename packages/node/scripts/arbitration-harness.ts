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

// The base URL is a PLACEHOLDER baked in the fixture and patched at load (same rule as the model
// names) — the saved fixture is a pure, machine-independent template. The run targets OMLX_BASE_URL
// (e.g. http://host.lima.internal:9090/v1 in the VM), defaulting to localhost for a Mac-local run.
const FIXTURE_BASE_URL = 'placeholder-base-url';
const RUN_BASE_URL = process.env.OMLX_BASE_URL ?? 'http://localhost:9090/v1';

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

// --- model-config: a Profile + Skill per agent/arbiter/resume -------------------------------------
// Model names are ENVIRONMENT INVENTORY, not constants (same class as the base URL): the fixture
// carries placeholders, and the run patches them at load — no coupling to one machine's models.
//   - Two-model proof (the headline): set OMLX_MODEL_A and OMLX_MODEL_B to two DISTINCT models that
//     your oMLX has loaded *and can co-resident* (the only place that knows memory limits is the
//     operator — naive "first two from /v1/models" can pick two that don't co-fit). agentA/agentB get
//     them, so the dynamic-winner-model follow is observable.
//   - Zero-config fallback: with the env unset, discover the first model actually loaded (GET
//     /v1/models) and use it for both agents — they then differ on skill TEMPERATURE only, and the
//     follow is proven on that param. Always runs (one model fits).
// The resume node's Profile + Skill are input-driven from the arbiter's choice; profile-resume reuses
// agentA's model and is NEVER resolved (the ports are always connected) — its model is irrelevant.
const PLACEHOLDER_MODEL_A = 'placeholder-model-a';
const PLACEHOLDER_MODEL_B = 'placeholder-model-b';

async function resolveModels(baseURL: string): Promise<{ modelA: string; modelB: string; distinct: boolean }> {
  const envA = process.env.OMLX_MODEL_A?.trim();
  const envB = process.env.OMLX_MODEL_B?.trim();
  if (envA && envB) {
    return { modelA: envA, modelB: envB, distinct: envA !== envB };
  }
  const res = await fetch(`${baseURL}/models`);
  const json = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = [...new Set((json.data ?? []).map((m) => m.id).filter((x): x is string => !!x))];
  if (ids.length === 0) {
    throw new Error(`No models loaded at ${baseURL}/models`);
  }
  return { modelA: ids[0]!, modelB: ids[0]!, distinct: false };
}

function profile(id: string, model: string): LlmProfile {
  // customProviderApiKeyEnvVarName: '' → keyless: resolveConfiguredProviderApiKey returns undefined
  // (no env-var coupling), so this runs in the browser executor without seeding any env var. oMLX
  // needs no key.
  return {
    id,
    name: id,
    provider: 'custom',
    customProviderBaseURL: FIXTURE_BASE_URL,
    customProviderApiKeyEnvVarName: '',
    defaultModel: model,
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
  profiles: [
    profile('profile-agentA', PLACEHOLDER_MODEL_A),
    profile('profile-agentB', PLACEHOLDER_MODEL_B),
    profile('profile-arbiter', PLACEHOLDER_MODEL_A),
    profile('profile-resume', PLACEHOLDER_MODEL_A), // never resolved; reuses A
  ],
  skills: [
    skill('skill-agentA', 0.2, 400),
    skill('skill-agentB', 0.8, 400),
    skill('skill-arbiter', 0, 50),
    skill('skill-resume', 0.5, 600),
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
  // OMLX_SWAP_SIDES=1 gives agentA the pragmatist persona (which the arbiter favours) so the winner
  // LABEL flips to agentA — exercising the resume → profile-agentA branch. Saved fixture keeps the
  // natural sides (env-only, like OMLX_BASE_URL).
  text('personaA', process.env.OMLX_SWAP_SIDES === '1' ? PERSONA_B : PERSONA_A, 0),
  text('personaB', process.env.OMLX_SWAP_SIDES === '1' ? PERSONA_A : PERSONA_B, 0),
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
  // The winner's Profile/Skill ids, built from the arbiter's choice (same shape as session-{{choice}}).
  text('profileIdText', 'profile-{{choice}}', 1920),
  text('skillIdText', 'skill-{{choice}}', 1920),
  // The resume node: Profile + Skill are INPUT-DRIVEN (toggles on) → it follows the winner's model.
  node(
    'llmChatV2',
    'resume',
    {
      llmProfileId: 'profile-resume',
      llmSkillId: 'skill-resume',
      maxTokens: 1024,
      useLlmProfileIdInput: true,
      useLlmSkillIdInput: true,
    },
    2560,
  ),
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
  // The arbiter's choice → the winner's Profile/Skill ids → the resume's input-driven selectors.
  conn('choice', 'output1', 'profileIdText', 'choice'),
  conn('choice', 'output1', 'skillIdText', 'choice'),
  conn('profileIdText', 'output', 'resume', 'llmProfileId'),
  conn('skillIdText', 'output', 'resume', 'llmSkillId'),
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

// Capture the actual oMLX requests so we can read each node's RESOLVED model/temperature off the wire
// (the strongest proof the resume followed the winner — not a re-run of the resolver). The resume's
// request is the one whose messages contain the expand turn.
interface CapturedRequest {
  model?: string;
  temperature?: number;
  isResume: boolean;
  messagesText?: string;
}
const captured: CapturedRequest[] = [];
function installFetchCapture(): void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      let bodyText: string | undefined;
      if (typeof init?.body === 'string') {
        bodyText = init.body;
      } else if (input instanceof Request) {
        bodyText = await input.clone().text().catch(() => undefined);
      }
      if (url.includes('/chat/completions') && bodyText) {
        const body = JSON.parse(bodyText) as { model?: string; temperature?: number; messages?: unknown };
        const messagesText = JSON.stringify(body.messages ?? '');
        captured.push({
          model: body.model,
          temperature: body.temperature,
          isResume: messagesText.includes('You won the arbitration'),
          messagesText,
        });
      }
    } catch {
      /* never let capture break the request */
    }
    return orig(input, init);
  }) as typeof fetch;
}

async function main(): Promise<void> {
  installFetchCapture();
  // Patch at load (like the base URL): discover the loaded models and swap the placeholders. The saved
  // fixture keeps the localhost base URL + placeholder model names — no coupling to one machine.
  const { modelA, modelB, distinct } = await resolveModels(RUN_BASE_URL);
  const patchModel = (m?: string) =>
    m === PLACEHOLDER_MODEL_A ? modelA : m === PLACEHOLDER_MODEL_B ? modelB : m;
  console.log(
    `Arbitration harness — live vs oMLX. run base URL=${RUN_BASE_URL}; agentA=${modelA}, agentB=${modelB}` +
      `${distinct ? '' : ' (only one model loaded — agents differ on skill temperature only)'}.\n`,
  );
  const runProject = {
    ...project,
    modelConfig: {
      ...modelConfig,
      profiles: modelConfig.profiles!.map((p) => ({
        ...p,
        customProviderBaseURL: RUN_BASE_URL,
        defaultModel: patchModel(p.defaultModel),
      })),
    },
  } as unknown as Project;
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

  // Rigorous, deterministic session-carry proof (not a fuzzy word overlap, and not a single shared
  // token): the resume's actual request context contains a verbatim multi-word SLICE of the WINNER's
  // answer (GetGlobal returned the winner's messages) and not of the loser's. Normalize both sides so
  // JSON-escaping/whitespace don't matter; take the slice mid-answer (past the shared question text).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const midSlice = (s: string) => {
    const n = norm(s);
    return n.slice(Math.floor(n.length * 0.35), Math.floor(n.length * 0.35) + 30);
  };
  const resumeReq = captured.find((r) => r.isResume);
  const resumeContext = norm(resumeReq?.messagesText ?? '');
  const winnerSlice = midSlice(winnerAnswer);
  const loserSlice = midSlice(loserAnswer);
  console.log(
    `CONTEXT-CARRY: winner slice "…${winnerSlice}…" in resume context=${resumeContext.includes(winnerSlice)}; ` +
      `loser slice "…${loserSlice}…" present=${resumeContext.includes(loserSlice)}`,
  );

  let failures = 0;
  const assert = (cond: boolean, msg: string) => {
    console.log(`  ${cond ? '✓' : '✗ FAIL'}: ${msg}`);
    if (!cond) failures += 1;
  };
  assert(agentA.trim().length > 0 && agentB.trim().length > 0, 'both agents answered');
  assert(choice === 'agentA' || choice === 'agentB', `arbiter picked a valid label (got "${choice}")`);
  assert(resume.trim().length > 0, 'the winner resumed and produced an expansion');
  assert(
    winnerSlice.length > 10 && resumeContext.includes(winnerSlice),
    `the resume's context contains the WINNER's answer (verbatim slice) — the winner's session was carried`,
  );
  assert(
    loserSlice.length <= 10 || !resumeContext.includes(loserSlice),
    `the resume's context excludes the loser's answer (verbatim slice) — only the winner's session`,
  );

  // --- HEADLINE: dynamic-winner-model follow (the "After" proof) ---
  const winnerModel = choice === 'agentA' ? modelA : modelB;
  const loserModel = choice === 'agentA' ? modelB : modelA;
  const winnerTemp = choice === 'agentA' ? 0.2 : 0.8;
  console.log('\nWIRE CAPTURE (resolved per node, off the oMLX request):');
  for (const r of captured) {
    console.log(`  ${r.isResume ? 'RESUME ' : 'agent/arbiter'} → model=${r.model}, temperature=${r.temperature}`);
  }
  console.log(
    `\nDYNAMIC-WINNER-MODEL: winner=${choice}; winner model=${winnerModel} (temp ${winnerTemp}); ` +
      `resume resolved model=${resumeReq?.model} (temp ${resumeReq?.temperature}); static profile-resume skill temp=0.5`,
  );
  assert(resumeReq != null, 'the resume node issued a request (captured off the wire)');
  // The skill follow holds regardless of inventory (skill temps are proof params, not env config): a
  // static profile-resume would force temp 0.5; the resume instead resolved the winner's skill temp.
  assert(
    resumeReq?.temperature === winnerTemp,
    `the resume resolved the WINNER's skill temperature (${winnerTemp}, not the static profile-resume 0.5) — input-driven`,
  );
  if (distinct) {
    // Two distinct models loaded → the model follow is observable too (the headline).
    assert(resumeReq?.model === winnerModel, `the resume ran the WINNER's model (${winnerModel}), input-driven by the choice`);
    assert(resumeReq?.model !== loserModel, `the resume did NOT run the loser's model (${loserModel})`);
  } else {
    console.log('  ⓘ only one model loaded — model follow not observable; the skill-temperature follow above stands.');
  }

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
