import type {
  GraphLayout,
  WfAssigneeRow,
  WfEdgeRow,
  WfNodeRow,
  WfNodeType,
} from '../types/approval';

export type ApprovalGraph = {
  nodes: WfNodeRow[];
  edges: WfEdgeRow[];
  assignees: WfAssigneeRow[];
};

export type GraphMutationResult = ApprovalGraph & {
  selectedNodeKey: string;
};

const DEFAULT_NODE_WIDTH = 176;
const LEVEL_GAP = 132;
const LANE_GAP = 224;

function uniqueKey(base: string, nodes: WfNodeRow[]): string {
  const keys = new Set(nodes.map((node) => node.node_key));
  if (!keys.has(base)) return base;
  let suffix = 2;
  while (keys.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function makeNode(nodeKey: string, type: WfNodeType, order: number): WfNodeRow {
  const config =
    type === 'condition'
      ? { field: 'so_ngay', label: 'Điều kiện' }
      : type === 'approve'
        ? { label: 'Bước duyệt' }
        : {};
  return {
    node_key: nodeKey,
    node_type: type,
    config_json: JSON.stringify(config),
    sort_order: order,
  };
}

function makeAssignee(nodeKey: string): WfAssigneeRow {
  return {
    node_key: nodeKey,
    resolve_type: 'role',
    resolve_value: 'truong_phong',
  };
}

function normalizeOrders(graph: ApprovalGraph): ApprovalGraph {
  return {
    nodes: graph.nodes.map((node, index) => ({ ...node, sort_order: index })),
    edges: graph.edges.map((edge, index) => ({ ...edge, sort_order: index })),
    assignees: graph.assignees,
  };
}

/**
 * Auto-layout theo tầng. Graph có merge vẫn hiển thị ổn và không phụ thuộc tọa độ kéo tay.
 */
export function autoLayoutApprovalGraph(
  nodes: WfNodeRow[],
  edges: WfEdgeRow[],
): GraphLayout {
  if (nodes.length === 0) return {};

  const nodeKeys = new Set(nodes.map((node) => node.node_key));
  const indegree = new Map(nodes.map((node) => [node.node_key, 0]));
  const outgoing = new Map<string, WfEdgeRow[]>();
  for (const edge of edges) {
    if (!nodeKeys.has(edge.from_node_key) || !nodeKeys.has(edge.to_node_key)) continue;
    indegree.set(edge.to_node_key, (indegree.get(edge.to_node_key) ?? 0) + 1);
    const list = outgoing.get(edge.from_node_key) ?? [];
    list.push(edge);
    outgoing.set(edge.from_node_key, list);
  }

  const level = new Map<string, number>();
  const queue = nodes
    .filter((node) => (indegree.get(node.node_key) ?? 0) === 0)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((node) => node.node_key);
  queue.forEach((key) => level.set(key, 0));

  while (queue.length > 0) {
    const key = queue.shift()!;
    const nextLevel = (level.get(key) ?? 0) + 1;
    for (const edge of outgoing.get(key) ?? []) {
      level.set(edge.to_node_key, Math.max(level.get(edge.to_node_key) ?? 0, nextLevel));
      const nextDegree = (indegree.get(edge.to_node_key) ?? 1) - 1;
      indegree.set(edge.to_node_key, nextDegree);
      if (nextDegree === 0) queue.push(edge.to_node_key);
    }
  }

  // Node cycle/disconnected vẫn được xếp xuống cuối để người dùng nhìn thấy và sửa.
  const maxKnownLevel = Math.max(0, ...level.values());
  nodes.forEach((node) => {
    if (!level.has(node.node_key)) level.set(node.node_key, maxKnownLevel + 1);
  });

  const levels = new Map<number, WfNodeRow[]>();
  nodes.forEach((node) => {
    const depth = level.get(node.node_key) ?? 0;
    const list = levels.get(depth) ?? [];
    list.push(node);
    levels.set(depth, list);
  });

  const widest = Math.max(1, ...Array.from(levels.values()).map((items) => items.length));
  const canvasWidth = Math.max(720, widest * LANE_GAP);
  const layout: GraphLayout = {};

  Array.from(levels.entries())
    .sort(([a], [b]) => a - b)
    .forEach(([depth, items]) => {
      items.sort((a, b) => a.sort_order - b.sort_order);
      const rowWidth = items.length * LANE_GAP;
      const startX = Math.max(32, (canvasWidth - rowWidth) / 2 + (LANE_GAP - DEFAULT_NODE_WIDTH) / 2);
      items.forEach((node, lane) => {
        layout[node.node_key] = {
          x: startX + lane * LANE_GAP,
          y: 52 + depth * LEVEL_GAP,
        };
      });
    });

  return layout;
}

/** Giữ tọa độ đã kéo; node mới / thiếu tọa độ lấy từ auto-layout. */
export function mergeLayoutWithAuto(
  nodes: WfNodeRow[],
  edges: WfEdgeRow[],
  existing?: GraphLayout | null,
): GraphLayout {
  const auto = autoLayoutApprovalGraph(nodes, edges);
  if (!existing || Object.keys(existing).length === 0) return auto;
  const merged: GraphLayout = { ...auto };
  for (const node of nodes) {
    const prev = existing[node.node_key];
    if (prev) merged[node.node_key] = { x: prev.x, y: prev.y };
  }
  return merged;
}

export function validateApprovalGraph(graph: ApprovalGraph): string[] {
  const errors: string[] = [];
  const starts = graph.nodes.filter((node) => node.node_type === 'start');
  const ends = graph.nodes.filter((node) => node.node_type === 'end');
  if (starts.length !== 1) errors.push('Luồng phải có đúng một bước Bắt đầu.');
  if (ends.length === 0) errors.push('Luồng phải có ít nhất một bước Kết thúc.');

  const nodeKeys = new Set(graph.nodes.map((node) => node.node_key));
  for (const edge of graph.edges) {
    if (!nodeKeys.has(edge.from_node_key) || !nodeKeys.has(edge.to_node_key)) {
      errors.push('Có đường nối trỏ tới bước không tồn tại.');
    }
  }

  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((edge) => edge.from_node_key === node.node_key);
    if (node.node_type !== 'end' && outgoing.length === 0) {
      errors.push(`Bước “${node.node_key}” chưa có bước tiếp theo.`);
    }
    if (node.node_type === 'condition') {
      if (outgoing.length < 2) {
        errors.push(`Điều kiện “${node.node_key}” phải có ít nhất hai nhánh.`);
      }
      if (outgoing.some((edge) => !edge.condition_json)) {
        errors.push(`Mỗi nhánh của “${node.node_key}” phải có điều kiện.`);
      }
    }
    if (node.node_type === 'approve') {
      const assignee = graph.assignees.find((item) => item.node_key === node.node_key);
      if (!assignee?.resolve_value?.trim()) {
        errors.push(`Bước duyệt “${node.node_key}” chưa chọn người duyệt.`);
      }
    }
  }

  if (starts.length === 1) {
    const reachable = new Set<string>();
    const queue = [starts[0].node_key];
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (reachable.has(key)) continue;
      reachable.add(key);
      graph.edges
        .filter((edge) => edge.from_node_key === key)
        .forEach((edge) => queue.push(edge.to_node_key));
    }
    const unreachable = graph.nodes.filter((node) => !reachable.has(node.node_key));
    if (unreachable.length > 0) {
      errors.push(`Có bước không nối từ Bắt đầu: ${unreachable.map((node) => node.node_key).join(', ')}.`);
    }
  }

  return Array.from(new Set(errors));
}

