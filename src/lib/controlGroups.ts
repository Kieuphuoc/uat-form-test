import type { FormControlDef } from '../types/form';
import { resolveLocalizedText, type LangCode } from './localizedText';

/** Control pin cuối form (thanh footer). */
export function isFooterControl(c: FormControlDef): boolean {
  return (c.placement ?? '').trim().toLowerCase() === 'footer';
}

/** Tách controls body / footer (đã sort theo order). */
export function splitControlsByPlacement(controls: FormControlDef[]): {
  body: FormControlDef[];
  footer: FormControlDef[];
} {
  const sorted = [...controls].sort((a, b) => a.order - b.order);
  const body: FormControlDef[] = [];
  const footer: FormControlDef[] = [];
  for (const c of sorted) {
    if (isFooterControl(c)) footer.push(c);
    else body.push(c);
  }
  return { body, footer };
}

/** Hàng ngang (cùng rowId kề nhau). */
export type RowLayoutGroup =
  | { kind: 'single'; control: FormControlDef }
  | { kind: 'row'; rowId: string; controls: FormControlDef[] };

/** Runtime / preview: accordion groupId bọc các hàng. */
export type AccordionLayoutGroup =
  | RowLayoutGroup
  | {
      kind: 'group';
      groupId: string;
      label: string;
      icon?: string;
      background?: string;
      defaultCollapsed: boolean;
      items: RowLayoutGroup[];
    };

/** Đơn vị kéo-thả trên Design canvas. */
export type DesignControlGroup =
  | { kind: 'single'; control: FormControlDef }
  | { kind: 'row'; rowId: string; controls: FormControlDef[] }
  | { kind: 'group'; groupId: string; controls: FormControlDef[] }
  | {
      kind: 'include';
      fragmentId: string;
      controls: FormControlDef[];
    };

/** Gom control cùng rowId (kề nhau theo order) thành một hàng. */
export function groupControlsByRowId(controls: FormControlDef[]): RowLayoutGroup[] {
  const sorted = [...controls].sort((a, b) => a.order - b.order);
  const groups: RowLayoutGroup[] = [];

  for (const c of sorted) {
    const rowId = c.rowId?.trim();
    if (!rowId) {
      groups.push({ kind: 'single', control: c });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === 'row' && last.rowId === rowId) {
      last.controls.push(c);
    } else {
      groups.push({ kind: 'row', rowId, controls: [c] });
    }
  }

  return groups.map((g) =>
    g.kind === 'row' && g.controls.length === 1
      ? { kind: 'single' as const, control: g.controls[0]! }
      : g,
  );
}

export function resolveGroupLabel(
  controls: FormControlDef[],
  groupId: string,
  lan: LangCode = 'v',
): string {
  for (const c of controls) {
    const t = resolveLocalizedText(c.groupLabel, lan).trim();
    if (t) return t;
  }
  return groupId;
}

export function resolveGroupIcon(controls: FormControlDef[]): string | undefined {
  for (const c of controls) {
    const icon = c.groupIcon?.trim();
    if (icon) return icon;
  }
  return undefined;
}

export function resolveGroupBackground(controls: FormControlDef[]): string | undefined {
  for (const c of controls) {
    const bg = c.groupBackground?.trim();
    if (bg) return bg;
  }
  return undefined;
}

export function resolveGroupDefaultCollapsed(controls: FormControlDef[]): boolean {
  return controls.some((c) => c.groupCollapsed === true);
}

/**
 * Layout runtime: cụm `groupId` (kề nhau) → accordion;
 * trong/ ngoài group vẫn gom `rowId` thành hàng.
 */
export function groupControlsForLayout(
  controls: FormControlDef[],
  lan: LangCode = 'v',
): AccordionLayoutGroup[] {
  const sorted = [...controls].sort((a, b) => a.order - b.order);
  const out: AccordionLayoutGroup[] = [];
  let i = 0;
  while (i < sorted.length) {
    const gid = sorted[i]!.groupId?.trim();
    if (gid) {
      const cluster: FormControlDef[] = [];
      while (i < sorted.length && sorted[i]!.groupId?.trim() === gid) {
        cluster.push(sorted[i]!);
        i++;
      }
      out.push({
        kind: 'group',
        groupId: gid,
        label: resolveGroupLabel(cluster, gid, lan),
        icon: resolveGroupIcon(cluster),
        background: resolveGroupBackground(cluster),
        defaultCollapsed: resolveGroupDefaultCollapsed(cluster),
        items: groupControlsByRowId(cluster),
      });
    } else {
      const run: FormControlDef[] = [];
      while (i < sorted.length && !sorted[i]!.groupId?.trim()) {
        run.push(sorted[i]!);
        i++;
      }
      out.push(...groupControlsByRowId(run));
    }
  }
  return out;
}

/** Plain (không include): groupId → rowId → single. */
function groupPlainForDesign(controls: FormControlDef[]): DesignControlGroup[] {
  const sorted = [...controls].sort((a, b) => a.order - b.order);
  const out: DesignControlGroup[] = [];
  let i = 0;
  while (i < sorted.length) {
    const gid = sorted[i]!.groupId?.trim();
    if (gid) {
      const cluster: FormControlDef[] = [];
      while (i < sorted.length && sorted[i]!.groupId?.trim() === gid) {
        cluster.push(sorted[i]!);
        i++;
      }
      out.push({ kind: 'group', groupId: gid, controls: cluster });
    } else {
      const run: FormControlDef[] = [];
      while (i < sorted.length && !sorted[i]!.groupId?.trim()) {
        run.push(sorted[i]!);
        i++;
      }
      for (const g of groupControlsByRowId(run)) {
        out.push(g);
      }
    }
  }
  return out;
}

/** Nhóm design DnD: includeOf → groupId → rowId → single. */
export function groupControlsForDesign(controls: FormControlDef[]): DesignControlGroup[] {
  const sorted = [...controls].sort((a, b) => a.order - b.order);
  type Chunk =
    | { kind: 'include'; fragmentId: string; controls: FormControlDef[] }
    | { kind: 'plain'; controls: FormControlDef[] };
  const chunks: Chunk[] = [];
  for (const c of sorted) {
    const of = c.includeOf?.trim();
    if (of) {
      const last = chunks[chunks.length - 1];
      if (last?.kind === 'include' && last.fragmentId === of) last.controls.push(c);
      else chunks.push({ kind: 'include', fragmentId: of, controls: [c] });
      continue;
    }
    const last = chunks[chunks.length - 1];
    if (last?.kind === 'plain') last.controls.push(c);
    else chunks.push({ kind: 'plain', controls: [c] });
  }

  const out: DesignControlGroup[] = [];
  for (const ch of chunks) {
    if (ch.kind === 'include') {
      out.push({ kind: 'include', fragmentId: ch.fragmentId, controls: ch.controls });
    } else {
      out.push(...groupPlainForDesign(ch.controls));
    }
  }
  return out;
}

export function flattenDesignGroup(g: DesignControlGroup): FormControlDef[] {
  return g.kind === 'single' ? [g.control] : g.controls;
}
