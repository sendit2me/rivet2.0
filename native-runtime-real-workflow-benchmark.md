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
fallback rows instead of being executed. That is a benchmark safety guard: the
real-workflow audit does not resolve arbitrary checked-in reference files before
probing eligibility. It is separate from `createGraphRunner(...)`, which can use
its configured `projectReferenceLoader` to classify referenced graph aliases for
native-fast.

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

The audit covered 88 graphs from 8 checked-in project files. After the P8
project-plugin gate reassessment, plugin metadata alone no longer blocks
native-fast. After the P9 Graph Input default-value input-port tranche, a
lightweight one-iteration audit on 2026-05-24 reported:

| Status                    | Count |
| ------------------------- | ----: |
| Native-eligible and timed |     6 |
| Native fallback/skipped   |    82 |
| Output mismatches         |     0 |
| Run errors                |     0 |

The earlier full timing pass in this document used the 100-iteration command
shape and found the first 3 eligible graphs. The P8 audit widened eligibility to
three additional small `graph-creator` graphs; their one-iteration timing values
are useful as eligibility evidence only, not as stable speed measurements. The
P9 audit removed `graph-input-default-port:*` as a blocker, but did not increase
the eligible graph count because the affected real graphs then exposed deeper
unsupported node or text-processing settings.

This is the key real-workflow finding: the current native subset works on the
tiny eligible real graphs, but these rows are too small for stable speed
conclusions and most real checked-in workflows still do not enter native-fast.
The limiting factor is eligibility breadth, not Rust execution speed on the
synthetic orchestration-heavy graphs that are already supported.

## Timed Native-Eligible Graphs

All values are lightweight one-iteration means from the P9 audit. Native speedup
compares Rust worker time to the fastest TypeScript row for the same graph. Use
the higher-iteration command shape before treating any individual row as stable
performance evidence.

| Project                                                             | Graph            | Nodes | Compatible TS | Headless-fast TS | Native Rust worker | Rust vs best TS | Native used |
| ------------------------------------------------------------------- | ---------------- | ----: | ------------: | ---------------: | -----------------: | --------------: | ----------- |
| `packages/app/graphs/graph-creator.rivet-project`                   | `Function: help` |     2 |       0.920ms |          0.536ms |            0.211ms |    2.54x faster | true        |
| `packages/app/graphs/graph-creator.rivet-project`                   | `Function: plan` |     2 |       0.109ms |          0.081ms |            0.146ms |    0.55x slower | true        |
| `packages/app/graphs/graph-creator.rivet-project`                   | `Help`           |     2 |       0.108ms |          0.071ms |            0.101ms |    0.70x slower | true        |
| `packages/app/src/assets/templates/ai_agent_template.rivet-project` | `Tools/tool1`    |     4 |       0.278ms |          0.112ms |            0.073ms |    1.53x faster | true        |
| `packages/app/src/assets/templates/ai_agent_template.rivet-project` | `Tools/tool2`    |     4 |       0.182ms |          0.110ms |            0.069ms |    1.59x faster | true        |
| `packages/cli/cli-example.rivet-project`                            | `Passthrough`    |     2 |       0.100ms |          0.071ms |            0.098ms |    0.72x slower | true        |

These are very small graphs, so the wins are intentionally treated as
sanity-check evidence only. They prove the real project loader, native
eligibility, output parity check, and Rust worker path work on checked-in
projects. They do not prove broad product value by themselves.

## Fallback Audit

The 82 skipped/fallback graphs were not executed. Their native decisions explain
what blocks real workflows today:

