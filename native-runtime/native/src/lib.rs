use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Number, Value};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::io::{self, BufRead, Write};
use std::time::Instant;

pub type DataValueMap = BTreeMap<String, DataValue>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DataValue {
    #[serde(rename = "type")]
    pub data_type: String,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_value",
        skip_serializing_if = "Option::is_none"
    )]
    pub value: Option<Value>,
}

fn deserialize_optional_value<'de, D>(deserializer: D) -> Result<Option<Value>, D::Error>
where
    D: Deserializer<'de>,
{
    Value::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRuntimeCreateRequest {
    pub graph_id: String,
    pub graphs: Vec<NativeGraphIr>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeGraphIr {
    pub connections: Vec<NativeConnectionIr>,
    pub graph_id: String,
    pub nodes: Vec<NativeNodeIr>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeConnectionIr {
    pub input_id: String,
    pub input_node_id: String,
    pub output_id: String,
    pub output_node_id: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type")]
pub enum NativeNodeIr {
    #[serde(rename = "graphInput", rename_all = "camelCase")]
    GraphInput {
        data_type: String,
        #[serde(default)]
        default_value: Option<Value>,
        id: String,
        input_id: String,
    },
    #[serde(rename = "text", rename_all = "camelCase")]
    Text {
        id: String,
        normalize_line_endings: bool,
        template: String,
    },
    #[serde(rename = "join", rename_all = "camelCase")]
    Join {
        flatten: bool,
        id: String,
        join_string: String,
    },
    #[serde(rename = "coalesce", rename_all = "camelCase")]
    Coalesce {
        id: String,
        #[serde(default)]
        ignore_null: bool,
        #[serde(default)]
        ignore_undefined: bool,
    },
    #[serde(rename = "destructure", rename_all = "camelCase")]
    Destructure {
        id: String,
        paths: Vec<NativeDestructurePath>,
    },
    #[serde(rename = "object", rename_all = "camelCase")]
    Object { id: String, json_template: String },
    #[serde(rename = "extractObjectPath", rename_all = "camelCase")]
    ExtractObjectPath { id: String, path: String },
    #[serde(rename = "graphOutput", rename_all = "camelCase")]
    GraphOutput {
        data_type: String,
        id: String,
        output_id: String,
    },
    #[serde(rename = "subGraph", rename_all = "camelCase")]
    SubGraph {
        graph_id: String,
        id: String,
        #[serde(default)]
        input_data: Option<DataValueMap>,
    },
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDestructurePath {
    pub output_id: String,
    pub path: String,
}

impl NativeNodeIr {
    fn id(&self) -> &str {
        match self {
            NativeNodeIr::GraphInput { id, .. }
            | NativeNodeIr::Text { id, .. }
            | NativeNodeIr::Join { id, .. }
            | NativeNodeIr::Coalesce { id, .. }
            | NativeNodeIr::Destructure { id, .. }
            | NativeNodeIr::Object { id, .. }
            | NativeNodeIr::ExtractObjectPath { id, .. }
            | NativeNodeIr::GraphOutput { id, .. }
            | NativeNodeIr::SubGraph { id, .. } => id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeRuntimeDecision {
    pub supported: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct NativeRunnerPlan {
    graphs: HashMap<String, PreparedGraph>,
    root_graph_id: String,
}

#[derive(Debug, Clone)]
struct PreparedGraph {
    dependencies_by_node_id: HashMap<String, HashSet<String>>,
    dependents_by_node_id: HashMap<String, Vec<String>>,
    graph_id: String,
    incoming_by_node_id: HashMap<String, Vec<NativeConnectionIr>>,
    nodes: Vec<NativeNodeIr>,
    nodes_by_id: HashMap<String, usize>,
    ready_node_ids: Vec<String>,
}

pub fn unavailable_decision() -> NativeRuntimeDecision {
    NativeRuntimeDecision {
        supported: false,
        reason: Some(
            "native runtime execution is not enabled until benchmark gates pass".to_string(),
        ),
    }
}

pub fn prepare_runner(request: NativeRuntimeCreateRequest) -> Result<NativeRunnerPlan, String> {
    let mut graphs = HashMap::new();

    for graph in request.graphs {
        let prepared = prepare_graph(graph)?;
        if graphs.contains_key(&prepared.graph_id) {
            return Err(format!("duplicate-graph:{}", prepared.graph_id));
        }

        graphs.insert(prepared.graph_id.clone(), prepared);
    }

    if !graphs.contains_key(&request.graph_id) {
        return Err(format!("missing-root-graph:{}", request.graph_id));
    }

    Ok(NativeRunnerPlan {
        graphs,
        root_graph_id: request.graph_id,
    })
}

pub fn run_prepared_graph(
    plan: &NativeRunnerPlan,
    inputs: DataValueMap,
    context: DataValueMap,
) -> Result<DataValueMap, String> {
    run_graph(&plan.graphs, &plan.root_graph_id, inputs, &context)
}

fn prepare_graph(graph: NativeGraphIr) -> Result<PreparedGraph, String> {
    let mut nodes_by_id = HashMap::new();
    let mut incoming_by_node_id = HashMap::new();
    let mut dependencies_by_node_id = HashMap::new();
    let mut dependents_by_node_id = HashMap::new();

    for (index, node) in graph.nodes.iter().enumerate() {
        validate_node(&graph.graph_id, node)?;

        let node_id = node.id();
        if nodes_by_id.contains_key(node_id) {
            return Err(format!("duplicate-node:{}:{}", graph.graph_id, node_id));
        }

        nodes_by_id.insert(node_id.to_string(), index);
        incoming_by_node_id.insert(node_id.to_string(), Vec::new());
        dependencies_by_node_id.insert(node_id.to_string(), HashSet::new());
        dependents_by_node_id.insert(node_id.to_string(), Vec::new());
    }

    for connection in graph.connections {
        if !nodes_by_id.contains_key(&connection.output_node_id)
            || !nodes_by_id.contains_key(&connection.input_node_id)
        {
            return Err(format!("stale-connection:{}", graph.graph_id));
        }

        incoming_by_node_id
            .get_mut(&connection.input_node_id)
            .expect("connection input was validated")
            .push(connection.clone());

        if connection.output_node_id != connection.input_node_id {
            dependencies_by_node_id
                .get_mut(&connection.input_node_id)
                .expect("connection input was validated")
                .insert(connection.output_node_id.clone());
            let dependents = dependents_by_node_id
                .get_mut(&connection.output_node_id)
                .expect("connection output was validated");
            if !dependents.contains(&connection.input_node_id) {
                dependents.push(connection.input_node_id.clone());
            }
        }
    }

    for node in &graph.nodes {
        if matches!(
            node,
            NativeNodeIr::Destructure { .. } | NativeNodeIr::ExtractObjectPath { .. }
        ) {
            let id = node.id();
            let has_object_input = incoming_by_node_id.get(id).is_some_and(|connections| {
                connections
                    .iter()
                    .any(|connection| connection.input_id == "object")
            });
            if !has_object_input {
                return Err(format!(
                    "missing-required-input:{}:{}:object",
                    graph.graph_id, id
                ));
            }
        }
    }

    let ready_node_ids = graph
        .nodes
        .iter()
        .filter(|node| {
            dependencies_by_node_id
                .get(node.id())
                .is_some_and(HashSet::is_empty)
        })
        .map(|node| node.id().to_string())
        .collect();

    Ok(PreparedGraph {
        dependencies_by_node_id,
        dependents_by_node_id,
        graph_id: graph.graph_id,
        incoming_by_node_id,
        nodes: graph.nodes,
        nodes_by_id,
        ready_node_ids,
    })
}

fn validate_node(graph_id: &str, node: &NativeNodeIr) -> Result<(), String> {
    match node {
        NativeNodeIr::Destructure { id, paths } => {
            for selection in paths {
                if selection.output_id.is_empty()
                    || parse_simple_json_path(&selection.path).is_none()
                {
                    return Err(format!("invalid-node:{graph_id}:destructure:{id}"));
                }
            }
        }
        NativeNodeIr::ExtractObjectPath { id, path } if parse_simple_json_path(path).is_none() => {
            return Err(format!("invalid-node:{graph_id}:extractObjectPath:{id}"));
        }
        _ => {}
    }

    Ok(())
}

fn run_graph(
    graphs: &HashMap<String, PreparedGraph>,
    graph_id: &str,
    inputs: DataValueMap,
    context: &DataValueMap,
) -> Result<DataValueMap, String> {
    let graph = graphs
        .get(graph_id)
        .ok_or_else(|| format!("Native graph {graph_id} is not loaded."))?;
    let mut outputs_by_node_id: HashMap<String, DataValueMap> = HashMap::new();
    let mut graph_inputs = DataValueMap::new();
    let mut graph_outputs = DataValueMap::new();
    let mut remaining_dependencies = graph.dependencies_by_node_id.clone();
    let mut ready_node_ids: VecDeque<String> = graph.ready_node_ids.iter().cloned().collect();

    while let Some(node_id) = ready_node_ids.pop_front() {
        let node_index = graph
            .nodes_by_id
            .get(&node_id)
            .ok_or_else(|| format!("Native graph {} has a missing node index.", graph.graph_id))?;
        let node = graph
            .nodes
            .get(*node_index)
            .ok_or_else(|| format!("Native graph {} has a stale node index.", graph.graph_id))?;
        let incoming = graph
            .incoming_by_node_id
            .get(&node_id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let node_inputs = resolve_node_inputs(incoming, &outputs_by_node_id);
        let node_outputs = run_node(
            node,
            NodeRunState {
                context,
                graph_inputs: &mut graph_inputs,
                graph_outputs: &mut graph_outputs,
                graphs,
                inputs: &inputs,
                node_inputs,
            },
        )?;

        outputs_by_node_id.insert(node_id.clone(), node_outputs);

        if let Some(dependents) = graph.dependents_by_node_id.get(&node_id) {
            for dependent_id in dependents {
                let remaining = remaining_dependencies
                    .get_mut(dependent_id)
                    .ok_or_else(|| {
                        format!("Native graph {} has a stale dependent.", graph.graph_id)
                    })?;
                remaining.remove(&node_id);
                if remaining.is_empty() {
                    ready_node_ids.push_back(dependent_id.clone());
                }
            }
        }
    }

    if outputs_by_node_id.len() != graph.nodes.len() {
        return Err(format!(
            "Native graph {} did not process every node.",
            graph.graph_id
        ));
    }

    Ok(graph_outputs)
}

struct NodeRunState<'a> {
    context: &'a DataValueMap,
    graph_inputs: &'a mut DataValueMap,
    graph_outputs: &'a mut DataValueMap,
    graphs: &'a HashMap<String, PreparedGraph>,
    inputs: &'a DataValueMap,
    node_inputs: DataValueMap,
}

fn run_node(node: &NativeNodeIr, state: NodeRunState<'_>) -> Result<DataValueMap, String> {
    match node {
        NativeNodeIr::GraphInput {
            data_type,
            default_value,
            input_id,
            ..
        } => Ok(run_graph_input_node(
            data_type,
            default_value.as_ref(),
            input_id,
            state,
        )),
        NativeNodeIr::Text {
            normalize_line_endings,
            template,
            ..
        } => Ok(run_text_node(template, *normalize_line_endings, state)),
        NativeNodeIr::Join {
            flatten,
            join_string,
            ..
        } => Ok(run_join_node(*flatten, join_string, state)),
        NativeNodeIr::Coalesce {
            ignore_null,
            ignore_undefined,
            ..
        } => Ok(run_coalesce_node(*ignore_null, *ignore_undefined, state)),
        NativeNodeIr::Destructure { paths, .. } => Ok(run_destructure_node(paths, state)),
        NativeNodeIr::Object { json_template, .. } => run_object_node(json_template, state),
        NativeNodeIr::ExtractObjectPath { path, .. } => {
            Ok(run_extract_object_path_node(path, state))
        }
        NativeNodeIr::GraphOutput { output_id, .. } => Ok(run_graph_output_node(output_id, state)),
        NativeNodeIr::SubGraph {
            graph_id,
            input_data,
            ..
        } => run_subgraph_node(graph_id, input_data.as_ref(), state),
    }
}

fn run_graph_input_node(
    data_type: &str,
    default_value: Option<&Value>,
    input_id: &str,
    state: NodeRunState<'_>,
) -> DataValueMap {
    let mut input_value = state
        .inputs
        .get(input_id)
        .and_then(|input| coerce_data_value(input, data_type));

    if is_nullish(input_value.as_ref()) {
        let default_data_value = infer_data_value(default_value.cloned());
        let default_coerced = coerce_data_value(&default_data_value, data_type);
        input_value = if is_truthy_value(default_coerced.as_ref()) {
            default_coerced
        } else {
            get_default_value(data_type)
        };
    }

    let value = DataValue {
        data_type: data_type.to_string(),
        value: input_value,
    };
    state
        .graph_inputs
        .insert(input_id.to_string(), value.clone());

    BTreeMap::from([("data".to_string(), value)])
}

fn run_text_node(
    template: &str,
    normalize_line_endings: bool,
    state: NodeRunState<'_>,
) -> DataValueMap {
    let variables = state
        .node_inputs
        .iter()
        .map(|(key, value)| {
            (
                key.clone(),
                coerce_data_value(value, "string")
                    .and_then(|value| value.as_str().map(ToString::to_string))
                    .unwrap_or_default(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut output = interpolate(template, &variables, state.graph_inputs, state.context);

    if normalize_line_endings {
        output = output.replace("\r\n", "\n").replace('\r', "\n");
    }

    BTreeMap::from([(
        "output".to_string(),
        DataValue {
            data_type: "string".to_string(),
            value: Some(Value::String(output)),
        },
    )])
}

fn run_join_node(flatten: bool, join_string: &str, state: NodeRunState<'_>) -> DataValueMap {
    let input_key_count = state
        .node_inputs
        .keys()
        .filter(|key| key.starts_with("input"))
        .count();
    let mut input_value_strings = Vec::new();

    for index in 1..=input_key_count {
        let input_key = format!("input{index}");
        let Some(input_value) = state.node_inputs.get(&input_key) else {
            continue;
        };

        if is_array_data_value(input_value) && flatten {
            let scalar_type = input_value
                .data_type
                .strip_suffix("[]")
                .unwrap_or("any")
                .to_string();
            if let Some(Value::Array(values)) = &input_value.value {
                for value in values {
                    let value = DataValue {
                        data_type: scalar_type.clone(),
                        value: Some(value.clone()),
                    };
                    input_value_strings.push(
                        coerce_data_value(&value, "string")
                            .and_then(string_value)
                            .unwrap_or_default(),
                    );
                }
            }
        } else if is_truthy_data_value(input_value) {
            input_value_strings.push(
                coerce_data_value(input_value, "string")
                    .and_then(string_value)
                    .unwrap_or_default(),
            );
        }
    }

    BTreeMap::from([(
        "output".to_string(),
        DataValue {
            data_type: "string".to_string(),
            value: Some(Value::String(
                input_value_strings.join(&handle_escape_characters(join_string)),
            )),
        },
    )])
}

fn run_coalesce_node(
    ignore_null: bool,
    ignore_undefined: bool,
    state: NodeRunState<'_>,
) -> DataValueMap {
    if state
        .node_inputs
        .get("conditional")
        .is_some_and(|value| value.data_type == "control-flow-excluded")
    {
        return coalesce_excluded_output();
    }

    let input_key_count = state
        .node_inputs
        .keys()
        .filter_map(|key| dynamic_input_number(key))
        .max()
        .unwrap_or(0);

    for index in 1..=input_key_count {
        let input_key = format!("input{index}");
        let Some(input_value) = state.node_inputs.get(&input_key) else {
            continue;
        };

        if input_value.data_type != "control-flow-excluded"
            && !should_skip_coalesce_input_value(input_value, ignore_null, ignore_undefined)
        {
            return BTreeMap::from([("output".to_string(), input_value.clone())]);
        }
    }

    coalesce_excluded_output()
}

fn run_destructure_node(paths: &[NativeDestructurePath], state: NodeRunState<'_>) -> DataValueMap {
    if state
        .node_inputs
        .get("object")
        .is_some_and(|value| value.data_type == "control-flow-excluded")
    {
        return paths
            .iter()
            .map(|selection| {
                (
                    selection.output_id.clone(),
                    DataValue {
                        data_type: "control-flow-excluded".to_string(),
                        value: None,
                    },
                )
            })
            .collect();
    }

    let object_value = state
        .node_inputs
        .get("object")
        .and_then(|value| coerce_data_value(value, "object"))
        .unwrap_or(Value::Null);

    paths
        .iter()
        .map(|selection| {
            (
                selection.output_id.clone(),
                DataValue {
                    data_type: "any".to_string(),
                    value: get_simple_json_path_value(&object_value, &selection.path),
                },
            )
        })
        .collect()
}

fn run_object_node(json_template: &str, state: NodeRunState<'_>) -> Result<DataValueMap, String> {
    if state
        .node_inputs
        .values()
        .any(|value| value.data_type == "control-flow-excluded")
    {
        return Ok(BTreeMap::from([(
            "output".to_string(),
            DataValue {
                data_type: "control-flow-excluded".to_string(),
                value: None,
            },
        )]));
    }

    let interpolated = interpolate_json_template(
        json_template,
        &state.node_inputs,
        state.graph_inputs,
        state.context,
    );
    let output_value = serde_json::from_str::<Value>(&interpolated)
        .map_err(|error| format!("object-node-json-parse-failed:{error}"))?;
    let data_type = if output_value.is_array() {
        "object[]"
    } else {
        "object"
    };

    Ok(BTreeMap::from([(
        "output".to_string(),
        DataValue {
            data_type: data_type.to_string(),
            value: Some(output_value),
        },
    )]))
}

fn run_extract_object_path_node(path: &str, state: NodeRunState<'_>) -> DataValueMap {
    if state
        .node_inputs
        .get("object")
        .is_some_and(|value| value.data_type == "control-flow-excluded")
    {
        return BTreeMap::from([
            (
                "all_matches".to_string(),
                DataValue {
                    data_type: "control-flow-excluded".to_string(),
                    value: None,
                },
            ),
            (
                "match".to_string(),
                DataValue {
                    data_type: "control-flow-excluded".to_string(),
                    value: None,
                },
            ),
        ]);
    }

    let object_value = state
        .node_inputs
        .get("object")
        .and_then(|value| coerce_data_value(value, "object"))
        .unwrap_or(Value::Null);

    let Some(match_value) = get_simple_json_path_value(&object_value, path) else {
        return BTreeMap::from([
            (
                "all_matches".to_string(),
                DataValue {
                    data_type: "any[]".to_string(),
                    value: Some(Value::Array(Vec::new())),
                },
            ),
            (
                "match".to_string(),
                DataValue {
                    data_type: "control-flow-excluded".to_string(),
                    value: None,
                },
            ),
        ]);
    };

    BTreeMap::from([
        (
            "all_matches".to_string(),
            DataValue {
                data_type: "any[]".to_string(),
                value: Some(Value::Array(vec![match_value.clone()])),
            },
        ),
        (
            "match".to_string(),
            DataValue {
                data_type: "any".to_string(),
                value: Some(match_value),
            },
        ),
    ])
}

fn run_graph_output_node(output_id: &str, state: NodeRunState<'_>) -> DataValueMap {
    let has_value_input = state.node_inputs.contains_key("value");
    let value = state
        .node_inputs
        .get("value")
        .cloned()
        .unwrap_or_else(|| DataValue {
            data_type: "any".to_string(),
            value: None,
        });
    let mut current_output = state.graph_outputs.get(output_id).cloned();

    if has_value_input
        && (current_output.is_none()
            || current_output
                .as_ref()
                .is_some_and(|output| output.data_type == "control-flow-excluded"))
    {
        current_output = Some(value.clone());
        state
            .graph_outputs
            .insert(output_id.to_string(), value.clone());
    }

    current_output
        .map(|output| BTreeMap::from([("valueOutput".to_string(), output)]))
        .unwrap_or_default()
}

fn coalesce_excluded_output() -> DataValueMap {
    BTreeMap::from([(
        "output".to_string(),
        DataValue {
            data_type: "control-flow-excluded".to_string(),
            value: None,
        },
    )])
}

fn should_skip_coalesce_input_value(
    input_value: &DataValue,
    ignore_null: bool,
    ignore_undefined: bool,
) -> bool {
    (ignore_null && matches!(input_value.value, Some(Value::Null)))
        || (ignore_undefined && input_value.value.is_none())
}

fn dynamic_input_number(input_id: &str) -> Option<usize> {
    let suffix = input_id.strip_prefix("input")?;
    if suffix.is_empty() || !suffix.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }

    let input_number = suffix.parse::<usize>().ok()?;
    (input_number > 0).then_some(input_number)
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum SimpleJsonPathSegment {
    Key(String),
    Index(usize),
}

const MAX_SAFE_JSON_PATH_ARRAY_INDEX: u64 = 9_007_199_254_740_991;

fn get_simple_json_path_value(value: &Value, path: &str) -> Option<Value> {
    let segments = parse_simple_json_path(path)?;
    let mut current = value;

    for segment in segments {
        match segment {
            SimpleJsonPathSegment::Key(key) => {
                current = current.as_object()?.get(&key)?;
            }
            SimpleJsonPathSegment::Index(index) => {
                current = current.as_array()?.get(index)?;
            }
        }
    }

    Some(current.clone())
}

fn parse_simple_json_path(path: &str) -> Option<Vec<SimpleJsonPathSegment>> {
    let source = path.trim();
    let bytes = source.as_bytes();
    if bytes.first().copied() != Some(b'$') {
        return None;
    }

    let mut segments = Vec::new();
    let mut index = 1;

    while index < bytes.len() {
        match bytes[index] {
            b'.' => {
                index += 1;
                let key_start = index;
                if !bytes
                    .get(index)
                    .copied()
                    .is_some_and(is_json_path_identifier_start)
                {
                    return None;
                }

                index += 1;
                while bytes
                    .get(index)
                    .copied()
                    .is_some_and(is_json_path_identifier_continue)
                {
                    index += 1;
                }

                segments.push(SimpleJsonPathSegment::Key(
                    source.get(key_start..index)?.to_string(),
                ));
            }
            b'[' => {
                index += 1;
                let index_start = index;
                while bytes
                    .get(index)
                    .copied()
                    .is_some_and(|byte| byte.is_ascii_digit())
                {
                    index += 1;
                }

                if index == index_start || bytes.get(index).copied() != Some(b']') {
                    return None;
                }

                let array_index = source.get(index_start..index)?.parse::<u64>().ok()?;
                if array_index > MAX_SAFE_JSON_PATH_ARRAY_INDEX {
                    return None;
                }

                segments.push(SimpleJsonPathSegment::Index(array_index as usize));
                index += 1;
            }
            _ => return None,
        }
    }

    Some(segments)
}

fn is_json_path_identifier_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_' || byte == b'$'
}

fn is_json_path_identifier_continue(byte: u8) -> bool {
    is_json_path_identifier_start(byte) || byte.is_ascii_digit()
}

fn run_subgraph_node(
    graph_id: &str,
    input_data: Option<&DataValueMap>,
    state: NodeRunState<'_>,
) -> Result<DataValueMap, String> {
    let mut subgraph_inputs = input_data.cloned().unwrap_or_default();
    for (key, value) in state.node_inputs {
        subgraph_inputs.insert(key, value);
    }

    let start_time = Instant::now();
    let mut outputs = run_graph(state.graphs, graph_id, subgraph_inputs, state.context)?;

    outputs
        .entry("cost".to_string())
        .or_insert_with(|| DataValue {
            data_type: "number".to_string(),
            value: Some(Value::Number(Number::from(0))),
        });
    outputs
        .entry("duration".to_string())
        .or_insert_with(|| DataValue {
            data_type: "number".to_string(),
            value: Some(Value::Number(Number::from(
                start_time.elapsed().as_millis() as u64,
            ))),
        });

    Ok(outputs)
}

fn resolve_node_inputs(
    connections: &[NativeConnectionIr],
    outputs_by_node_id: &HashMap<String, DataValueMap>,
) -> DataValueMap {
    let mut inputs = DataValueMap::new();

    for connection in connections {
        let Some(source_outputs) = outputs_by_node_id.get(&connection.output_node_id) else {
            continue;
        };
        let Some(source_value) = source_outputs.get(&connection.output_id) else {
            continue;
        };

        inputs.insert(connection.input_id.clone(), source_value.clone());
    }

    inputs
}

fn interpolate(
    template: &str,
    variables: &BTreeMap<String, String>,
    graph_input_values: &DataValueMap,
    context_values: &DataValueMap,
) -> String {
    replace_interpolation_tokens(template, |raw_inner| {
        let parts = raw_inner.split('|').map(str::trim).collect::<Vec<_>>();
        let expression = parts.first().copied().unwrap_or_default();
        let processing_chain = parts.get(1..).unwrap_or(&[]).join("|");
        let resolved_value = if let Some(expression) = expression.strip_prefix("@graphInputs.") {
            resolve_expression_to_string(graph_input_values, expression)
        } else if let Some(expression) = expression.strip_prefix("@context.") {
            resolve_expression_to_string(context_values, expression)
        } else {
            variables.get(expression).cloned()
        };

        let Some(resolved_value) = resolved_value else {
            return String::new();
        };

        if processing_chain.is_empty() {
            resolved_value
        } else {
            apply_processing(&resolved_value, &processing_chain)
        }
    })
}

fn interpolate_json_template(
    template: &str,
    variables: &DataValueMap,
    graph_input_values: &DataValueMap,
    context_values: &DataValueMap,
) -> String {
    let protected_template = protect_escaped_interpolation_tokens(template);
    let spans = find_interpolation_token_spans(&protected_template);

    if spans.is_empty() {
        return restore_escaped_interpolation_tokens(&protected_template);
    }

    let mut result = String::new();
    let mut cursor = 0;

    for span in spans {
        let is_inside_string = is_inside_json_string(&protected_template, span.start);
        let is_whole_quoted_token = is_inside_string
            && is_unescaped_quote_at(&protected_template, span.start.saturating_sub(1))
            && is_unescaped_quote_at(&protected_template, span.end);
        let replacement_start = if is_whole_quoted_token {
            span.start.saturating_sub(1)
        } else {
            span.start
        };
        let replacement_end = if is_whole_quoted_token {
            span.end + 1
        } else {
            span.end
        };
        let raw_inner = &protected_template[span.raw_inner_start..span.raw_inner_end];
        let token_name = get_interpolation_token_name(raw_inner)
            .map(str::to_string)
            .unwrap_or_else(|| raw_inner.trim().to_string());
        let value =
            resolve_json_template_value(&token_name, variables, graph_input_values, context_values);

        result.push_str(&protected_template[cursor..replacement_start]);
        if is_inside_string && !is_whole_quoted_token {
            result.push_str(&stringify_embedded_json_string_fragment(value));
        } else if is_whole_quoted_token {
            result.push_str(&stringify_whole_quoted_json_value(value));
        } else {
            result.push_str(&stringify_json_value(value));
        }
        cursor = replacement_end;
    }

    result.push_str(&protected_template[cursor..]);
    restore_escaped_interpolation_tokens(&result)
}

fn resolve_json_template_value(
    token_name: &str,
    variables: &DataValueMap,
    graph_input_values: &DataValueMap,
    context_values: &DataValueMap,
) -> Option<Value> {
    if let Some(expression) = token_name.strip_prefix("@graphInputs.") {
        return resolve_expression_raw_value(graph_input_values, expression);
    }

    if let Some(expression) = token_name.strip_prefix("@context.") {
        return resolve_expression_raw_value(context_values, expression);
    }

    variables
        .get(token_name)
        .map(|value| value.value.clone().unwrap_or(Value::Null))
}

fn stringify_json_value(value: Option<Value>) -> String {
    match value {
        None | Some(Value::Null) => "null".to_string(),
        Some(value) => serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string()),
    }
}

fn stringify_whole_quoted_json_value(value: Option<Value>) -> String {
    match value {
        None | Some(Value::Null) => "null".to_string(),
        Some(Value::String(value)) => {
            serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string())
        }
        Some(value) => {
            let json_text = serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string());
            serde_json::to_string(&json_text).unwrap_or_else(|_| "null".to_string())
        }
    }
}

fn stringify_embedded_json_string_fragment(value: Option<Value>) -> String {
    let fragment = match value {
        None | Some(Value::Null) => "null".to_string(),
        Some(Value::String(value)) => value,
        Some(value) => serde_json::to_string(&value).unwrap_or_else(|_| "null".to_string()),
    };
    let quoted_fragment =
        serde_json::to_string(&fragment).unwrap_or_else(|_| "\"null\"".to_string());

    quoted_fragment
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(&quoted_fragment)
        .to_string()
}

fn get_interpolation_token_name(raw_inner: &str) -> Option<&str> {
    let token = raw_inner.split('|').next()?.trim();
    (!token.is_empty()).then_some(token)
}

fn is_escaped_character(value: &str, index: usize) -> bool {
    if index == 0 || index > value.len() {
        return false;
    }

    let bytes = value.as_bytes();
    let mut backslash_count = 0;
    let mut cursor = index;

    while cursor > 0 && bytes.get(cursor - 1).copied() == Some(b'\\') {
        backslash_count += 1;
        cursor -= 1;
    }

    backslash_count % 2 == 1
}

fn is_unescaped_quote_at(value: &str, index: usize) -> bool {
    value.as_bytes().get(index).copied() == Some(b'"') && !is_escaped_character(value, index)
}

fn is_inside_json_string(value: &str, index: usize) -> bool {
    let mut inside_string = false;
    for position in 0..index.min(value.len()) {
        if is_unescaped_quote_at(value, position) {
            inside_string = !inside_string;
        }
    }

    inside_string
}

fn replace_interpolation_tokens(
    template: &str,
    mut replacement: impl FnMut(&str) -> String,
) -> String {
    let protected_template = protect_escaped_interpolation_tokens(template);
    let spans = find_interpolation_token_spans(&protected_template);

    if spans.is_empty() {
        return restore_escaped_interpolation_tokens(&protected_template);
    }

    let mut result = String::new();
    let mut cursor = 0;

    for span in spans {
        result.push_str(&protected_template[cursor..span.start]);
        result.push_str(&replacement(
            &protected_template[span.raw_inner_start..span.raw_inner_end],
        ));
        cursor = span.end;
    }

    result.push_str(&protected_template[cursor..]);
    restore_escaped_interpolation_tokens(&result)
}

#[derive(Debug, Clone, Copy)]
struct InterpolationSpan {
    end: usize,
    raw_inner_end: usize,
    raw_inner_start: usize,
    start: usize,
}

fn find_interpolation_token_spans(template: &str) -> Vec<InterpolationSpan> {
    let mut spans = Vec::new();
    let mut search_index = 0;

    while search_index < template.len() {
        let Some(relative_open_index) = template[search_index..].find("{{") else {
            break;
        };
        let open_index = search_index + relative_open_index;
        let Some(relative_close_index) = template[(open_index + 2)..].find("}}") else {
            break;
        };
        let close_index = open_index + 2 + relative_close_index;
        let nested_open_index = template[(open_index + 2)..]
            .find("{{")
            .map(|index| open_index + 2 + index);

        if nested_open_index.is_some_and(|index| index < close_index) {
            search_index = nested_open_index.unwrap();
            continue;
        }

        spans.push(InterpolationSpan {
            end: close_index + 2,
            raw_inner_end: close_index,
            raw_inner_start: open_index + 2,
            start: open_index,
        });
        search_index = close_index + 2;
    }

    spans
}

fn protect_escaped_interpolation_tokens(template: &str) -> String {
    let mut result = String::new();
    let mut index = 0;

    while let Some(relative_open_index) = template[index..].find("{{{") {
        let open_index = index + relative_open_index;
        result.push_str(&template[index..open_index]);
        let content_start = open_index + 3;
        let Some(relative_close_index) = template[content_start..].find("}}}") else {
            result.push_str(&template[open_index..]);
            return result;
        };
        let close_index = content_start + relative_close_index;
        result.push_str("\\{\\{");
        result.push_str(&template[content_start..close_index]);
        result.push_str("\\}\\}");
        index = close_index + 3;
    }

    result.push_str(&template[index..]);
    result
}

fn restore_escaped_interpolation_tokens(template: &str) -> String {
    let mut result = String::new();
    let mut index = 0;

    while let Some(relative_open_index) = template[index..].find("\\{\\{") {
        let open_index = index + relative_open_index;
        result.push_str(&template[index..open_index]);
        let content_start = open_index + 4;
        let Some(relative_close_index) = template[content_start..].find("\\}\\}") else {
            result.push_str(&template[open_index..]);
            return result;
        };
        let close_index = content_start + relative_close_index;
        result.push_str("{{");
        result.push_str(&template[content_start..close_index]);
        result.push_str("}}");
        index = close_index + 4;
    }

    result.push_str(&template[index..]);
    result
}

fn resolve_expression_to_string(source: &DataValueMap, expression: &str) -> Option<String> {
    let value = resolve_expression_raw_value(source, expression)?;

    match value {
        Value::String(value) => Some(value),
        Value::Null => Some("null".to_string()),
        Value::Bool(value) => Some(value.to_string()),
        Value::Number(value) => Some(value.to_string()),
        value => serde_json::to_string(&value).ok(),
    }
}

fn resolve_expression_raw_value(source: &DataValueMap, expression: &str) -> Option<Value> {
    let trimmed = expression.trim();
    let (key, raw_path) = split_expression_key_and_path(trimmed);
    let top_level_value = source.get(key)?;
    let mut value = top_level_value.value.clone().unwrap_or(Value::Null);
    let path = raw_path
        .trim()
        .replace(" .", ".")
        .replace(". ", ".")
        .replace(" [", "[")
        .replace("[ ", "[")
        .replace(" ]", "]")
        .replace("] ", "]");

    if !path.is_empty() {
        value = get_by_path(&value, &path)?;
    }

    Some(unwrap_potential_data_value(value))
}

fn split_expression_key_and_path(expression: &str) -> (&str, &str) {
    for (index, character) in expression.char_indices() {
        if character == '.' || character == '[' || character.is_whitespace() {
            let (key, rest) = expression.split_at(index);
            return (key, rest);
        }
    }

    (expression, "")
}

fn get_by_path(value: &Value, path: &str) -> Option<Value> {
    let mut current = value;
    let mut index = 0;
    let chars = path.chars().collect::<Vec<_>>();

    while index < chars.len() {
        match chars[index] {
            '.' => {
                index += 1;
                let start = index;
                while index < chars.len() && chars[index] != '.' && chars[index] != '[' {
                    index += 1;
                }
                let key = chars[start..index].iter().collect::<String>();
                current = current.get(&key)?;
            }
            '[' => {
                index += 1;
                let quote =
                    matches!(chars.get(index), Some('"') | Some('\'')).then_some(chars[index]);
                if quote.is_some() {
                    index += 1;
                }
                let start = index;
                while index < chars.len()
                    && ((quote.is_some() && Some(chars[index]) != quote)
                        || (quote.is_none() && chars[index] != ']'))
                {
                    index += 1;
                }
                let key = chars[start..index].iter().collect::<String>();
                if quote.is_some() {
                    index += 1;
                }
                if !matches!(chars.get(index), Some(']')) {
                    return None;
                }
                index += 1;
                current = if let Ok(array_index) = key.parse::<usize>() {
                    current.get(array_index)?
                } else {
                    current.get(&key)?
                };
            }
            _ if chars[index].is_whitespace() => {
                index += 1;
            }
            _ => {
                let start = index;
                while index < chars.len() && chars[index] != '.' && chars[index] != '[' {
                    index += 1;
                }
                let key = chars[start..index].iter().collect::<String>();
                current = current.get(&key)?;
            }
        }
    }

    Some(current.clone())
}

fn apply_processing(value: &str, processing_chain: &str) -> String {
    processing_chain
        .split('|')
        .map(str::trim)
        .filter(|instruction| !instruction.is_empty())
        .fold(value.to_string(), |result, instruction| {
            let mut parts = instruction.split_whitespace();
            let name = parts.next().unwrap_or_default();
            let number_parameter = parts
                .next()
                .and_then(|parameter| parameter.parse::<isize>().ok());
            let parameter_or_default = |default_value| number_parameter.unwrap_or(default_value);

            match name {
                "indent" => indent(&result, parameter_or_default(0).max(0) as usize),
                "quote" => quote(&result, parameter_or_default(1).max(0) as usize),
                "uppercase" => result.to_uppercase(),
                "lowercase" => result.to_lowercase(),
                "trim" => result.trim().to_string(),
                "truncate" => truncate(&result, parameter_or_default(50).max(0) as usize),
                "list" => list(&result, parameter_or_default(1).max(1) as usize),
                "sort" => {
                    let mut lines = result.split('\n').collect::<Vec<_>>();
                    lines.sort_unstable();
                    lines.join("\n")
                }
                "dedent" => dedent(&result),
                "wrap" => wrap_text(&result, parameter_or_default(80).max(1) as usize),
                _ => result,
            }
        })
}

fn indent(input: &str, spaces: usize) -> String {
    let indent = " ".repeat(spaces);
    input
        .split('\n')
        .map(|line| format!("{indent}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn quote(input: &str, level: usize) -> String {
    let quote_prefix = "> ".repeat(level);
    input
        .split('\n')
        .map(|line| format!("{quote_prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn truncate(input: &str, length: usize) -> String {
    if input.chars().count() <= length {
        input.to_string()
    } else {
        format!("{}...", input.chars().take(length).collect::<String>())
    }
}

fn list(input: &str, level: usize) -> String {
    let indent = "  ".repeat(level - 1);
    input
        .split('\n')
        .map(|line| format!("{indent}- {line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn dedent(value: &str) -> String {
    let trimmed = value.trim_matches('\n');
    let lines = trimmed.split('\n').collect::<Vec<_>>();
    let indentation = lines
        .iter()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            line.chars()
                .take_while(|character| *character == ' ')
                .count()
        })
        .min()
        .unwrap_or(0);

    if indentation == 0 {
        return lines.join("\n");
    }

    lines
        .iter()
        .map(|line| line.get(indentation..).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("\n")
}

fn wrap_text(input: &str, width: usize) -> String {
    let mut lines = Vec::new();
    let mut current_line = String::new();

    for word in input.split_whitespace() {
        if current_line.len() + word.len() < width {
            if !current_line.is_empty() {
                current_line.push(' ');
            }
            current_line.push_str(word);
        } else {
            lines.push(current_line);
            current_line = word.to_string();
        }
    }

    if !current_line.is_empty() {
        lines.push(current_line);
    }

    lines.join("\n")
}

fn handle_escape_characters(input: &str) -> String {
    let mut result = String::new();
    let mut previous_was_backslash = false;

    for character in input.chars() {
        if previous_was_backslash {
            match character {
                'n' => result.push('\n'),
                't' => result.push('\t'),
                'r' => result.push('\r'),
                'f' => result.push('\u{000c}'),
                'b' => result.push('\u{0008}'),
                'v' => result.push('\u{000b}'),
                other => {
                    result.push('\\');
                    result.push(other);
                }
            }
            previous_was_backslash = false;
        } else if character == '\\' {
            previous_was_backslash = true;
        } else {
            result.push(character);
        }
    }

    if previous_was_backslash {
        result.push('\\');
    }

    result
}

fn coerce_data_value(value: &DataValue, data_type: &str) -> Option<Value> {
    match data_type {
        "any" => value.value.clone(),
        "string" => coerce_to_string(value).map(Value::String),
        "number" => coerce_to_number(value).and_then(number_value),
        "boolean" => Some(Value::Bool(coerce_to_boolean(value))),
        _ => value.value.clone(),
    }
}

fn coerce_to_string(data_value: &DataValue) -> Option<String> {
    if is_array_data_value(data_value) {
        let scalar_type = data_value.data_type.strip_suffix("[]").unwrap_or("any");
        let values = match &data_value.value {
            Some(Value::Array(values)) => values,
            _ => return Some(String::new()),
        };
        return Some(
            values
                .iter()
                .map(|value| {
                    let value = DataValue {
                        data_type: scalar_type.to_string(),
                        value: Some(value.clone()),
                    };
                    coerce_data_value(&value, "string")
                        .and_then(string_value)
                        .unwrap_or_default()
                })
                .collect::<Vec<_>>()
                .join("\n"),
        );
    }

    match (&*data_value.data_type, &data_value.value) {
        ("string", Some(Value::String(value))) => Some(value.clone()),
        ("boolean", Some(Value::Bool(value))) => Some(value.to_string()),
        ("number", Some(Value::Number(value))) => Some(number_to_js_string(value)),
        (_, None | Some(Value::Null)) => None,
        (_, Some(Value::String(value))) => Some(value.clone()),
        (_, Some(Value::Bool(value))) => Some(value.to_string()),
        (_, Some(Value::Number(value))) => Some(number_to_js_string(value)),
        (_, Some(value)) => serde_json::to_string(value).ok(),
    }
}

fn coerce_to_number(data_value: &DataValue) -> Option<f64> {
    if is_array_data_value(data_value) {
        return None;
    }

    match (&*data_value.data_type, &data_value.value) {
        (_, None | Some(Value::Null)) => None,
        ("number", Some(Value::Number(value))) => value.as_f64(),
        ("boolean", Some(Value::Bool(value))) => Some(if *value { 1.0 } else { 0.0 }),
        ("string", Some(Value::String(value))) => value.parse::<f64>().ok(),
        ("any" | "object", Some(value)) => {
            let inferred = infer_data_value(Some(value.clone()));
            coerce_to_number(&inferred)
        }
        _ => None,
    }
}

fn coerce_to_boolean(data_value: &DataValue) -> bool {
    if is_array_data_value(data_value) {
        let scalar_type = data_value.data_type.strip_suffix("[]").unwrap_or("any");
        return match &data_value.value {
            Some(Value::Array(values)) => values.iter().all(|value| {
                coerce_data_value(
                    &DataValue {
                        data_type: scalar_type.to_string(),
                        value: Some(value.clone()),
                    },
                    "boolean",
                )
                .is_some_and(|value| value.as_bool().unwrap_or(false))
            }),
            _ => false,
        };
    }

    match (&*data_value.data_type, &data_value.value) {
        (_, None | Some(Value::Null)) => false,
        ("string", Some(Value::String(value))) => !value.is_empty() && value != "false",
        ("boolean", Some(Value::Bool(value))) => *value,
        ("number", Some(Value::Number(value))) => value.as_f64().is_some_and(|value| value != 0.0),
        (_, Some(value)) => is_truthy_value(Some(value)),
    }
}

fn infer_data_value(value: Option<Value>) -> DataValue {
    match value {
        None => DataValue {
            data_type: "any".to_string(),
            value: None,
        },
        Some(Value::Null) => DataValue {
            data_type: "any".to_string(),
            value: Some(Value::Null),
        },
        Some(Value::String(value)) => DataValue {
            data_type: "string".to_string(),
            value: Some(Value::String(value)),
        },
        Some(Value::Bool(value)) => DataValue {
            data_type: "boolean".to_string(),
            value: Some(Value::Bool(value)),
        },
        Some(Value::Number(value)) => DataValue {
            data_type: "number".to_string(),
            value: Some(Value::Number(value)),
        },
        Some(Value::Array(values)) => {
            let scalar_type = values
                .first()
                .map(|value| infer_data_value(Some(value.clone())).data_type)
                .unwrap_or_else(|| "any".to_string());
            DataValue {
                data_type: format!("{scalar_type}[]"),
                value: Some(Value::Array(values)),
            }
        }
        Some(value) => DataValue {
            data_type: "object".to_string(),
            value: Some(value),
        },
    }
}

fn get_default_value(data_type: &str) -> Option<Value> {
    if data_type.ends_with("[]") {
        return Some(Value::Array(Vec::new()));
    }

    match data_type {
        "string" => Some(Value::String(String::new())),
        "number" => Some(Value::Number(Number::from(0))),
        "boolean" => Some(Value::Bool(false)),
        "object" => Some(Value::Object(serde_json::Map::new())),
        _ => None,
    }
}

fn is_array_data_value(value: &DataValue) -> bool {
    value.data_type.ends_with("[]") || matches!(value.value, Some(Value::Array(_)))
}

fn unwrap_potential_data_value(value: Value) -> Value {
    let Some(object) = value.as_object() else {
        return value;
    };

    if object.get("type").is_some_and(Value::is_string) && object.contains_key("value") {
        object.get("value").cloned().unwrap_or(Value::Null)
    } else {
        Value::Object(object.clone())
    }
}

fn is_nullish(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}

fn is_truthy_data_value(value: &DataValue) -> bool {
    is_truthy_value(value.value.as_ref())
}

fn is_truthy_value(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(value)) => value.as_f64().is_some_and(|value| value != 0.0),
        Some(Value::String(value)) => !value.is_empty(),
        Some(Value::Array(value)) => !value.is_empty(),
        Some(Value::Object(value)) => !value.is_empty(),
    }
}

fn string_value(value: Value) -> Option<String> {
    match value {
        Value::String(value) => Some(value),
        _ => None,
    }
}

fn number_value(value: f64) -> Option<Value> {
    Number::from_f64(value).map(Value::Number)
}

fn number_to_js_string(value: &Number) -> String {
    if let Some(value) = value.as_i64() {
        return value.to_string();
    }

    if let Some(value) = value.as_u64() {
        return value.to_string();
    }

    match value.as_f64() {
        Some(0.0) => "0".to_string(),
        Some(value) if value.is_finite() && value.fract() == 0.0 => format!("{value:.0}"),
        _ => value.to_string(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum WorkerRequest {
    #[serde(rename = "create", rename_all = "camelCase")]
    Create {
        id: u64,
        request: NativeRuntimeCreateRequest,
    },
    #[serde(rename = "run", rename_all = "camelCase")]
    Run {
        context: DataValueMap,
        id: u64,
        inputs: DataValueMap,
    },
    #[serde(rename = "dispose", rename_all = "camelCase")]
    Dispose { id: u64 },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkerResponse {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    outputs: Option<DataValueMap>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

pub fn run_worker_stdio() -> Result<(), String> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut plan: Option<NativeRunnerPlan> = None;

    for line in stdin.lock().lines() {
        let line = line.map_err(|error| error.to_string())?;
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<WorkerRequest>(&line) {
            Ok(WorkerRequest::Create { id, request }) => match prepare_runner(request) {
                Ok(created_plan) => {
                    plan = Some(created_plan);
                    WorkerResponse {
                        id,
                        ok: true,
                        outputs: None,
                        reason: None,
                    }
                }
                Err(reason) => WorkerResponse {
                    id,
                    ok: false,
                    outputs: None,
                    reason: Some(reason),
                },
            },
            Ok(WorkerRequest::Run {
                context,
                id,
                inputs,
            }) => match &plan {
                Some(plan) => match run_prepared_graph(plan, inputs, context) {
                    Ok(outputs) => WorkerResponse {
                        id,
                        ok: true,
                        outputs: Some(outputs),
                        reason: None,
                    },
                    Err(reason) => WorkerResponse {
                        id,
                        ok: false,
                        outputs: None,
                        reason: Some(reason),
                    },
                },
                None => WorkerResponse {
                    id,
                    ok: false,
                    outputs: None,
                    reason: Some("runner-not-created".to_string()),
                },
            },
            Ok(WorkerRequest::Dispose { id }) => {
                write_response(
                    &mut stdout,
                    &WorkerResponse {
                        id,
                        ok: true,
                        outputs: None,
                        reason: None,
                    },
                )?;
                break;
            }
            Err(error) => WorkerResponse {
                id: parse_message_id(&line).unwrap_or(0),
                ok: false,
                outputs: None,
                reason: Some(format!("invalid-worker-message:{error}")),
            },
        };

        write_response(&mut stdout, &response)?;
    }

    Ok(())
}

fn parse_message_id(line: &str) -> Option<u64> {
    serde_json::from_str::<Value>(line)
        .ok()?
        .get("id")?
        .as_u64()
}

fn write_response(stdout: &mut impl Write, response: &WorkerResponse) -> Result<(), String> {
    serde_json::to_writer(&mut *stdout, response).map_err(|error| error.to_string())?;
    stdout.write_all(b"\n").map_err(|error| error.to_string())?;
    stdout.flush().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unavailable_decision_is_explicit() {
        let decision = unavailable_decision();

        assert!(!decision.supported);
        assert_eq!(
            decision.reason.as_deref(),
            Some("native runtime execution is not enabled until benchmark gates pass")
        );
    }

    #[test]
    fn runs_text_chain_with_context() {
        let request = serde_json::from_value::<NativeRuntimeCreateRequest>(json!({
            "graphId": "main",
            "graphs": [{
                "graphId": "main",
                "nodes": [
                    { "type": "graphInput", "id": "input", "inputId": "input", "dataType": "string" },
                    { "type": "text", "id": "text", "template": "{{input}} {{@context.suffix}}", "normalizeLineEndings": true },
                    { "type": "graphOutput", "id": "output", "outputId": "result", "dataType": "string" }
                ],
                "connections": [
                    { "outputNodeId": "input", "outputId": "data", "inputNodeId": "text", "inputId": "input" },
                    { "outputNodeId": "text", "outputId": "output", "inputNodeId": "output", "inputId": "value" }
                ]
            }]
        }))
        .unwrap();
        let plan = prepare_runner(request).unwrap();
        let outputs = run_prepared_graph(
            &plan,
            BTreeMap::from([(
                "input".to_string(),
                DataValue {
                    data_type: "string".to_string(),
                    value: Some(Value::String("native".to_string())),
                },
            )]),
            BTreeMap::from([(
                "suffix".to_string(),
                DataValue {
                    data_type: "string".to_string(),
                    value: Some(Value::String("rust".to_string())),
                },
            )]),
        )
        .unwrap();

        assert_eq!(
            outputs.get("result"),
            Some(&DataValue {
                data_type: "string".to_string(),
                value: Some(Value::String("native rust".to_string())),
            })
        );
    }

    #[test]
    fn rejects_duplicate_nodes() {
        let request = serde_json::from_value::<NativeRuntimeCreateRequest>(json!({
            "graphId": "main",
            "graphs": [{
                "graphId": "main",
                "nodes": [
                    { "type": "text", "id": "duplicate", "template": "", "normalizeLineEndings": true },
                    { "type": "text", "id": "duplicate", "template": "", "normalizeLineEndings": true }
                ],
                "connections": []
            }]
        }))
        .unwrap();

        assert_eq!(
            prepare_runner(request).unwrap_err(),
            "duplicate-node:main:duplicate"
        );
    }

    #[test]
    fn preserves_explicit_null_data_value() {
        let explicit_null = serde_json::from_value::<DataValue>(json!({
            "type": "any",
            "value": null
        }))
        .unwrap();
        let missing_value = serde_json::from_value::<DataValue>(json!({
            "type": "any"
        }))
        .unwrap();

        assert_eq!(explicit_null.value, Some(Value::Null));
        assert_eq!(missing_value.value, None);
        assert_eq!(
            serde_json::to_value(explicit_null).unwrap(),
            json!({ "type": "any", "value": null })
        );
        assert_eq!(
            serde_json::to_value(missing_value).unwrap(),
            json!({ "type": "any" })
        );
    }

    #[test]
    fn runs_coalesce_with_null_and_undefined_rules() {
        let outputs = run_coalesce_for_test(
            true,
            true,
            BTreeMap::from([
                ("input1".to_string(), data_value("any", Some(Value::Null))),
                ("input2".to_string(), data_value("any", None)),
                (
                    "input3".to_string(),
                    data_value("string", Some(Value::String("winner".to_string()))),
                ),
            ]),
        );

        assert_eq!(
            outputs.get("output"),
            Some(&DataValue {
                data_type: "string".to_string(),
                value: Some(Value::String("winner".to_string())),
            })
        );

        let outputs = run_coalesce_for_test(
            false,
            false,
            BTreeMap::from([
                ("input1".to_string(), data_value("any", Some(Value::Null))),
                (
                    "input2".to_string(),
                    data_value("string", Some(Value::String("fallback".to_string()))),
                ),
            ]),
        );

        assert_eq!(
            outputs.get("output"),
            Some(&DataValue {
                data_type: "any".to_string(),
                value: Some(Value::Null),
            })
        );
    }

    #[test]
    fn defaults_missing_coalesce_flags_to_false() {
        let node = serde_json::from_value::<NativeNodeIr>(json!({
            "type": "coalesce",
            "id": "coalesce"
        }))
        .unwrap();

        assert_eq!(
            node,
            NativeNodeIr::Coalesce {
                id: "coalesce".to_string(),
                ignore_null: false,
                ignore_undefined: false,
            }
        );
    }

    #[test]
    fn runs_coalesce_through_graph_execution() {
        let request = serde_json::from_value::<NativeRuntimeCreateRequest>(json!({
            "graphId": "main",
            "graphs": [{
                "graphId": "main",
                "nodes": [
                    { "type": "graphInput", "id": "conditional", "inputId": "conditional", "dataType": "boolean" },
                    { "type": "graphInput", "id": "first", "inputId": "first", "dataType": "any" },
                    { "type": "graphInput", "id": "second", "inputId": "second", "dataType": "any" },
                    { "type": "graphInput", "id": "third", "inputId": "third", "dataType": "string" },
                    { "type": "coalesce", "id": "coalesce", "ignoreNull": true, "ignoreUndefined": true },
                    { "type": "graphOutput", "id": "output", "outputId": "result", "dataType": "any" }
                ],
                "connections": [
                    { "outputNodeId": "conditional", "outputId": "data", "inputNodeId": "coalesce", "inputId": "conditional" },
                    { "outputNodeId": "first", "outputId": "data", "inputNodeId": "coalesce", "inputId": "input1" },
                    { "outputNodeId": "second", "outputId": "data", "inputNodeId": "coalesce", "inputId": "input2" },
                    { "outputNodeId": "third", "outputId": "data", "inputNodeId": "coalesce", "inputId": "input3" },
                    { "outputNodeId": "coalesce", "outputId": "output", "inputNodeId": "output", "inputId": "value" }
                ]
            }]
        }))
        .unwrap();
        let plan = prepare_runner(request).unwrap();
        let outputs = run_prepared_graph(
            &plan,
            BTreeMap::from([
                (
                    "conditional".to_string(),
                    DataValue {
                        data_type: "boolean".to_string(),
                        value: Some(Value::Bool(false)),
                    },
                ),
                (
                    "first".to_string(),
                    DataValue {
                        data_type: "any".to_string(),
                        value: Some(Value::Null),
                    },
                ),
                (
                    "second".to_string(),
                    DataValue {
                        data_type: "any".to_string(),
                        value: None,
                    },
                ),
                (
                    "third".to_string(),
                    DataValue {
                        data_type: "string".to_string(),
                        value: Some(Value::String("winner".to_string())),
                    },
                ),
            ]),
            BTreeMap::new(),
        )
        .unwrap();

        assert_eq!(
            outputs.get("result"),
            Some(&DataValue {
                data_type: "string".to_string(),
                value: Some(Value::String("winner".to_string())),
            })
        );
    }

    #[test]
    fn runs_destructure_with_simple_object_paths() {
        let outputs = run_destructure_for_test(
            vec![
                NativeDestructurePath {
                    output_id: "first".to_string(),
                    path: "$.first".to_string(),
                },
                NativeDestructurePath {
                    output_id: "second".to_string(),
                    path: "$.nested.second".to_string(),
                },
                NativeDestructurePath {
                    output_id: "indexed".to_string(),
                    path: "$.items[1]".to_string(),
                },
                NativeDestructurePath {
                    output_id: "missing".to_string(),
                    path: "$.missing".to_string(),
                },
            ],
            BTreeMap::from([(
                "object".to_string(),
                data_value(
                    "object",
                    Some(json!({
                        "first": "alpha",
                        "items": ["zero", "one"],
                        "nested": { "second": 42 }
                    })),
                ),
            )]),
        );

        assert_eq!(
            outputs.get("first"),
            Some(&DataValue {
                data_type: "any".to_string(),
                value: Some(Value::String("alpha".to_string())),
            })
        );
        assert_eq!(
            outputs.get("second"),
            Some(&DataValue {
                data_type: "any".to_string(),
                value: Some(Value::Number(Number::from(42))),
            })
        );
        assert_eq!(
            outputs.get("indexed"),
            Some(&DataValue {
                data_type: "any".to_string(),
                value: Some(Value::String("one".to_string())),
            })
        );
        assert_eq!(
            outputs.get("missing"),
            Some(&DataValue {
                data_type: "any".to_string(),
                value: None,
            })
        );
    }

    #[test]
    fn runs_extract_object_path_with_simple_object_path() {
        let outputs = run_extract_object_path_for_test(
            "$.nested.second",
            BTreeMap::from([(
                "object".to_string(),
                data_value(
                    "object",
                    Some(json!({
                        "items": ["zero", "one"],
                        "nested": { "second": 42 }
                    })),
                ),
            )]),
        );

        assert_eq!(
            outputs.get("match"),
            Some(&DataValue {
                data_type: "any".to_string(),
                value: Some(Value::Number(Number::from(42))),
            })
        );
        assert_eq!(
            outputs.get("all_matches"),
            Some(&DataValue {
                data_type: "any[]".to_string(),
                value: Some(Value::Array(vec![Value::Number(Number::from(42))])),
            })
        );

        let outputs = run_extract_object_path_for_test(
            "$.missing",
            BTreeMap::from([("object".to_string(), data_value("object", Some(json!({}))))]),
        );

        assert_eq!(
            outputs.get("match"),
            Some(&DataValue {
                data_type: "control-flow-excluded".to_string(),
                value: None,
            })
        );
        assert_eq!(
            outputs.get("all_matches"),
            Some(&DataValue {
                data_type: "any[]".to_string(),
                value: Some(Value::Array(Vec::new())),
            })
        );
    }

    #[test]
    fn runs_object_node_with_json_template_interpolation() {
        let outputs = run_object_for_test(
            r#"{"name":"{{input}}","label":"Name {{input}}","meta":{{meta}},"metaText":"{{meta}}","count":{{count}},"suffix":"{{@context.suffix}}","literal":"{{{ignored}}}"}"#,
            BTreeMap::from([
                (
                    "input".to_string(),
                    data_value("string", Some(Value::String("Ada \"Lovelace\"".to_string()))),
                ),
                (
                    "meta".to_string(),
                    data_value("object", Some(json!({ "role": "builder" }))),
                ),
                (
                    "count".to_string(),
                    data_value("number", Some(Value::Number(Number::from(3)))),
                ),
            ]),
            BTreeMap::from([(
                "suffix".to_string(),
                data_value("string", Some(Value::String("ctx".to_string()))),
            )]),
        )
        .unwrap();

        assert_eq!(
            outputs.get("output"),
            Some(&DataValue {
                data_type: "object".to_string(),
                value: Some(json!({
                    "count": 3,
                    "label": "Name Ada \"Lovelace\"",
                    "literal": "{{ignored}}",
                    "meta": { "role": "builder" },
                    "metaText": "{\"role\":\"builder\"}",
                    "name": "Ada \"Lovelace\"",
                    "suffix": "ctx"
                })),
            })
        );
    }

    #[test]
    fn excludes_object_node_when_an_input_is_excluded() {
        let outputs = run_object_for_test(
            r#"{"name":"{{input}}"}"#,
            BTreeMap::from([(
                "input".to_string(),
                data_value("control-flow-excluded", None),
            )]),
            BTreeMap::new(),
        )
        .unwrap();

        assert_eq!(
            outputs.get("output"),
            Some(&DataValue {
                data_type: "control-flow-excluded".to_string(),
                value: None,
            })
        );
    }

    #[test]
    fn rejects_unsupported_destructure_paths_at_create_time() {
        let request = serde_json::from_value::<NativeRuntimeCreateRequest>(json!({
            "graphId": "main",
            "graphs": [{
                "graphId": "main",
                "nodes": [
                    { "type": "graphInput", "id": "object", "inputId": "object", "dataType": "object" },
                    {
                        "type": "destructure",
                        "id": "destructure",
                        "paths": [{ "outputId": "wildcard", "path": "$.items[*]" }]
                    },
                    { "type": "graphOutput", "id": "output", "outputId": "result", "dataType": "any" }
                ],
                "connections": [
                    { "outputNodeId": "object", "outputId": "data", "inputNodeId": "destructure", "inputId": "object" },
                    { "outputNodeId": "destructure", "outputId": "wildcard", "inputNodeId": "output", "inputId": "value" }
                ]
            }]
        }))
        .unwrap();

        assert_eq!(
            prepare_runner(request).unwrap_err(),
            "invalid-node:main:destructure:destructure"
        );
    }

    #[test]
    fn rejects_unsupported_extract_object_path_at_create_time() {
        let request = serde_json::from_value::<NativeRuntimeCreateRequest>(json!({
            "graphId": "main",
            "graphs": [{
                "graphId": "main",
                "nodes": [
                    { "type": "graphInput", "id": "object", "inputId": "object", "dataType": "object" },
                    { "type": "extractObjectPath", "id": "extract", "path": "$.items[*]" },
                    { "type": "graphOutput", "id": "output", "outputId": "result", "dataType": "any" }
                ],
                "connections": [
                    { "outputNodeId": "object", "outputId": "data", "inputNodeId": "extract", "inputId": "object" },
                    { "outputNodeId": "extract", "outputId": "match", "inputNodeId": "output", "inputId": "value" }
                ]
            }]
        }))
        .unwrap();

        assert_eq!(
            prepare_runner(request).unwrap_err(),
            "invalid-node:main:extractObjectPath:extract"
        );
    }

    #[test]
    fn rejects_destructure_without_required_object_input() {
        let request = serde_json::from_value::<NativeRuntimeCreateRequest>(json!({
            "graphId": "main",
            "graphs": [{
                "graphId": "main",
                "nodes": [
                    {
                        "type": "destructure",
                        "id": "destructure",
                        "paths": [{ "outputId": "match", "path": "$.value" }]
                    },
                    { "type": "graphOutput", "id": "output", "outputId": "result", "dataType": "any" }
                ],
                "connections": [
                    { "outputNodeId": "destructure", "outputId": "match", "inputNodeId": "output", "inputId": "value" }
                ]
            }]
        }))
        .unwrap();

        assert_eq!(
            prepare_runner(request).unwrap_err(),
            "missing-required-input:main:destructure:object"
        );
    }

    #[test]
    fn rejects_extract_object_path_without_required_object_input() {
        let request = serde_json::from_value::<NativeRuntimeCreateRequest>(json!({
            "graphId": "main",
            "graphs": [{
                "graphId": "main",
                "nodes": [
                    { "type": "extractObjectPath", "id": "extract", "path": "$.value" },
                    { "type": "graphOutput", "id": "output", "outputId": "result", "dataType": "any" }
                ],
                "connections": [
                    { "outputNodeId": "extract", "outputId": "match", "inputNodeId": "output", "inputId": "value" }
                ]
            }]
        }))
        .unwrap();

        assert_eq!(
            prepare_runner(request).unwrap_err(),
            "missing-required-input:main:extract:object"
        );
    }

    #[test]
    fn formats_integer_like_numbers_like_javascript() {
        assert_eq!(number_to_js_string(&Number::from(7)), "7");
        assert_eq!(number_to_js_string(&Number::from_f64(7.0).unwrap()), "7");
        assert_eq!(number_to_js_string(&Number::from_f64(-0.0).unwrap()), "0");
        assert_eq!(
            number_to_js_string(&Number::from_f64(7.25).unwrap()),
            "7.25"
        );
    }

    #[test]
    fn parses_message_id_from_invalid_worker_message() {
        assert_eq!(
            parse_message_id(r#"{"type":"create","id":42,"request":{"graphId":"main"}}"#),
            Some(42)
        );
    }

    fn run_coalesce_for_test(
        ignore_null: bool,
        ignore_undefined: bool,
        node_inputs: DataValueMap,
    ) -> DataValueMap {
        let context = BTreeMap::new();
        let graphs = HashMap::new();
        let inputs = BTreeMap::new();
        let mut graph_inputs = BTreeMap::new();
        let mut graph_outputs = BTreeMap::new();

        run_coalesce_node(
            ignore_null,
            ignore_undefined,
            NodeRunState {
                context: &context,
                graph_inputs: &mut graph_inputs,
                graph_outputs: &mut graph_outputs,
                graphs: &graphs,
                inputs: &inputs,
                node_inputs,
            },
        )
    }

    fn data_value(data_type: &str, value: Option<Value>) -> DataValue {
        DataValue {
            data_type: data_type.to_string(),
            value,
        }
    }

    fn run_destructure_for_test(
        paths: Vec<NativeDestructurePath>,
        node_inputs: DataValueMap,
    ) -> DataValueMap {
        let context = BTreeMap::new();
        let graphs = HashMap::new();
        let inputs = BTreeMap::new();
        let mut graph_inputs = BTreeMap::new();
        let mut graph_outputs = BTreeMap::new();

        run_destructure_node(
            &paths,
            NodeRunState {
                context: &context,
                graph_inputs: &mut graph_inputs,
                graph_outputs: &mut graph_outputs,
                graphs: &graphs,
                inputs: &inputs,
                node_inputs,
            },
        )
    }

    fn run_extract_object_path_for_test(path: &str, node_inputs: DataValueMap) -> DataValueMap {
        let context = BTreeMap::new();
        let graphs = HashMap::new();
        let inputs = BTreeMap::new();
        let mut graph_inputs = BTreeMap::new();
        let mut graph_outputs = BTreeMap::new();

        run_extract_object_path_node(
            path,
            NodeRunState {
                context: &context,
                graph_inputs: &mut graph_inputs,
                graph_outputs: &mut graph_outputs,
                graphs: &graphs,
                inputs: &inputs,
                node_inputs,
            },
        )
    }

    fn run_object_for_test(
        json_template: &str,
        node_inputs: DataValueMap,
        context: DataValueMap,
    ) -> Result<DataValueMap, String> {
        let graphs = HashMap::new();
        let inputs = BTreeMap::new();
        let mut graph_inputs = BTreeMap::new();
        let mut graph_outputs = BTreeMap::new();

        run_object_node(
            json_template,
            NodeRunState {
                context: &context,
                graph_inputs: &mut graph_inputs,
                graph_outputs: &mut graph_outputs,
                graphs: &graphs,
                inputs: &inputs,
                node_inputs,
            },
        )
    }
}
