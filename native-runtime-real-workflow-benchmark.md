# Native Runtime Real-Workflow Benchmark

Real checked-in project audit and timing pass for the opt-in `native-fast`
runtime.

## Run

- Date: 2026-05-24
- Commit: `9bbb6918`
- Host: local Windows workstation
- Node: `v22.22.3`
- Rust: `rustc 1.95.0`
- Cargo: `cargo 1.95.0`
- Native worker build: `npm --prefix native-runtime run build:native`
- Benchmark script:
  `yarn workspace @valerypopoff/rivet2-node run bench:native-real-workflows`

Command shape:

```powershell
$env:RIVET_REAL_WORKFLOW_BENCH_ITERATIONS = '100'
$env:RIVET_REAL_WORKFLOW_BENCH_WARMUP_ITERATIONS = '10'
$env:RIVET_REAL_WORKFLOW_BENCH_SAMPLES = '5'
$env:RIVET_REAL_WORKFLOW_BENCH_JSON = '1'
$env:RIVET_NATIVE_RUNTIME_BACKEND = 'rust'
yarn workspace @valerypopoff/rivet2-node run bench:native-real-workflows
```

The script benchmarks the checked-in project files listed in
`packages/node/bench/nativeRealWorkflow.bench.ts`. It first creates a
`native-fast` graph runner and reads its native decision. Graphs that are
already known to fall back are reported with their fallback reason and are not
executed, because many real project graphs call LLMs, read files, use user
input, or perform other side effects. Only non-empty native-eligible graphs are
run and timed.

Projects with external references are reported as `project-has-references`
fallback rows instead of being executed. Native reference resolution is
currently deferred until run time, so this benchmark keeps the real-workflow
audit side-effect-safe until a separate preflight API can classify referenced
projects without running them.

For eligible graphs, the script:

- generates simple sample values for Graph Input nodes;
- checks compatible TypeScript output against native output before timing;
- measures compatible `createGraphRunner(...)`;
- measures `createGraphRunner(..., { runtimeProfile: 'headless-fast' })`;
- measures `createGraphRunner(..., { runtimeProfile: 'native-fast' })`;
- records `nativeBackend`, `nativeUsed`, and speedup versus the fastest
  TypeScript row.

Every matched result row is reported, including missing project files, project
load errors, output parity mismatches, and graph run errors. Those failure rows
must stay visible so the benchmark can act as an equivalence guard, not just a
speed table.

With `RIVET_REAL_WORKFLOW_BENCH_JSON=1`, the script prints a JSON object with
raw per-graph `results` and a deterministic `summary`. The summary includes
status counts, fallback-family counts, normalized fallback blockers, exact
fallback reasons, unsupported node-type counts, and representative
`project#graph` examples. Console mode prints the raw rows plus labeled summary
tables; exact fallback reasons are bounded in console output and complete in the
JSON summary.

## Result Summary

The audit covered 88 graphs from 8 checked-in project files.

| Status                    | Count |
| ------------------------- | ----: |
| Native-eligible and timed |     3 |
| Native fallback/skipped   |    85 |
| Output mismatches         |     0 |
| Run errors                |     0 |

This is the key real-workflow finding: the current native subset works and is
faster on the tiny eligible real graphs, but most real checked-in workflows do
not enter native-fast yet. The limiting factor is eligibility breadth, not Rust
execution speed on the graphs that are already supported.

## Timed Native-Eligible Graphs

All values are mean milliseconds per run. Values in parentheses are standard
deviation across five sample means. Native speedup compares Rust worker time to
the fastest TypeScript row for the same graph.

| Project                                                             | Graph         | Nodes | Compatible TS | Headless-fast TS | Native Rust worker | Rust vs best TS | Native used |
| ------------------------------------------------------------------- | ------------- | ----: | ------------: | ---------------: | -----------------: | --------------: | ----------- |
| `packages/app/src/assets/templates/ai_agent_template.rivet-project` | `Tools/tool1` |     4 | 0.188 (0.013) |    0.118 (0.013) |      0.052 (0.008) |    2.27x faster | true        |
| `packages/app/src/assets/templates/ai_agent_template.rivet-project` | `Tools/tool2` |     4 | 0.141 (0.017) |    0.094 (0.004) |      0.075 (0.005) |    1.25x faster | true        |
| `packages/cli/cli-example.rivet-project`                            | `Passthrough` |     2 | 0.083 (0.010) |    0.062 (0.013) |      0.054 (0.010) |    1.15x faster | true        |

These are very small graphs, so the wins are intentionally treated as
sanity-check evidence only. They prove the real project loader, native
eligibility, output parity check, and Rust worker path work on checked-in
projects. They do not prove broad product value by themselves.

## Fallback Audit

The 85 skipped/fallback graphs were not executed. Their native decisions explain
what blocks real workflows today:

