import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createAdminForm,
  getAdminApp,
  getAdminForm,
  getAdminShared,
  listAdminApps,
  patchAdminApp,
  putAdminForm,
  putAdminShared,
  type FormContentLocation,
} from '../api/formApi';
import { useAuth } from '../auth/AuthContext';
import { DesignActionsEditor } from '../components/design/DesignActionsEditor';
import { DesignCanvas } from '../components/design/DesignCanvas';
import { DesignHelpChatPanel } from '../components/design/DesignHelpChatPanel';
import { DesignGridEditor } from '../components/design/DesignGridEditor';
import { DesignInspector } from '../components/design/DesignInspector';
import {
  DesignQuickHelpPanel,
} from '../components/design/DesignQuickHelpPanel';
import { DesignSplitter } from '../components/design/DesignSplitter';
import { DesignPreview } from '../components/DesignPreview';
import type { DesignViewport } from '../lib/pcLayout';
import { JsonCodeEditor, type JsonEditorTheme } from '../components/JsonCodeEditor';
import type { DesignHelpKind } from '../api/designHelpApi';
import {
  addColumn,
  addControl,
  addList,
  deleteColumn,
  deleteControl,
  deleteList,
  duplicateColumn,
  duplicateControl,
  insertColumnAfter,
  insertControlAfter,
  moveColumn,
  moveControlGroupToInsertIndexInZone,
  normalizeOrders,
  updateControl,
} from '../lib/formDocOps';
import { formatFormJson, stripNulls } from '../lib/formatFormJson';
import {
  collapseFormDocument,
  emptySharedBundle,
  formatSourceJson,
  mergeFormDocument,
  sharedBundleFromApi,
  type FormSharedBundle,
} from '../lib/formInclude';
import { clearRuntimeFormCacheForSlug } from '../lib/formRuntimeCache';
import { setLocalizedPart } from '../lib/localizedText';
import type { AdminAppSummary } from '../types/form';
import type { DesignSelection, FormDocument } from '../types/formDoc';
import { parseFormDocument } from '../types/formDoc';

const JSON_THEME_KEY = 'arito_form_design_json_theme';
const DESIGN_UI_THEME_KEY = 'arito_form_design_ui_theme';
const PANEL_LAYOUT_KEY = 'arito_form_design_panels';
const HISTORY_MAX = 40;

type PanelLayout = {
  showApps: boolean;
  showProperty: boolean;
  showPreview: boolean;
  appsW: number;
  propertyW: number;
  previewW: number;
};