/**
 * Chèn bước vào một cạnh. Chèn Điều kiện sẽ tạo sẵn hai nhánh duyệt để luôn có graph hợp lệ.
 */
export function insertStepOnEdge(
  graph: ApprovalGraph,
  edgeIndex: number,
  type: 'approve' | 'condition',
): GraphMutationResult {
  const edge = graph.edges[edgeIndex];
  if (!edge) throw new Error('Không tìm thấy vị trí chèn bước.');

  if (type === 'approve') {
    const key = uniqueKey('approve', graph.nodes);
    const node = makeNode(key, 'approve', graph.nodes.length);
    const edges = graph.edges.flatMap((item, index) =>
      index === edgeIndex
        ? [
            {
              from_node_key: item.from_node_key,
              to_node_key: key,
              sort_order: item.sort_order,
              condition_json: item.condition_json ?? null,
            },
            {
              from_node_key: key,
              to_node_key: item.to_node_key,
              sort_order: item.sort_order + 1,
              condition_json: null,
            },
          ]
        : [item],
    );
    const normalized = normalizeOrders({
      nodes: [...graph.nodes, node],
      edges,
      assignees: [...graph.assignees, makeAssignee(key)],
    });
    return { ...normalized, selectedNodeKey: key };
  }

  const conditionKey = uniqueKey('condition', graph.nodes);
  const branchOneKey = uniqueKey('approve_branch_1', graph.nodes);
  const branchTwoKey = uniqueKey('approve_branch_2', [
    ...graph.nodes,
    { ...makeNode(branchOneKey, 'approve', 0) },
  ]);
  const condition = makeNode(conditionKey, 'condition', graph.nodes.length);
  const branchOne = {
    ...makeNode(branchOneKey, 'approve', graph.nodes.length + 1),
    config_json: JSON.stringify({ label: 'Duyệt nhánh 1' }),
  };
  const branchTwo = {
    ...makeNode(branchTwoKey, 'approve', graph.nodes.length + 2),
    config_json: JSON.stringify({ label: 'Duyệt nhánh 2' }),
  };
  const replacement: WfEdgeRow[] = [
    {
      from_node_key: edge.from_node_key,
      to_node_key: conditionKey,
      sort_order: edge.sort_order,
      condition_json: edge.condition_json ?? null,
    },
    {
      from_node_key: conditionKey,
      to_node_key: branchOneKey,
      sort_order: 0,
      condition_json: JSON.stringify({ field: 'so_ngay', op: '<=', value: 1 }),
    },
    {
      from_node_key: conditionKey,
      to_node_key: branchTwoKey,
      sort_order: 1,
      condition_json: JSON.stringify({ field: 'so_ngay', op: '>', value: 1 }),
    },
    {
      from_node_key: branchOneKey,
      to_node_key: edge.to_node_key,
      sort_order: 0,
      condition_json: null,
    },
    {
      from_node_key: branchTwoKey,
      to_node_key: edge.to_node_key,
      sort_order: 0,
      condition_json: null,
    },
  ];
  const edges = graph.edges.flatMap((item, index) => (index === edgeIndex ? replacement : [item]));
  const normalized = normalizeOrders({
    nodes: [...graph.nodes, condition, branchOne, branchTwo],
    edges,
    assignees: [
      ...graph.assignees,
      makeAssignee(branchOneKey),
      makeAssignee(branchTwoKey),
    ],
  });
  return { ...normalized, selectedNodeKey: conditionKey };
}