| Fallback family                        | Count | Notes                                                                                                                                                                    |
| -------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project-has-plugins`                  |    31 | App graph-creator and code-node-generator projects use project plugins, so the current conservative gate rejects the entire project.                                     |
| `unsupported-node:*`                   |    42 | Common blockers include Chat, Prompt, Loop Controller, User Input, file/directory nodes, external calls, comments, matching/conditionals, and other non-v1 native nodes. |
| `unsupported-extract-object-path:*`    |     4 | Real graphs use JSONPath features outside the current simple native subset, such as wildcards, filters, and bracket property syntax.                                     |
| `split-run:*`                          |     4 | Split-run graphs remain TypeScript-only.                                                                                                                                 |
| `unsupported-data-type:chat-message:*` |     3 | Chat-message graph boundaries remain TypeScript-only.                                                                                                                    |
| `empty-graph`                          |     1 | Empty graph intentionally excluded from timings.                                                                                                                         |

### Top Normalized Blockers

These rows come from the benchmark's deterministic summary output. They keep
node IDs out of the grouping where possible so the next native tranche can be
chosen by behavior, not by individual graph shape.

| Blocker                                                            | Count | Affected node type  | Representative graphs                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ----: | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project-has-plugins`                                              |    31 |                     | `packages/app/graphs/code-node-generator.rivet-project#Chat`<br>`packages/app/graphs/code-node-generator.rivet-project#Code Node Generator`<br>`packages/app/graphs/code-node-generator.rivet-project#Extract Regex Node Generator`                                                                           |
| `unsupported-node:chat`                                            |    10 | `chat`              | `packages/app/src/assets/templates/mcp_ai_agent_template.rivet-project#tools/reply`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#1. Simple Graph/Simple Graph`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#5. Subgraphs/Subgraphs #0 Main Graph` |
| `unsupported-node:prompt`                                          |     6 | `prompt`            | `examples/rpg/RPG.rivet-project#Initialize Chat`<br>`packages/app/src/assets/templates/ai_agent_template.rivet-project#Tools/reply`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#2. Interpolation/Interpolation`                                                                |
| `unsupported-node:loopController`                                  |     5 | `loopController`    | `examples/rpg/RPG.rivet-project#Main`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#7. Loops/Loops`<br>`rivet.rivet-project#RA - Analyze Until Done`                                                                                                                             |
| `split-run`                                                        |     4 |                     | `packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#6. Splitting/Splitting`<br>`rivet.rivet-project#00 Rivet Analyzer`<br>`rivet.rivet-project#RA - Exec Commands`                                                                                                                        |
| `unsupported-data-type:chat-message`                               |     3 |                     | `rivet.rivet-project#RA - Get Response`<br>`rivet.rivet-project#RA - System Commands`<br>`rivet.rivet-project#RA - System Prompt`                                                                                                                                                                             |
| `unsupported-node:ifElse`                                          |     3 | `ifElse`            | `rivet.rivet-project#Extract List Items`<br>`rivet.rivet-project#RA - Command: RECALL_INFO`<br>`rivet.rivet-project#RA - Exec Command`                                                                                                                                                                        |
| `unsupported-node:if`                                              |     2 | `if`                | `packages/app/src/assets/templates/ai_agent_template.rivet-project#Run Command`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#3. Matching and Conditionals/Matching and Conditionals`                                                                                            |
| `unsupported-node:readDirectory`                                   |     2 | `readDirectory`     | `rivet.rivet-project#List Rivet Files`<br>`rivet.rivet-project#RA - Command: READ_DIRECTORY`                                                                                                                                                                                                                  |
| `unsupported-extract-object-path:$.yamlDocument.names[*]`          |     1 | `extractObjectPath` | `packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#5. Subgraphs/Subgraphs #1 Generate Contract Names`                                                                                                                                                                                    |
| `unsupported-extract-object-path:$.yamlDocument.remainingTasks[*]` |     1 | `extractObjectPath` | `rivet.rivet-project#Execute Task List`                                                                                                                                                                                                                                                                       |
| `unsupported-extract-object-path:$.yamlDocument['last-name']`      |     1 | `extractObjectPath` | `packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#5. Subgraphs/Subgraphs #2 Generate Contract`                                                                                                                                                                                          |

### Candidate Next Tranches

| Candidate                                                   | Why it is interesting                                                                                                                                                        | Caution                                                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reassess `project-has-plugins`                              | It blocks 31 rows before graph-level eligibility can be inspected. If unused project plugins can be ignored safely, real-workflow reach may improve without Rust node work.  | This is a gate-design problem, not a node implementation. Keep the whole-project gate if plugins can alter built-in semantics or graph closure safety.  |
| Simple conditionals: `if`, `ifElse`, `compare`, and `match` | These are deterministic, side-effect-free control/data decisions and appear in checked-in graphs. They are a better first semantic tranche than LLM, file, or loop behavior. | They must exactly preserve control-flow exclusion, false `If` ports, branch outputs, missing inputs, and unsupported settings before becoming eligible. |
| Simple JSONPath expansion for `extractObjectPath`           | Existing native support already handles a narrow static JSONPath subset; bracket properties and simple wildcards are plausible incremental parser work.                      | Keep filter expressions such as `$[?(@.arguments.finished == true)]...` unsupported until JSONPath equivalence is proven.                               |

The practical next bottleneck is visible from this distribution. Native-fast
will not reach many real workflows until the project-plugin gate and selected
cheap/control-flow node families are handled deliberately, with equivalence
tests first.

## Interpretation

The synthetic benchmark still provides the stronger proof that Rust can improve
orchestration-heavy eligible graphs. This real-workflow pass adds a different
truth: in the current checked-in projects, native-fast has very limited reach.

The next useful speed work is therefore not generic Rust optimization. It is an
eligibility expansion plan driven by real fallback reasons:

- decide whether project-level plugin presence should always block native-fast,
  or whether native eligibility can safely ignore unused plugins for built-in
  node-only graphs;
- add equivalence tests before any new native node family;
- prioritize cheap, side-effect-free blockers that appear in real projects;
- keep LLM, file, user-input, arbitrary Code/Expression, and debugger-sensitive
  paths on TypeScript unless they get separate product-level plans.