| Fallback family                     | Count | Notes                                                                                                                                  |
| ----------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupported-node:*`                |    63 | Common blockers include Chat, external calls, Prompt, Loop Controller, comments, matching/conditionals, and other non-v1 native nodes. |
| `split-run:*`                       |     7 | Split-run graphs remain TypeScript-only.                                                                                               |
| `unsupported-data-type:*`           |     5 | Chat-message graph boundaries remain TypeScript-only, including singular and array data types.                                         |
| `unsupported-extract-object-path:*` |     5 | Real graphs use JSONPath features outside the current simple native subset, such as wildcards, filters, and bracket property syntax.   |
| `empty-graph`                       |     1 | Empty graph intentionally excluded from timings.                                                                                       |
| `unsupported-text-processing:*`     |     1 | One graph now reaches a Text processing pipe outside the native parity subset after the Graph Input port blocker was removed.          |

### Top Normalized Blockers

These rows come from the benchmark's deterministic summary output. They keep
node IDs out of the grouping where possible so the next native tranche can be
chosen by behavior, not by individual graph shape.

| Blocker                                | Count | Affected node type | Representative graphs                                                                                                                                                                                                                                                                             |
| -------------------------------------- | ----: | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupported-node:chat`                |    12 | `chat`             | `packages/app/graphs/graph-creator.rivet-project#Function: createNode`<br>`packages/app/graphs/graph-creator.rivet-project#Function: readNodeSourceCode`<br>`packages/app/src/assets/templates/mcp_ai_agent_template.rivet-project#tools/reply`                                                   |
| `unsupported-node:externalCall`        |     9 | `externalCall`     | `packages/app/graphs/graph-creator.rivet-project#Function: addNodeData`<br>`packages/app/graphs/graph-creator.rivet-project#Function: connectNodes`<br>`packages/app/graphs/graph-creator.rivet-project#Function: deleteNode`                                                                     |
| `split-run`                            |     7 |                    | `packages/app/graphs/graph-creator.rivet-project#Load Node Documentation Files`<br>`packages/app/graphs/graph-creator.rivet-project#Load Node Source Code`<br>`packages/app/graphs/graph-creator.rivet-project#Loop`                                                                              |
| `unsupported-node:prompt`              |     6 | `prompt`           | `examples/rpg/RPG.rivet-project#Initialize Chat`<br>`packages/app/src/assets/templates/ai_agent_template.rivet-project#Tools/reply`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#2. Interpolation/Interpolation`                                                    |
| `unsupported-node:loopController`      |     5 | `loopController`   | `examples/rpg/RPG.rivet-project#Main`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#7. Loops/Loops`<br>`rivet.rivet-project#RA - Analyze Until Done`                                                                                                                 |
| `unsupported-data-type:chat-message`   |     3 |                    | `rivet.rivet-project#RA - Get Response`<br>`rivet.rivet-project#RA - System Commands`<br>`rivet.rivet-project#RA - System Prompt`                                                                                                                                                                 |
| `unsupported-node:comment`             |     3 | `comment`          | `examples/rpg/RPG.rivet-project#Loop Iteration`<br>`packages/app/graphs/code-node-generator.rivet-project#Extract Regex Node Generator`<br>`packages/app/graphs/code-node-generator.rivet-project#Structured Outputs JSON Schema Generator`                                                       |
| `unsupported-node:if`                  |     3 | `if`               | `packages/app/graphs/code-node-generator.rivet-project#Code Node Generator`<br>`packages/app/src/assets/templates/ai_agent_template.rivet-project#Run Command`<br>`packages/app/src/assets/tutorials/documentation-tutorial.rivet-project#3. Matching and Conditionals/Matching and Conditionals` |
| `unsupported-node:ifElse`              |     3 | `ifElse`           | `rivet.rivet-project#Extract List Items`<br>`rivet.rivet-project#RA - Command: RECALL_INFO`<br>`rivet.rivet-project#RA - Exec Command`                                                                                                                                                            |
| `unsupported-data-type:chat-message[]` |     2 |                    | `packages/app/graphs/code-node-generator.rivet-project#Chat`<br>`packages/app/graphs/code-node-generator.rivet-project#Prompt Node Generator`                                                                                                                                                     |
| `unsupported-node:gptFunction`         |     2 | `gptFunction`      | `packages/app/graphs/graph-creator.rivet-project#All Functions`<br>`packages/app/src/assets/templates/ai_agent_template.rivet-project#Tools`                                                                                                                                                      |
| `unsupported-node:match`               |     2 | `match`            | `packages/app/graphs/graph-creator.rivet-project#Chat`<br>`packages/app/src/assets/templates/mcp_ai_agent_template.rivet-project#Run Function`                                                                                                                                                    |

### Candidate Next Tranches

| Candidate                                                   | Why it is interesting                                                                                                                                                        | Caution                                                                                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simple conditionals: `if`, `ifElse`, `compare`, and `match` | These are deterministic, side-effect-free control/data decisions and appear in checked-in graphs. They are a better first semantic tranche than LLM, file, or loop behavior. | They must exactly preserve control-flow exclusion, false `If` ports, branch outputs, missing inputs, and unsupported settings before becoming eligible. |
| Simple JSONPath expansion for `extractObjectPath`           | Existing native support already handles a narrow static JSONPath subset; bracket properties, simple wildcards, and a few real paths appear in checked-in graphs.             | Keep filter expressions such as `$[?(@.arguments.finished == true)]...` unsupported until JSONPath equivalence is proven.                               |
| Text processing `quote` parity                              | The P9 audit exposed one real checked-in graph blocked by `unsupported-text-processing:quote` after Graph Input default ports became eligible.                               | Add exact TypeScript/native fixtures first; processing pipes are small, but string escaping semantics are easy to drift.                                |

The practical next bottleneck is visible from this distribution. Native-fast
will not reach many real workflows until selected cheap/control-flow node
families are handled deliberately, with equivalence tests first.

## Interpretation

The synthetic benchmark still provides the stronger proof that Rust can improve
orchestration-heavy eligible graphs. This real-workflow pass adds a different
truth: in the current checked-in projects, native-fast has very limited reach.

The next useful speed work is therefore not generic Rust optimization. It is an
eligibility expansion plan driven by real fallback reasons:

- keep plugin/custom nodes on TypeScript fallback while allowing plugin-bearing
  projects whose selected graph closure uses only supported built-ins;
- add equivalence tests before any new native node family;
- prioritize cheap, side-effect-free blockers that appear in real projects;
- keep LLM, file, user-input, arbitrary Code/Expression, and debugger-sensitive
  paths on TypeScript unless they get separate product-level plans.
