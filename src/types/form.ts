export type ClientActionMeta = {
  type: string;
  paramNames?: string[];
  formId?: string;
  mode?: string;
};

export type FormControlDef = {
  id: string;
  type: string;
  label?: string;
  order: number;
  required?: boolean;
  enabled?: boolean;
  visible?: boolean;
  bind?: string;
  text?: string;
  options?: unknown;
  optionsFrom?: string;
  onChange?: string[];
  onClick?: string[];
};

export type FormListDef = {
  id: string;
  order: number;
  bind: string;
  columns: { field: string; title: string }[];
  rowKey?: string;
  onRowClick?: string[];
};

export type ClientFormDto = {
  id: string;
  title: string;
  layout: string;
  controls: FormControlDef[];
  lists: FormListDef[];
  datasets?: Record<string, string>;
  onLoad?: string[];
  actions?: Record<string, ClientActionMeta>;
};

export type RuntimeAppResponse = {
  id: string;
  slug: string;
  title: string;
  entryFormId: string;
  status: string;
  form: ClientFormDto;
  datasets?: Record<string, Record<string, unknown>[]>;
  values?: Record<string, unknown>;
  state?: Record<string, unknown>;
};

export type RuntimeUiDirective = {
  openForm?: { formId: string; mode?: string; returnMap?: Record<string, string> };
  close?: { ok?: boolean; returnValues?: Record<string, unknown> };
  message?: { text: string; level?: string };
};

export type RuntimeActionResponse = {
  datasets?: Record<string, Record<string, unknown>[]>;
  values?: Record<string, unknown>;
  state?: Record<string, unknown>;
  ui?: RuntimeUiDirective;
};

export type AdminAppSummary = {
  id: string;
  slug: string;
  title: string;
  status: string;
  entryFormId: string;
  connectionKey: string;
  formIds: string[];
  updatedAt?: string;
};