const DEFAULT_PANELS: PanelLayout = {
  showApps: true,
  showProperty: true,
  showPreview: true,
  appsW: 220,
  propertyW: 240,
  previewW: 340,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readPanelLayout(): PanelLayout {
  try {
    const raw = localStorage.getItem(PANEL_LAYOUT_KEY);
    if (!raw) return { ...DEFAULT_PANELS };
    const p = JSON.parse(raw) as Partial<PanelLayout>;
    return {
      showApps: p.showApps !== false,
      showProperty: p.showProperty !== false,
      showPreview: p.showPreview !== false,
      appsW: clamp(Number(p.appsW) || DEFAULT_PANELS.appsW, 140, 420),
      propertyW: clamp(Number(p.propertyW) || DEFAULT_PANELS.propertyW, 180, 420),
      previewW: clamp(Number(p.previewW) || DEFAULT_PANELS.previewW, 220, 520),
    };
  } catch {
    return { ...DEFAULT_PANELS };
  }
}

function readJsonTheme(): JsonEditorTheme {
  try {
    const v = localStorage.getItem(JSON_THEME_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readDesignUiTheme(): 'light' | 'dark' {
  try {
    const v = localStorage.getItem(DESIGN_UI_THEME_KEY);
    return v === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

type ToastState = { text: string; level: 'success' | 'error' | 'info' } | null;
type EditorMode = 'design' | 'actions' | 'json';
/** Form đang design, hoặc file shared (chỉ JSON). */
type TreeFocus =
  | { kind: 'form'; formId: string }
  | { kind: 'shared-actions' }
  | { kind: 'shared-fragment'; id: string };

function applyMergedFromSource(
  sourceText: string,
  shared: FormSharedBundle,
): { doc: FormDocument | null; error: string | null; source: FormDocument | null } {
  try {
    const parsed = JSON.parse(sourceText) as unknown;
    const source = parseFormDocument(parsed);
    if (!source) return { doc: null, error: 'Form JSON không hợp lệ', source: null };
    const doc = mergeFormDocument(source, shared);
    return { doc, error: null, source };
  } catch (e) {
    return {
      doc: null,
      error: e instanceof Error ? e.message : 'JSON / include invalid',
      source: null,
    };
  }
}

export function DesignPage() {
  const { slug: routeSlug = '', formId: routeFormId } = useParams();
  const navigate = useNavigate();
  const { jwt, status: authStatus } = useAuth();

  const [apps, setApps] = useState<AdminAppSummary[]>([]);
  const [title, setTitle] = useState('');
  const [appStatus, setAppStatus] = useState('draft');
  const [entryFormId, setEntryFormId] = useState('main');
  const [formIds, setFormIds] = useState<string[]>([]);
  const [activeForm, setActiveForm] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [savedJson, setSavedJson] = useState('');
  const [formDoc, setFormDoc] = useState<FormDocument | null>(null);
  const [sharedBundle, setSharedBundle] = useState<FormSharedBundle>(emptySharedBundle);
  const [sharedDirty, setSharedDirty] = useState(false);
  const [treeFocus, setTreeFocus] = useState<TreeFocus | null>(null);
  const [selection, setSelection] = useState<DesignSelection | null>({ kind: 'form' });
  const [editorMode, setEditorMode] = useState<EditorMode>('design');
  const [actionsFocus, setActionsFocus] = useState<{ id: string | null; nonce: number }>({
    id: null,
    nonce: 0,
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const formDocRef = useRef<FormDocument | null>(null);
  const jsonTextRef = useRef('');
  const sharedBundleRef = useRef<FormSharedBundle>(emptySharedBundle());
  const sharedActionIdsRef = useRef<Set<string>>(new Set());
  /** JSON form source khi đang mở file shared. */
  const formJsonCacheRef = useRef('');
  const treeFocusRef = useRef<TreeFocus | null>(null);

  const [newFormId, setNewFormId] = useState('');
  const [newFormTitle, setNewFormTitle] = useState('');
  const [newFormTemplate, setNewFormTemplate] = useState<'blank' | 'picker' | 'list'>('blank');
  const [location, setLocation] = useState<FormContentLocation | null>(null);
  const [jsonTheme, setJsonTheme] = useState<JsonEditorTheme>(() => readJsonTheme());
  const [designUiTheme, setDesignUiTheme] = useState<'light' | 'dark'>(() => readDesignUiTheme());
  const [designViewport, setDesignViewport] = useState<DesignViewport>('phone');
  const [panels, setPanels] = useState<PanelLayout>(() => readPanelLayout());
  const [showLocationInfo, setShowLocationInfo] = useState(false);
  const [helpChatOpen, setHelpChatOpen] = useState(false);
  const [quickHelpOpen, setQuickHelpOpen] = useState(false);
  const [helpChatPrompt, setHelpChatPrompt] = useState<string | null>(null);
  const [helpEmbedKind, setHelpEmbedKind] = useState<DesignHelpKind | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [gridEditorListId, setGridEditorListId] = useState<string | null>(null);

  const historyRef = useRef<string[]>([]);
  const histIndexRef = useRef(-1);
  const applyingHistoryRef = useRef(false);

  const slug = routeSlug.trim();
  const isSharedFocus =
    treeFocus?.kind === 'shared-actions' || treeFocus?.kind === 'shared-fragment';
  const dirty = jsonText !== savedJson || (!isSharedFocus && sharedDirty);

  useEffect(() => {
    setGridEditorListId(null);
  }, [slug, activeForm]);
  const runtimeHref = useMemo(() => {
    if (!slug) return '';
    const q = new URLSearchParams();
    if (appStatus !== 'published') q.set('preview', 'true');
    if (activeForm) q.set('formId', activeForm);
    const qs = q.toString();
    return `/runtime/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`;
  }, [slug, appStatus, activeForm]);
  formDocRef.current = formDoc;
  jsonTextRef.current = jsonText;
  sharedBundleRef.current = sharedBundle;
  treeFocusRef.current = treeFocus;

  const refreshHistoryFlags = useCallback(() => {
    setCanUndo(histIndexRef.current > 0);
    setCanRedo(histIndexRef.current >= 0 && histIndexRef.current < historyRef.current.length - 1);
  }, []);

  const pushHistory = useCallback(
    (text: string) => {
      if (applyingHistoryRef.current) return;
      const h = historyRef.current.slice(0, histIndexRef.current + 1);
      if (h[h.length - 1] === text) return;
      h.push(text);
      while (h.length > HISTORY_MAX) h.shift();
      historyRef.current = h;
      histIndexRef.current = h.length - 1;
      refreshHistoryFlags();
    },
    [refreshHistoryFlags],
  );

  const resetHistory = useCallback(
    (text: string) => {
      historyRef.current = [text];
      histIndexRef.current = 0;
      refreshHistoryFlags();
    },
    [refreshHistoryFlags],
  );

  const setJsonThemePersist = useCallback((theme: JsonEditorTheme) => {
    setJsonTheme(theme);
    try {
      localStorage.setItem(JSON_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, []);

  const setDesignUiThemePersist = useCallback((theme: 'light' | 'dark') => {
    setDesignUiTheme(theme);
    setJsonThemePersist(theme);
    try {
      localStorage.setItem(DESIGN_UI_THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [setJsonThemePersist]);

  const updatePanels = useCallback((patch: Partial<PanelLayout> | ((prev: PanelLayout) => PanelLayout)) => {
    setPanels((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      try {
        localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const showToast = useCallback((text: string, level: NonNullable<ToastState>['level'] = 'success') => {
    setToast({ text, level });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  const syncDocFromText = useCallback((text: string): FormDocument | null => {
    const { doc, error } = applyMergedFromSource(text, sharedBundleRef.current);
    if (error) {
      setParseError(error);
      setFormDoc(null);
      return null;
    }
    setParseError(null);
    setFormDoc(doc);
    return doc;
  }, []);

  const applyHistoryText = useCallback(
    (text: string) => {
      applyingHistoryRef.current = true;
      setJsonText(text);
      jsonTextRef.current = text;
      syncDocFromText(text);
      applyingHistoryRef.current = false;
      refreshHistoryFlags();
    },
    [syncDocFromText, refreshHistoryFlags],
  );

  const undo = useCallback(() => {
    if (histIndexRef.current <= 0) return;
    histIndexRef.current -= 1;
    const text = historyRef.current[histIndexRef.current];
    if (text != null) applyHistoryText(text);
  }, [applyHistoryText]);

  const redo = useCallback(() => {
    if (histIndexRef.current >= historyRef.current.length - 1) return;
    histIndexRef.current += 1;
    const text = historyRef.current[histIndexRef.current];
    if (text != null) applyHistoryText(text);
  }, [applyHistoryText]);

  const validateJson = useCallback((text: string): unknown | null => {
    try {
      const parsed = JSON.parse(text) as unknown;
      setParseError(null);
      return parsed;
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'JSON invalid');
      return null;
    }
  }, []);

  const commitDoc = useCallback((next: FormDocument) => {
    const normalized = normalizeOrders(next);
    const collapsed = collapseFormDocument(
      normalized,
      sharedBundleRef.current,
      sharedActionIdsRef.current,
    );
    sharedBundleRef.current = collapsed.shared;
    setSharedBundle(collapsed.shared);
    if (collapsed.dirtyFragmentIds.length > 0 || collapsed.dirtySharedActions) {
      setSharedDirty(true);
    }

    const remapped = mergeFormDocument(collapsed.source, collapsed.shared);
    setFormDoc(remapped);
    formDocRef.current = remapped;

    const text = formatSourceJson(collapsed.source, jsonTextRef.current);
    setJsonText(text);
    jsonTextRef.current = text;
    setParseError(null);
    pushHistory(text);
  }, [pushHistory]);

  const editAction = useCallback((actionId: string) => {
    syncDocFromText(jsonTextRef.current);
    setEditorMode('actions');
    setActionsFocus((f) => ({ id: actionId, nonce: f.nonce + 1 }));
  }, [syncDocFromText]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const loadApps = useCallback(async () => {
    const res = await listAdminApps();
    if (res.success && res.data) setApps(res.data);
  }, []);

  const loadForm = useCallback(
    async (appKey: string, formId: string) => {
      const [res, sharedRes] = await Promise.all([
        getAdminForm(appKey, formId),
        getAdminShared(appKey),
      ]);
      if (!res.success || !res.data) {
        setError(res.error || 'Không tải form');
        return;
      }
      const shared = sharedRes.success && sharedRes.data
        ? sharedBundleFromApi(sharedRes.data)
        : emptySharedBundle();
      sharedBundleRef.current = shared;
      sharedActionIdsRef.current = new Set(Object.keys(shared.actions));
      setSharedBundle(shared);
      setSharedDirty(false);

      const text = formatFormJson(res.data.json);
      setJsonText(text);
      setSavedJson(text);
      jsonTextRef.current = text;
      const { doc, error: mergeErr } = applyMergedFromSource(text, shared);
      if (mergeErr) {
        setParseError(mergeErr);
        setFormDoc(null);
        setError(mergeErr);
      } else {
        setParseError(null);
        setFormDoc(doc);
        setError(null);
      }
      resetHistory(text);
      setSelection({ kind: 'form' });
      setTreeFocus({ kind: 'form', formId });
      formJsonCacheRef.current = text;
      setEditorMode((m) => (m === 'json' ? m : 'design'));
      setLocation({
        contentSource: res.data.contentSource || 'Path',
        relativePath: res.data.relativePath || '',
        file: res.data.file,
        fileId: res.data.fileId,
        fileName: res.data.fileName,
        filesBaseUrl: res.data.filesBaseUrl,
        folderId: res.data.folderId,
      });
      setPreviewKey((k) => k + 1);
    },
    [resetHistory],
  );

  const loadApp = useCallback(
    async (appKey: string, preferForm?: string) => {
      const res = await getAdminApp(appKey);
      if (!res.success || !res.data) {
        setError(res.error || 'Không tải app');
        return;
      }
      const app = res.data.app;
      setTitle(app.title);
      setAppStatus(app.status);
      setEntryFormId(app.entryFormId);
      setFormIds(res.data.formIds);
      const nextForm =
        (preferForm && res.data.formIds.includes(preferForm) && preferForm) ||
        res.data.formIds[0] ||
        app.entryFormId;
      setActiveForm(nextForm);
      if (nextForm) await loadForm(app.slug, nextForm);
      setError(null);
    },
    [loadForm],
  );

  useEffect(() => {
    if (authStatus !== 'ready' || !jwt) return;
    void loadApps();
  }, [authStatus, jwt, loadApps]);

  useEffect(() => {
    if (authStatus !== 'ready' || !jwt || !slug) return;
    void loadApp(slug, routeFormId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, jwt, slug]);

  useEffect(() => {
    if (!routeFormId || !slug || routeFormId === activeForm) return;
    if (!formIds.includes(routeFormId)) return;
    if (dirty && !window.confirm('Có thay đổi chưa lưu. Đổi form?')) {
      navigate(`/admin/design/${slug}/${activeForm}`, { replace: true });
      return;
    }
    setActiveForm(routeFormId);
    void loadForm(slug, routeFormId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeFormId]);

  const selectForm = async (fid: string) => {
    const focus = treeFocusRef.current;
    if (focus?.kind === 'form' && focus.formId === fid && fid === activeForm) return;

    if (dirty && !window.confirm('Có thay đổi chưa lưu. Đổi file?')) return;

    // Từ shared quay lại form đang mở — không reload API
    if (fid === activeForm && focus?.kind !== 'form') {
      const text = formJsonCacheRef.current || jsonTextRef.current;
      setTreeFocus({ kind: 'form', formId: fid });
      setJsonText(text);
      setSavedJson(text);
      jsonTextRef.current = text;
      syncDocFromText(text);
      resetHistory(text);
      setEditorMode('design');
      setSelection({ kind: 'form' });
      setError(null);
      setParseError(null);
      return;
    }

    setActiveForm(fid);
    navigate(`/admin/design/${slug}/${fid}`, { replace: true });
    await loadForm(slug, fid);
  };

  const openSharedActions = () => {
    const focus = treeFocusRef.current;
    if (focus?.kind === 'shared-actions') return;
    if (dirty && !window.confirm('Có thay đổi chưa lưu. Đổi file?')) return;
    if (focus?.kind === 'form') formJsonCacheRef.current = jsonTextRef.current;

    const text = formatFormJson(sharedBundleRef.current.actions ?? {});
    setTreeFocus({ kind: 'shared-actions' });
    setJsonText(text);
    setSavedJson(text);
    jsonTextRef.current = text;
    setParseError(null);
    setFormDoc(null);
    setEditorMode('json');
    resetHistory(text);
    setError(null);
    setLocation({
      contentSource: location?.contentSource || 'Path',
      relativePath: `${slug}/shared/actions.json`,
      file: 'shared/actions.json',
      fileName: 'actions.json',
    });
  };

  const openSharedFragment = (fragId: string) => {
    const focus = treeFocusRef.current;
    if (focus?.kind === 'shared-fragment' && focus.id === fragId) return;
    if (dirty && !window.confirm('Có thay đổi chưa lưu. Đổi file?')) return;
    if (focus?.kind === 'form') formJsonCacheRef.current = jsonTextRef.current;

    const frag = sharedBundleRef.current.fragments[fragId] ?? {
      id: fragId,
      kind: 'controls',
      controls: [],
    };
    const text = formatFormJson(frag);
    setTreeFocus({ kind: 'shared-fragment', id: fragId });
    setJsonText(text);
    setSavedJson(text);
    jsonTextRef.current = text;
    setParseError(null);
    setFormDoc(null);
    setEditorMode('json');
    resetHistory(text);
    setError(null);
    setLocation({
      contentSource: location?.contentSource || 'Path',
      relativePath: `${slug}/shared/fragments/${fragId}.json`,
      file: `shared/fragments/${fragId}.json`,
      fileName: `${fragId}.json`,
    });
  };

  const rematchFormFromShared = useCallback((shared: FormSharedBundle) => {
    const formText = formJsonCacheRef.current;
    if (!formText.trim()) return;
    const { doc, error: mergeErr } = applyMergedFromSource(formText, shared);
    if (mergeErr) {
      setError(mergeErr);
      return;
    }
    setFormDoc(doc);
    formDocRef.current = doc;
  }, []);

  const selectApp = (nextSlug: string) => {
    if (nextSlug === slug) return;
    if (dirty && !window.confirm('Có thay đổi chưa lưu. Đổi app?')) return;
    navigate(`/admin/design/${nextSlug}`);
  };

  const onJsonChange = (text: string) => {
    setJsonText(text);
    const focus = treeFocusRef.current;
    if (focus?.kind !== 'form') {
      if (!text.trim()) {
        setParseError(null);
        return;
      }
      try {
        JSON.parse(text);
        setParseError(null);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'JSON invalid');
      }
      return;
    }
    if (!text.trim()) {
      setParseError(null);
      setFormDoc(null);
      return;
    }
    formJsonCacheRef.current = text;
    syncDocFromText(text);
  };

  const saveForm = useCallback(async (): Promise<boolean> => {
    const parsed = validateJson(jsonText);
    if (parsed == null) {
      setError(parseError || 'JSON invalid');
      showToast(parseError || 'JSON invalid', 'error');
      return false;
    }
    const cleaned = stripNulls(parsed);
    const focus = treeFocusRef.current;
    setBusy(true);
    try {
      if (focus?.kind === 'shared-actions') {
        if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
          showToast('actions.json phải là object', 'error');
          return false;
        }
        const actions = cleaned as Record<string, Record<string, unknown>>;
        const sharedRes = await putAdminShared(slug, { actions });
        if (!sharedRes.success) {
          setError(sharedRes.error || 'Lưu actions thất bại');
          showToast(sharedRes.error || 'Lưu actions thất bại', 'error');
          return false;
        }
        const nextShared: FormSharedBundle = {
          ...sharedBundleRef.current,
          actions,
        };
        sharedBundleRef.current = nextShared;
        sharedActionIdsRef.current = new Set(Object.keys(actions));
        setSharedBundle(nextShared);
        const pretty = formatFormJson(actions);
        setJsonText(pretty);
        setSavedJson(pretty);
        jsonTextRef.current = pretty;
        pushHistory(pretty);
        rematchFormFromShared(nextShared);
        setError(null);
        showToast(`Đã lưu ${slug}/shared/actions.json`);
        return true;
      }

      if (focus?.kind === 'shared-fragment') {
        if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
          showToast('Fragment phải là object', 'error');
          return false;
        }
        const frag = {
          ...(cleaned as Record<string, unknown>),
          id: focus.id,
        };
        const sharedRes = await putAdminShared(slug, {
          fragments: { [focus.id]: frag },
        });
        if (!sharedRes.success) {
          setError(sharedRes.error || 'Lưu fragment thất bại');
          showToast(sharedRes.error || 'Lưu fragment thất bại', 'error');
          return false;
        }
        const nextShared: FormSharedBundle = {
          ...sharedBundleRef.current,
          fragments: {
            ...sharedBundleRef.current.fragments,
            [focus.id]: frag as FormSharedBundle['fragments'][string],
          },
        };
        sharedBundleRef.current = nextShared;
        setSharedBundle(nextShared);
        const pretty = formatFormJson(frag);
        setJsonText(pretty);
        setSavedJson(pretty);
        jsonTextRef.current = pretty;
        pushHistory(pretty);
        rematchFormFromShared(nextShared);
        setError(null);
        showToast(`Đã lưu ${slug}/shared/fragments/${focus.id}.json`);
        return true;
      }

      const res = await putAdminForm(slug, activeForm, cleaned);
      if (!res.success) {
        setError(res.error || 'Lưu form thất bại');
        showToast(res.error || 'Lưu form thất bại', 'error');
        return false;
      }

      const wroteShared = sharedDirty;
      if (wroteShared) {
        const shared = sharedBundleRef.current;
        const sharedRes = await putAdminShared(slug, {
          actions: shared.actions,
          fragments: shared.fragments,
        });
        if (!sharedRes.success) {
          setError(sharedRes.error || 'Lưu shared/fragments thất bại');
          showToast(sharedRes.error || 'Lưu shared thất bại', 'error');
          return false;
        }
        sharedActionIdsRef.current = new Set(Object.keys(shared.actions));
        setSharedDirty(false);
      }

      const pretty = formatFormJson(cleaned);
      setJsonText(pretty);
      setSavedJson(pretty);
      jsonTextRef.current = pretty;
      formJsonCacheRef.current = pretty;
      syncDocFromText(pretty);
      pushHistory(pretty);
      setError(null);
      if (res.data?.location) {
        setLocation(res.data.location);
      }
      clearRuntimeFormCacheForSlug(slug);
      setPreviewKey((k) => k + 1);
      if (wroteShared) {
        const fragIds = Object.keys(sharedBundleRef.current.fragments).sort();
        const fragHint =
          fragIds.length === 1
            ? `${slug}/shared/fragments/${fragIds[0]}.json`
            : fragIds.length > 1
              ? `${slug}/shared/fragments/*.json (${fragIds.length})`
              : `${slug}/shared/`;
        showToast(`Đã lưu form + ${fragHint}`);
      } else {
        showToast('Đã lưu form');
      }
      return true;
    } finally {
      setBusy(false);
    }
  }, [
    jsonText,
    validateJson,
    parseError,
    slug,
    activeForm,
    showToast,
    syncDocFromText,
    pushHistory,
    sharedDirty,
    rematchFormFromShared,
  ]);

  const downloadJson = useCallback(() => {
    const parsed = validateJson(jsonText);
    if (parsed == null) {
      showToast(parseError || 'JSON invalid', 'error');
      return;
    }
    const pretty = formatFormJson(parsed);
    const blob = new Blob([pretty], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const focus = treeFocusRef.current;
    if (focus?.kind === 'shared-actions') a.download = 'actions.json';
    else if (focus?.kind === 'shared-fragment') a.download = `${focus.id}.json`;
    else a.download = `${slug || 'app'}-${activeForm || 'form'}.form.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải JSON', 'info');
  }, [jsonText, validateJson, parseError, slug, activeForm, showToast]);

  const locationLabel = useMemo(() => {
    if (!location?.relativePath && !location?.fileId) return null;
    if (location.contentSource === 'Files') {
      const host = location.filesBaseUrl?.replace(/^https?:\/\//, '') || 'Files';
      const parts = [
        `Files · ${host}`,
        location.folderId ? `folder ${location.folderId.slice(0, 8)}…` : null,
        location.relativePath,
        location.fileName ? `file ${location.fileName}` : null,
        location.fileId ? `id ${location.fileId}` : null,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    return `Path · ${location.relativePath}`;
  }, [location]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const t = e.target as HTMLElement | null;
      const inField =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable);

      if (key === 's') {
        if (!slug || !activeForm) return;
        e.preventDefault();
        if (busy) return;
        void saveForm();
        return;
      }

      // Undo/Redo Design — không chiếm Ctrl+Z trong textarea JSON
      if (editorMode === 'json' && inField) return;

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slug, activeForm, busy, saveForm, undo, redo, editorMode]);

  const saveMeta = async () => {
    setBusy(true);
    try {
      const res = await patchAdminApp(slug, {
        title,
        status: appStatus,
        entryFormId,
      });
      if (!res.success) {
        setError(res.error || 'Lưu meta thất bại');
        showToast(res.error || 'Lưu meta thất bại', 'error');
        return;
      }
      setError(null);
      showToast('Đã lưu meta app', 'success');
      await loadApps();
    } finally {
      setBusy(false);
    }
  };

  const createForm = async () => {
    const id = newFormId.trim();
    if (!id) {
      showToast('Nhập form id', 'error');
      return;
    }
    if (dirty && !window.confirm('Có thay đổi chưa lưu. Tạo form mới?')) return;
    setBusy(true);
    try {
      const res = await createAdminForm(slug, {
        id,
        title: newFormTitle.trim() || id,
        template: newFormTemplate,
      });
      if (!res.success || !res.data) {
        setError(res.error || 'Tạo form thất bại');
        showToast(res.error || 'Tạo form thất bại', 'error');
        return;
      }
      setNewFormId('');
      setNewFormTitle('');
      setError(null);
      showToast(`Đã tạo form ${res.data.formId}`, 'success');
      await loadApps();
      await loadApp(slug, res.data.formId);
      navigate(`/admin/design/${slug}/${res.data.formId}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const contentRootHint = useMemo(() => {
    const a = apps.find((x) => x.slug === slug);
    return a ? `${a.formIds.length} form(s)` : '';
  }, [apps, slug]);

  const requestAddControl = () => {
    if (!formDoc) return;
    const before = new Set(formDoc.controls.map((c) => c.id));
    const next = addControl(formDoc, 'text', 'field');
    commitDoc(next);
    const created = next.controls.find((c) => !before.has(c.id));
    if (created) setSelection({ kind: 'control', id: created.id });
  };

  const requestAddIconButton = () => {
    if (!formDoc) return;
    const before = new Set(formDoc.controls.map((c) => c.id));
    const next = addControl(formDoc, 'iconButton', 'menu');
    commitDoc(next);
    const created = next.controls.find((c) => !before.has(c.id));
    if (created) setSelection({ kind: 'control', id: created.id });
  };

  const requestAddList = () => {
    if (!formDoc) return;
    const next = addList(formDoc, 'list');
    commitDoc(next);
    const created = next.lists[next.lists.length - 1];
    if (created) setSelection({ kind: 'list', id: created.id });
  };

  const requestAddColumn = (listId: string) => {
    if (!formDoc) return;
    const list = formDoc.lists.find((l) => l.id === listId);
    if (!list) return;
    const before = new Set(list.columns.map((c) => c.field));
    const next = addColumn(formDoc, listId, 'field', 'Cột mới');
    commitDoc(next);
    const updated = next.lists.find((l) => l.id === listId);
    const created = updated?.columns.find((c) => !before.has(c.field));
    if (created) setSelection({ kind: 'column', listId, field: created.field });
  };

  const copyControl = (id: string) => {
    if (!formDoc) return;
    const next = duplicateControl(formDoc, id);
    commitDoc(next);
    const added = next.controls.find((c) => !formDoc.controls.some((o) => o.id === c.id));
    if (added) setSelection({ kind: 'control', id: added.id });
  };

  const insertControlBelow = (id: string) => {
    if (!formDoc) return;
    const before = new Set(formDoc.controls.map((c) => c.id));
    const next = insertControlAfter(formDoc, id, 'text');
    commitDoc(next);
    const added = next.controls.find((c) => !before.has(c.id));
    if (added) setSelection({ kind: 'control', id: added.id });
  };

  const copyColumn = (listId: string, field: string) => {
    if (!formDoc) return;
    const list = formDoc.lists.find((l) => l.id === listId);
    if (!list) return;
    const before = new Set(list.columns.map((c) => c.field));
    const next = duplicateColumn(formDoc, listId, field);
    commitDoc(next);
    const updated = next.lists.find((l) => l.id === listId);
    const created = updated?.columns.find((c) => !before.has(c.field));
    if (created) setSelection({ kind: 'column', listId, field: created.field });
  };

  const insertColumnBelow = (listId: string, field: string) => {
    if (!formDoc) return;
    const list = formDoc.lists.find((l) => l.id === listId);
    if (!list) return;
    const before = new Set(list.columns.map((c) => c.field));
    const next = insertColumnAfter(formDoc, listId, field);
    commitDoc(next);
    const updated = next.lists.find((l) => l.id === listId);
    const created = updated?.columns.find((c) => !before.has(c.field));
    if (created) setSelection({ kind: 'column', listId, field: created.field });
  };

  const helpChatKind: DesignHelpKind =
    helpEmbedKind ?? (editorMode === 'actions' ? 'actions' : 'design');

  if (authStatus === 'loading') {
    return (
      <div className="shell">
        <p className="muted">Đang khởi tạo…</p>
      </div>
    );
  }

  if (!jwt) {
    return null;
  }

  if (!slug) {
    return (
      <div className="design-root">
        <aside className="design-col design-tree">
          <div className="design-col-head">
            <strong>MobileForms</strong>
            <Link to="/admin">List</Link>
          </div>
          <div className="design-tree-body">
            {apps.map((a) => (
              <button
                key={a.id}
                type="button"
                className="design-tree-app"
                onClick={() => navigate(`/admin/design/${a.slug}`)}
              >
                <span>{a.title}</span>
                <span className="muted">{a.slug}</span>
              </button>
            ))}
            {apps.length === 0 && <p className="muted">Chưa có app.</p>}
          </div>
        </aside>
        <main className="design-col design-empty">
          <p className="muted">Chọn app bên trái để mở Designer.</p>
        </main>
      </div>
    );
  }

  return (
    <div
      className="design-root"
      data-theme={designUiTheme}
      data-apps={panels.showApps ? 'on' : 'off'}
      data-preview={panels.showPreview ? 'on' : 'off'}
      style={
        {
          '--design-apps-w': `${panels.appsW}px`,
          '--design-preview-w': `${panels.previewW}px`,
          '--design-property-w': `${panels.propertyW}px`,
        } as CSSProperties
      }
    >
      {toast && <div className={`toast toast-tr ${toast.level}`}>{toast.text}</div>}

      {panels.showApps && (
        <aside className="design-col design-tree">
          <div className="design-col-head">
            <strong>Apps</strong>
            <div className="design-col-head-actions">
              <Link to="/admin">List</Link>
              <button
                type="button"
                className="design-icon-btn"
                title="Ẩn Apps"
                aria-label="Ẩn Apps"
                onClick={() => updatePanels({ showApps: false })}
              >
                ◂
              </button>
            </div>
          </div>
          <div className="design-tree-body">
            {apps.map((a) => (
              <div key={a.id} className="design-tree-block">
                <button
                  type="button"
                  className={`design-tree-app${a.slug === slug ? ' active' : ''}`}
                  onClick={() => selectApp(a.slug)}
                >
                  <span>{a.title}</span>
                  <span className="muted">
                    {a.slug} · {a.status}
                  </span>
                </button>
                {a.slug === slug && (
                  <>
                    <div className="design-tree-section-label">forms</div>
                    <div className="design-tree-forms">
                      {formIds.map((fid) => (
                        <button
                          key={fid}
                          type="button"
                          className={`design-tree-form${
                            treeFocus?.kind === 'form' && fid === activeForm ? ' active' : ''
                          }`}
                          onClick={() => void selectForm(fid)}
                        >
                          {fid}
                          {fid === entryFormId ? ' ★' : ''}
                        </button>
                      ))}
                    </div>
                    <div className="design-tree-section-label">shared</div>
                    <div className="design-tree-forms">
                      <button
                        type="button"
                        className={`design-tree-form design-tree-shared${
                          treeFocus?.kind === 'shared-actions' ? ' active' : ''
                        }`}
                        title={`${slug}/shared/actions.json — chỉ sửa JSON`}
                        onClick={() => openSharedActions()}
                      >
                        actions.json
                      </button>
                      <div className="design-tree-section-label design-tree-section-label--nested">
                        fragments
                      </div>
                      {Object.keys(sharedBundle.fragments)
                        .sort((x, y) => x.localeCompare(y))
                        .map((fid) => (
                          <button
                            key={fid}
                            type="button"
                            className={`design-tree-form design-tree-shared design-tree-fragment${
                              treeFocus?.kind === 'shared-fragment' && treeFocus.id === fid
                                ? ' active'
                                : ''
                            }`}
                            title={`${slug}/shared/fragments/${fid}.json — chỉ sửa JSON`}
                            onClick={() => openSharedFragment(fid)}
                          >
                            {fid}.json
                          </button>
                        ))}
                      {Object.keys(sharedBundle.fragments).length === 0 && (
                        <p className="muted design-tree-empty">Chưa có fragment</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="design-create stack">
            <strong className="muted">Tạo form</strong>
            <input
              placeholder="form id"
              value={newFormId}
              onChange={(e) => setNewFormId(e.target.value)}
            />
            <input
              placeholder="title"
              value={newFormTitle}
              onChange={(e) => setNewFormTitle(e.target.value)}
            />
            <select
              value={newFormTemplate}
              onChange={(e) => setNewFormTemplate(e.target.value as 'blank' | 'picker' | 'list')}
            >
              <option value="blank">blank</option>
              <option value="picker">picker</option>
              <option value="list">list (list only + mock)</option>
            </select>
            <button type="button" disabled={busy || !newFormId.trim()} onClick={() => void createForm()}>
              Tạo
            </button>
          </div>
        </aside>
      )}

      {panels.showApps && (
        <DesignSplitter
          title="Kéo: độ rộng Apps"
          onDrag={(dx) =>
            updatePanels((p) => ({ ...p, appsW: clamp(p.appsW + dx, 140, 420) }))
          }
        />
      )}

      <section className="design-col design-editor">
        <div className="design-col-head">
          <div className="stack" style={{ gap: 4 }}>
            <strong>
              {title || slug}
              {dirty ? ' · chưa lưu' : ''}
            </strong>
            <span className="muted">
              {isSharedFocus
                ? treeFocus?.kind === 'shared-actions'
                  ? `${slug}/shared/actions.json · JSON only`
                  : `${slug}/shared/fragments/${treeFocus && 'id' in treeFocus ? treeFocus.id : ''}.json · JSON only`
                : activeForm}
              {!isSharedFocus && contentRootHint ? ` · ${contentRootHint}` : ''}
              {' · Ctrl+S lưu'}
              {!isSharedFocus ? ' & preview' : ''}
            </span>
          </div>
          <div className="design-toolbar-icons">
            <button
              type="button"
              className={`design-icon-btn${panels.showApps ? ' active' : ''}`}
              title={panels.showApps ? 'Ẩn Apps' : 'Hiện Apps'}
              aria-label="Toggle Apps"
              onClick={() => updatePanels({ showApps: !panels.showApps })}
            >
              ☰
            </button>
            <button
              type="button"
              className={`design-icon-btn${panels.showProperty ? ' active' : ''}`}
              title={panels.showProperty ? 'Ẩn Property' : 'Hiện Property'}
              aria-label="Toggle Property"
              onClick={() => updatePanels({ showProperty: !panels.showProperty })}
            >
              ▤
            </button>
            <button
              type="button"
              className={`design-icon-btn${panels.showPreview ? ' active' : ''}`}
              title={panels.showPreview ? 'Ẩn Preview' : 'Hiện Preview'}
              aria-label="Toggle Preview"
              onClick={() => updatePanels({ showPreview: !panels.showPreview })}
            >
              ◫
            </button>
            <span className="design-toolbar-sep" />
            <div className="design-viewport-toggle" title="Viewport Design / Preview">
              <button
                type="button"
                className={designViewport === 'phone' ? 'active' : ''}
                onClick={() => setDesignViewport('phone')}
              >
                Phone
              </button>
              <button
                type="button"
                className={designViewport === 'pc' ? 'active' : ''}
                onClick={() => setDesignViewport('pc')}
              >
                PC
              </button>
            </div>
            <span className="design-toolbar-sep" />
            <button
              type="button"
              className="design-icon-btn"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={() => undo()}
            >
              ↶
            </button>
            <button
              type="button"
              className="design-icon-btn"
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={() => redo()}
            >
              ↷
            </button>
            <span className="design-toolbar-sep" />
            <button
              type="button"
              className="design-icon-btn"
              title="Lưu meta app"
              aria-label="Lưu meta"
              disabled={busy}
              onClick={() => void saveMeta()}
            >
              🏷
            </button>
            <button
              type="button"
              className="design-icon-btn primary"
              title="Lưu form (Ctrl+S)"
              aria-label="Lưu form"
              disabled={busy || !activeForm}
              onClick={() => void saveForm()}
            >
              💾
            </button>
            <button
              type="button"
              className="design-icon-btn"
              title="Download JSON"
              aria-label="Download"
              disabled={!activeForm || !jsonText.trim()}
              onClick={() => downloadJson()}
            >
              ⬇
            </button>
            <button
              type="button"
              className="design-icon-btn"
              title="Refresh Preview (lưu nếu chưa lưu)"
              aria-label="Preview"
              disabled={busy || !activeForm}
              onClick={async () => {
                if (dirty) {
                  const ok = await saveForm();
                  if (!ok) return;
                } else {
                  setPreviewKey((k) => k + 1);
                }
              }}
            >
              👁
            </button>
            <span className="design-toolbar-sep" />
            <div className="design-info-wrap">
              <button
                type="button"
                className={`design-icon-btn${showLocationInfo ? ' active' : ''}`}
                title="Thông tin (lưu tại / embed)"
                aria-label="Thông tin"
                onClick={() => setShowLocationInfo((v) => !v)}
              >
                ℹ
              </button>
              {showLocationInfo && (
                <div className="design-info-pop" role="dialog">
                  {locationLabel ? (
                    <>
                      <strong>Lưu tại</strong>
                      <p>{locationLabel}</p>
                    </>
                  ) : null}
                  <strong>Embed</strong>
                  <p>
                    <code>
                      /runtime/{slug}?mobile=true&amp;embed_token=…
                    </code>
                  </p>
                  <button type="button" className="secondary" onClick={() => setShowLocationInfo(false)}>
                    Đóng
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="banner">{error}</div>}
        {parseError && <div className="banner">JSON: {parseError}</div>}

        <div className="design-meta row">
          {!isSharedFocus && (
            <>
          <label className="field" style={{ flex: 2 }}>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            Status
            <select value={appStatus} onChange={(e) => setAppStatus(e.target.value)}>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className="field">
            Entry
            <select value={entryFormId} onChange={(e) => setEntryFormId(e.target.value)}>
              {formIds.map((fid) => (
                <option key={fid} value={fid}>
                  {fid}
                </option>
              ))}
            </select>
          </label>
            </>
          )}
          {isSharedFocus && (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Đang sửa file shared — chỉ tab JSON. Sửa xong Ctrl+S; quay lại form ở cây bên trái để Design.
            </p>
          )}
        </div>

        <div className="design-editor-body">
          {(editorMode === 'json' || isSharedFocus) && (
            <JsonCodeEditor
              className="design-json"
              theme={jsonTheme}
              value={jsonText}
              onChange={onJsonChange}
              onBlur={() => {
                if (!jsonText.trim() || parseError) return;
                const parsed = validateJson(jsonText);
                if (parsed != null) {
                  const pretty = formatFormJson(parsed);
                  setJsonText(pretty);
                  jsonTextRef.current = pretty;
                  if (!isSharedFocus) {
                    formJsonCacheRef.current = pretty;
                    syncDocFromText(pretty);
                  }
                  pushHistory(pretty);
                }
              }}
            />
          )}

          {!isSharedFocus && editorMode === 'actions' && (
            formDoc ? (
              <DesignActionsEditor
                doc={formDoc}
                theme={jsonTheme}
                formIds={formIds}
                onCommit={commitDoc}
                focusActionId={actionsFocus.id}
                focusNonce={actionsFocus.nonce}
              />
            ) : (
              <div className="design-workbench-empty">
                <p className="muted">JSON không hợp lệ — sửa tab JSON rồi mở Actions.</p>
              </div>
            )
          )}

          {!isSharedFocus && editorMode === 'design' && (
            <div
              className="design-workbench"
              data-property={panels.showProperty ? 'on' : 'off'}
            >
              {!formDoc ? (
                <div className="design-workbench-empty">
                  <p className="muted">JSON không hợp lệ — sửa tab JSON rồi quay lại Design.</p>
                </div>
              ) : (
                <>
                  <DesignCanvas
                    doc={formDoc}
                    selection={selection}
                    viewport={designViewport}
                    onSelect={setSelection}
                    onRequestAddControl={requestAddControl}
                    onRequestAddIconButton={requestAddIconButton}
                    onRequestAddList={requestAddList}
                    onCopyControl={copyControl}
                    onInsertControl={insertControlBelow}
                    onDeleteControl={(id) => {
                      commitDoc(deleteControl(formDoc, id));
                      setSelection({ kind: 'form' });
                    }}
                    onDeleteList={(id) => {
                      commitDoc(deleteList(formDoc, id));
                      setSelection({ kind: 'form' });
                    }}
                    onAddColumn={requestAddColumn}
                    onCopyColumn={copyColumn}
                    onInsertColumn={insertColumnBelow}
                    onDeleteColumn={(listId, field) => {
                      commitDoc(deleteColumn(formDoc, listId, field));
                      setSelection({ kind: 'list', id: listId });
                    }}
                    onMoveGroupToInsertIndex={(zone, from, insertAt) => {
                      const doc = formDocRef.current;
                      if (!doc) return;
                      commitDoc(moveControlGroupToInsertIndexInZone(doc, zone, from, insertAt));
                    }}
                    onMoveColumn={(listId, field, toIndex) =>
                      commitDoc(moveColumn(formDoc, listId, field, toIndex))
                    }
                    onPatchControlLabel={(id, value) => {
                      const c = formDoc.controls.find((x) => x.id === id);
                      if (!c) return;
                      if (c.type === 'button' || c.type === 'iconButton' || c.type === 'label') {
                        commitDoc(
                          updateControl(formDoc, id, {
                            text: setLocalizedPart(c.text, 'v', value),
                          }),
                        );
                      } else {
                        commitDoc(
                          updateControl(formDoc, id, {
                            label: setLocalizedPart(c.label, 'v', value),
                          }),
                        );
                      }
                    }}
                  />
                  {panels.showProperty && (
                    <DesignSplitter
                      title="Kéo: độ rộng Property"
                      onDrag={(dx) =>
                        updatePanels((p) => ({
                          ...p,
                          propertyW: clamp(p.propertyW - dx, 180, 420),
                        }))
                      }
                    />
                  )}
                  {panels.showProperty && (
                    <DesignInspector
                      doc={formDoc}
                      selection={selection}
                      formIds={formIds}
                      slug={slug}
                      onCommit={commitDoc}
                      onSelect={setSelection}
                      onEditAction={editAction}
                      onOpenGridEditor={(listId) => setGridEditorListId(listId)}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="design-footer-bar">
          <div className="design-footer-actions">
            <nav className="design-mode-links" aria-label="Chế độ editor">
              {!isSharedFocus && (
                <>
              <button
                type="button"
                className={`design-mode-link${editorMode === 'design' ? ' active' : ''}`}
                onClick={() => {
                  syncDocFromText(jsonText);
                  setEditorMode('design');
                }}
              >
                Design
              </button>
              <button
                type="button"
                className={`design-mode-link${editorMode === 'actions' ? ' active' : ''}`}
                onClick={() => {
                  syncDocFromText(jsonText);
                  setEditorMode('actions');
                }}
              >
                Actions
              </button>
                </>
              )}
              <button
                type="button"
                className={`design-mode-link${editorMode === 'json' || isSharedFocus ? ' active' : ''}`}
                onClick={() => setEditorMode('json')}
              >
                JSON
              </button>
            </nav>
            <button
              type="button"
              className={`design-icon-btn${quickHelpOpen ? ' active' : ''}`}
              title="Hướng dẫn nhanh"
              aria-label="Hướng dẫn nhanh"
              onClick={() => setQuickHelpOpen((v) => !v)}
            >
              ?
            </button>
            <button
              type="button"
              className={`design-icon-btn${helpChatOpen ? ' active' : ''}`}
              title={
                helpChatKind === 'actions'
                  ? 'Chat hỗ trợ Event / SQL'
                  : 'Chat hỗ trợ Design Form / List'
              }
              aria-label="Chat hỗ trợ"
              onClick={() => {
                setHelpChatPrompt(null);
                setHelpEmbedKind(null);
                setHelpChatOpen((v) => !v);
              }}
            >
              💬
            </button>
            <button
              type="button"
              className="design-icon-btn design-theme-toggle"
              title={designUiTheme === 'dark' ? 'Giao diện Light' : 'Giao diện Dark'}
              aria-label={designUiTheme === 'dark' ? 'Light' : 'Dark'}
              onClick={() => setDesignUiThemePersist(designUiTheme === 'dark' ? 'light' : 'dark')}
            >
              {designUiTheme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>
      </section>

      <DesignQuickHelpPanel
        open={quickHelpOpen}
        editorMode={editorMode}
        selection={selection}
        doc={formDoc}
        onClose={() => setQuickHelpOpen(false)}
        onAskChat={(kind, prompt) => {
          setQuickHelpOpen(false);
          setHelpEmbedKind(kind);
          setHelpChatPrompt(prompt);
          setHelpChatOpen(true);
        }}
      />

      <DesignHelpChatPanel
        open={helpChatOpen}
        kind={helpChatKind}
        suggestedPrompt={helpChatPrompt}
        onClose={() => {
          setHelpChatOpen(false);
          setHelpChatPrompt(null);
          setHelpEmbedKind(null);
        }}
      />

      {panels.showPreview && (
        <DesignSplitter
          title="Kéo: độ rộng Preview"
          onDrag={(dx) =>
            updatePanels((p) => ({ ...p, previewW: clamp(p.previewW - dx, 220, 520) }))
          }
        />
      )}

      {panels.showPreview && (
        <section className="design-col design-preview">
          <div className="design-col-head">
            <div className="design-preview-title">
              <strong>Preview</strong>
              {dirty && (
                <span
                  className="design-preview-warn"
                  title="Có thay đổi chưa lưu — preview đang hiện bản đã lưu trên server."
                  aria-label="Preview chưa đồng bộ"
                >
                  ⚠
                </span>
              )}
            </div>
            <div className="design-col-head-actions">
              <span className="muted">{dirty ? 'bản đã lưu' : 'đồng bộ'}</span>
              <button
                type="button"
                className="design-icon-btn"
                title="Ẩn Preview"
                aria-label="Ẩn Preview"
                onClick={() => updatePanels({ showPreview: false })}
              >
                ▸
              </button>
            </div>
          </div>
          <div className="design-preview-body">
            <DesignPreview
              slug={slug}
              formId={activeForm}
              refreshKey={previewKey}
              viewport={designViewport}
            />
          </div>
          {runtimeHref ? (
            <div className="design-preview-footer">
              <a
                className="design-preview-runtime-link"
                href={runtimeHref}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  activeForm
                    ? `Mở runtime: ${slug}/${activeForm}`
                    : `Mở runtime: ${slug}`
                }
              >
                ▶ Runtime
                {activeForm ? ` · ${activeForm}` : ''}
              </a>
            </div>
          ) : null}
        </section>
      )}
      {gridEditorListId && formDoc ? (
        <DesignGridEditor
          doc={formDoc}
          listId={gridEditorListId}
          onCommit={commitDoc}
          onClose={() => setGridEditorListId(null)}
        />
      ) : null}
    </div>
  );
}