export function addConditionBranch(
  graph: ApprovalGraph,
  conditionKey: string,
): GraphMutationResult {
  const condition = graph.nodes.find((node) => node.node_key === conditionKey);
  if (!condition || condition.node_type !== 'condition') {
    throw new Error('Bước đang chọn không phải Điều kiện.');
  }
  const outgoing = graph.edges.filter((edge) => edge.from_node_key === conditionKey);
  const firstBranchTarget = outgoing[0]?.to_node_key;
  const mergeTarget = firstBranchTarget
    ? graph.edges.find((edge) => edge.from_node_key === firstBranchTarget)?.to_node_key
    : graph.nodes.find((node) => node.node_type === 'end')?.node_key;
  if (!mergeTarget) throw new Error('Không xác định được điểm kết thúc cho nhánh mới.');

  const key = uniqueKey(`approve_branch_${outgoing.length + 1}`, graph.nodes);
  const node = {
    ...makeNode(key, 'approve', graph.nodes.length),
    config_json: JSON.stringify({ label: `Duyệt nhánh ${outgoing.length + 1}` }),
  };
  const normalized = normalizeOrders({
    nodes: [...graph.nodes, node],
    edges: [
      ...graph.edges,
      {
        from_node_key: conditionKey,
        to_node_key: key,
        sort_order: outgoing.length,
        condition_json: JSON.stringify({
          field: 'so_ngay',
          op: '>',
          value: outgoing.length,
        }),
      },
      {
        from_node_key: key,
        to_node_key: mergeTarget,
        sort_order: 0,
        condition_json: null,
      },
    ],
    assignees: [...graph.assignees, makeAssignee(key)],
  });
  return { ...normalized, selectedNodeKey: key };
}

