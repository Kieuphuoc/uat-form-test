/** Pretty-print JSON: bỏ null; mảng object “phẳng” mỗi phần tử 1 dòng; giữ Unicode đọc được. */
export function formatFormJson(value: unknown, indent = 2): string {
  return stringify(stripNulls(value), 0, indent);
}

/** Loại bỏ null (và key có value null) đệ quy — giữ false/0/''. */
export function stripNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(stripNulls).filter((x) => x !== undefined);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = stripNulls(v);
      if (next !== undefined) out[k] = next;
    }
    return out;
  }
  return value;
}

/** JSON string literal — không escape Unicode thành \uXXXX (chỉ escape control + " \). */
export function jsonStringLiteral(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const c = s[i]!;
    if (c === '"') out += '\\"';
    else if (c === '\\') out += '\\\\';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += c;
  }
  return `${out}"`;
}

function stringify(value: unknown, depth: number, indent: number): string {
  const pad = ' '.repeat(depth * indent);
  const padIn = ' '.repeat((depth + 1) * indent);

  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return jsonStringLiteral(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every(isCompactObject)) {
      const lines = value.map((item) => `${padIn}${compactObject(item as Record<string, unknown>)}`);
      return `[\n${lines.join(',\n')}\n${pad}]`;
    }
    const items = value.map((item) => `${padIn}${stringify(item, depth + 1, indent)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined,
    );
    if (entries.length === 0) return '{}';
    const lines = entries.map(
      ([k, v]) => `${padIn}${jsonStringLiteral(k)}: ${stringify(v, depth + 1, indent)}`,
    );
    return `{\n${lines.join(',\n')}\n${pad}}`;
  }

  return JSON.stringify(value);
}

function isCompactObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isPrimitiveOrPrimitiveArray);
}

function isPrimitiveOrPrimitiveArray(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (Array.isArray(value))
    return value.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x));
  return false;
}

function compactObject(obj: Record<string, unknown>): string {
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => {
      if (typeof v === 'string') return `${jsonStringLiteral(k)}: ${jsonStringLiteral(v)}`;
      return `${jsonStringLiteral(k)}: ${JSON.stringify(v)}`;
    });
  return `{ ${parts.join(', ')} }`;
}
