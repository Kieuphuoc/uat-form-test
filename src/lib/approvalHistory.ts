import type { GraphLayout, WfAssigneeRow, WfEdgeRow, WfNodeRow } from '../types/approval';

export type ApprovalSnapshot = {
  nodes: WfNodeRow[];
  edges: WfEdgeRow[];
  assignees: WfAssigneeRow[];
  layout: GraphLayout;
};

const HISTORY_MAX = 40;

function cloneSnapshot(s: ApprovalSnapshot): ApprovalSnapshot {
  return {
    nodes: s.nodes.map((n) => ({ ...n })),
    edges: s.edges.map((e) => ({ ...e })),
    assignees: s.assignees.map((a) => ({ ...a })),
    layout: Object.fromEntries(
      Object.entries(s.layout).map(([k, v]) => [k, { x: v.x, y: v.y }]),
    ),
  };
}

function sameSnapshot(a: ApprovalSnapshot, b: ApprovalSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Stack undo/redo cho designer Approval. */
export class ApprovalHistory {
  private past: ApprovalSnapshot[] = [];
  private future: ApprovalSnapshot[] = [];
  private present: ApprovalSnapshot | null = null;

  reset(snapshot: ApprovalSnapshot) {
    this.present = cloneSnapshot(snapshot);
    this.past = [];
    this.future = [];
  }

  /** Ghi snapshot sau mutation (bỏ qua nếu trùng present). */
  push(snapshot: ApprovalSnapshot) {
    const next = cloneSnapshot(snapshot);
    if (this.present && sameSnapshot(this.present, next)) return;
    if (this.present) {
      this.past.push(this.present);
      if (this.past.length > HISTORY_MAX) this.past.shift();
    }
    this.present = next;
    this.future = [];
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  undo(): ApprovalSnapshot | null {
    if (!this.present || this.past.length === 0) return null;
    this.future.push(this.present);
    this.present = this.past.pop()!;
    return cloneSnapshot(this.present);
  }

  redo(): ApprovalSnapshot | null {
    if (!this.present || this.future.length === 0) return null;
    this.past.push(this.present);
    this.present = this.future.pop()!;
    return cloneSnapshot(this.present);
  }
}
