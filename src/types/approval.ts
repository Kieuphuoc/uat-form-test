export type WfNodeType = 'start' | 'condition' | 'approve' | 'end';

export type WfDefinitionRow = {
  id: number;
  code: string;
  name: string;
  version: number;
  status: string;
  graph_json?: string | null;
  user_id0: number;
  datetime0: string;
  user_id2?: number | null;
  datetime2?: string | null;
};

export type WfNodeRow = {
  id?: number;
  def_id?: number;
  node_key: string;
  node_type: WfNodeType | string;
  config_json?: string | null;
  sort_order: number;
};

export type WfEdgeRow = {
  id?: number;
  def_id?: number;
  from_node_key: string;
  to_node_key: string;
  sort_order: number;
  condition_json?: string | null;
};

export type WfAssigneeRow = {
  id?: number;
  def_id?: number;
  node_key: string;
  resolve_type: string;
  resolve_value: string;
};

export type WfDefinitionDetail = {
  definition: WfDefinitionRow;
  nodes: WfNodeRow[];
  edges: WfEdgeRow[];
  assignees: WfAssigneeRow[];
};

export type SaveDefinitionRequest = {
  id?: number | null;
  code: string;
  name: string;
  graph_json?: string | null;
  nodes: Array<{
    node_key: string;
    node_type: string;
    config_json?: string | null;
    sort_order: number;
  }>;
  edges: Array<{
    from_node_key: string;
    to_node_key: string;
    sort_order: number;
    condition_json?: string | null;
  }>;
  assignees: Array<{
    node_key: string;
    resolve_type: string;
    resolve_value: string;
  }>;
};

export type GraphLayout = Record<string, { x: number; y: number }>;

export type GraphJson = {
  layout?: GraphLayout;
  note?: string;
};

export type EdgeCondition = {
  op?: string;
  field?: string;
  value?: number | string;
};

export type WfTaskRow = {
  id: number;
  instance_id: number;
  node_key: string;
  assignee_user_id: number;
  status: string;
  due_at?: string | null;
  datetime0: string;
  datetime2?: string | null;
  source_system?: string;
  source_doc_type?: string;
  source_doc_id?: string;
  instance_status?: string;
  payload_json?: string | null;
  def_code?: string;
  def_name?: string;
};

export type WfDecisionRow = {
  id: number;
  task_id: number;
  instance_id: number;
  actor_user_id: number;
  action: string;
  comment?: string | null;
  datetime0: string;
};

export type WfInstanceRow = {
  id: number;
  def_id: number;
  def_version: number;
  source_system: string;
  source_doc_type: string;
  source_doc_id: string;
  payload_json?: string | null;
  assignees_json?: string | null;
  status: string;
  current_node_key?: string | null;
  user_id0: number;
  datetime0: string;
  datetime2?: string | null;
  def_code?: string;
  def_name?: string;
};

export type WfInstanceDetail = {
  instance: WfInstanceRow;
  tasks: WfTaskRow[];
  decisions: WfDecisionRow[];
};

export type StartApprovalRequest = {
  definition_code: string;
  source_system: string;
  source_doc_type: string;
  source_doc_id: string;
  actor_user_id?: number;
  payload?: Record<string, unknown>;
  assignees?: Record<string, number>;
};

export type DecideTaskRequest = {
  action: string;
  comment?: string | null;
};

export type ApprovalSelection =
  | { kind: 'node'; node_key: string }
  | { kind: 'edge'; edge_index: number }
  | null;