export function removeConditionBranch(
  graph: ApprovalGraph,
  conditionEdgeIndex: number,
): ApprovalGraph {
  const edge = graph.edges[conditionEdgeIndex];
  if (!edge) throw new Error('Nhánh không tồn tại.');
  const source = graph.nodes.find((node) => node.node_key === edge.from_node_key);
  if (source?.node_type !== 'condition') {
    return normalizeOrders({
      ...graph,
      edges: graph.edges.filter((_, index) => index !== conditionEdgeIndex),
    });
  }

  const siblings = graph.edges.filter((item) => item.from_node_key === source.node_key);
  if (siblings.length <= 2) {
    throw new Error('Điều kiện phải giữ ít nhất hai nhánh.');
  }

  const target = graph.nodes.find((node) => node.node_key === edge.to_node_key);
  const targetIncoming = graph.edges.filter((item) => item.to_node_key === edge.to_node_key);
  const removeTarget = target?.node_type === 'approve' && targetIncoming.length === 1;
  return normalizeOrders({
    nodes: removeTarget
      ? graph.nodes.filter((node) => node.node_key !== edge.to_node_key)
      : graph.nodes,
    edges: graph.edges.filter(
      (item, index) =>
        index !== conditionEdgeIndex
        && (!removeTarget || item.from_node_key !== edge.to_node_key),
    ),
    assignees: removeTarget
      ? graph.assignees.filter((item) => item.node_key !== edge.to_node_key)
      : graph.assignees,
  });
}

export function deleteApprovalStep(graph: ApprovalGraph, nodeKey: string): ApprovalGraph {
  const node = graph.nodes.find((item) => item.node_key === nodeKey);
  if (!node) throw new Error('Bước không tồn tại.');
  if (node.node_type === 'start' || node.node_type === 'end') {
    throw new Error('Không thể xóa bước Bắt đầu hoặc Kết thúc.');
  }
  if (node.node_type === 'condition') {
    throw new Error('Không xóa trực tiếp Điều kiện có nhiều nhánh. Hãy xóa từng bước nhánh trước.');
  }

  const incoming = graph.edges.filter((edge) => edge.to_node_key === nodeKey);
  const outgoing = graph.edges.filter((edge) => edge.from_node_key === nodeKey);
  if (outgoing.length > 1) throw new Error('Bước có nhiều đường đi, chưa thể xóa tự động.');

  const bypass: WfEdgeRow[] =
    outgoing.length === 1
      ? incoming.map((edge, index) => ({
          from_node_key: edge.from_node_key,
          to_node_key: outgoing[0].to_node_key,
          sort_order: edge.sort_order + index,
          condition_json: edge.condition_json ?? null,
        }))
      : [];
  return normalizeOrders({
    nodes: graph.nodes.filter((item) => item.node_key !== nodeKey),
    edges: [
      ...graph.edges.filter(
        (edge) => edge.from_node_key !== nodeKey && edge.to_node_key !== nodeKey,
      ),
      ...bypass,
    ],
    assignees: graph.assignees.filter((item) => item.node_key !== nodeKey),
  });
}
