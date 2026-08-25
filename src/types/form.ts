import type { LocalizedText } from '../lib/localizedText';

export type FormControlDef = {
  id: string;
  type: string;
  /** Khi type=include: id fragment shared/fragments/{fragment}.json */
  fragment?: string;
  /**
   * Design-only: control đã expand từ fragment (stamp khi merge).
   * Không ghi vào JSON source.
   */
  includeOf?: string;
  /** Design-only: id slot type=include trên form source. */
  includeSlotId?: string;
  label?: LocalizedText;
  order: number;
  /** Controls cùng rowId (kề nhau theo order) hiển thị một hàng. */
  rowId?: string;
  /**
   * Vùng render:
   * - `body` (mặc định): trong vùng scroll, trước list
   * - `footer`: thanh cố định cuối form (sau list), luôn hiện khi scroll
   */
  placement?: 'body' | 'footer' | string;
  /**
   * Controls cùng groupId (kề nhau theo order) gom thành accordion
   * (header + icon expand/collapse).
   */
  groupId?: string;
  /** Tiêu đề accordion; lấy control đầu tiên có giá trị trong cụm. */
  groupLabel?: LocalizedText;
  /** Icon trên header accordion (giống button); lấy control đầu tiên có giá trị. */
  groupIcon?: string;
  /** Màu nền accordion; lấy control đầu tiên có giá trị. */
  groupBackground?: string;
  /** true = accordion mặc định thu gọn. */
  groupCollapsed?: boolean;
  /** Chiều rộng trong hàng, vd. "40%", "60%" (cùng rowId). */
  width?: string;
  /** Chiều cao control (textarea…), vd. "120px". */
  height?: string;
  required?: boolean;
  enabled?: boolean;
  visible?: boolean;
  /** Chỉ hiện khi formMode thuộc danh sách, vd. ["new","edit"]. */
  visibleModes?: string[];
  /** `debug` = chỉ hiện khi ?debug=1 (vd. Xem log). */
  visibleWhen?: string;
  bind?: string;
  text?: LocalizedText;
  /** Gợi ý trong ô nhập (text / textarea / number…). */
  placeholder?: LocalizedText;
  /** Giá trị mặc định khi formMode = new. */
  defaultValue?: string | number | boolean;
  /** Emoji / ký tự icon (iconButton hoặc button). */
  icon?: string;
  /** Màu nền: ô icon (iconButton) hoặc nút (button). */
  color?: string;
  /** Màu chữ button / label / text… */
  textColor?: string;
  /** Font chữ, vd. `Arial`, `Roboto`, `system-ui`. */
  fontFamily?: string;
  /** Cỡ chữ, vd. `14px`, `1.25rem`. */
  fontSize?: string;
  /** Độ đậm: `normal` | `bold` | `600`… */
  fontWeight?: string;
  /** Kiểu: `normal` | `italic`. */
  fontStyle?: string;
  /** Căn chữ: `left` | `center` | `right`. */
  textAlign?: string;
  /** Mở form khác khi bấm (không cần action SQL). */
  linkFormId?: string;
  options?: unknown;
  optionsFrom?: string;
  /**
   * Nguồn options cho select:
   * - static: mảng `options`
   * - sqlCache: dataset `optionsFrom` (load onLoad, cache như cố định)
   * - sqlSearch: chạy `optionsAction` khi tìm (param @q)
   * - listPicker: mở form `optionsPickerFormId`
   */
  optionsMode?: 'static' | 'sqlCache' | 'sqlSearch' | 'listPicker' | string;
  optionsAction?: string;
  optionsPickerFormId?: string;
  optionsValueField?: string;
  optionsLabelField?: string;
  /**
   * number: pattern ### …
   * date: `dd/MM/yyyy` | `yyyy-MM-dd` | …
   * time: `HH:mm` | `HH:mm:ss`
   */
  format?: string;
  /**
   * label / text: `link` | `mail` | `phone` —
   * view (và label) mở URL / mailto / tel.
   */
  openAs?: 'link' | 'mail' | 'phone' | string;
  /** file/image: extension cho phép, vd. `pdf,doc,docx` hoặc `jpg,png,webp`. */
  accept?: string;
  /** file/image: số file tối đa (mặc định file=5, image=1). */
  maxFiles?: number;
  /**
   * file/image:
   * - `immediate` (mặc định): chọn file → upload ngay (Files status=0 draft)
   * - `onSave`: giữ local, gọi `uploadPendingFormAttachments` khi lưu form
   */
  uploadMode?: 'immediate' | 'onSave' | string;
  /** image: cạnh preview vuông (px), mặc định 50. */
  previewWidth?: number;
  onChange?: string[];
  onClick?: string[];
  /** Override layout PC. Mobile bỏ qua. */
  pc?: FormControlPc;
};

export type FormPcLayout = {
  enabled?: boolean;
  /** Số cột tối đa trên PC (vd. 3). Runtime tự hạ theo bề rộng màn. */
  columns?: number;
};

export type FormControlPc = {
  /** Số cột chiếm (1..N). Mặc định 1. */
  colSpan?: number;
  visible?: boolean;
  order?: number;
};

/** Chế độ tương tác form (khác mode=modal|sheet|fullscreen|drawer của showForm). */
export type FormMode = 'view' | 'new' | 'edit';

export type ClientActionMeta = {
  type: string;
  paramNames?: string[];
  formId?: string;
  mode?: string;
  formMode?: string;
};

export type FormListColumnDef = {
  field: string;
  title: LocalizedText;
  /** text (default) | checkbox | icon | image | stepper */
  type?: string;
  width?: string;
  /** fixed | flex | percent — thiếu thì suy từ width. */
  sizeMode?: 'fixed' | 'flex' | 'percent' | string;
  /** vd. 80px */
  minWidth?: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  readOnly?: boolean;
};

export type FormListPaging = {
  /** none | loadMore | pages */
  mode?: string;
  pageSize?: number;
  /** State key trang 1-based (không prefix state.). */
  pageBind?: string;
  /** replace | append */
  merge?: string;
  totalDataset?: string;
  totalField?: string;
  pageCountBind?: string;
};

export type FormListItemTemplate = {
  /** Field file id / URL ảnh (media). */
  imageField?: string;
  /** Field emoji / icon text. */
  iconField?: string;
  /** Icon khi thiếu ảnh / iconField. */
  defaultIcon?: string;
  /** Fields ghép dòng 1 (vd ma_vt, dvt). */
  line1?: string[];
  /** Fields ghép dòng 2 (vd ten_vt). */
  line2?: string[];
  /** Field meta nhỏ. */
  metaField?: string;
  /** Cạnh thumb vuông px, mặc định 48. */
  imageWidth?: number;
  /** Ngăn cách field cùng line, mặc định " · ". */
  lineSep?: string;
};

export type FormListSearchColumn = {
  field: string;
  /** like | likePrefix | likeSuffix | eq | in */
  op?: string;
};

export type FormListSearch = {
  enabled?: boolean;
  placeholder?: LocalizedText;
  /** State key chuỗi tìm (không prefix state.). */
  queryBind?: string;
  debounceMs?: number;
  /** server (default) | client */
  mode?: string;
  onSearch?: string[];
  columns?: FormListSearchColumn[];
};

export type FormListDef = {
  id: string;
  /** list (mặc định) | include */
  type?: string;
  /** Khi type=include: id fragment. */
  fragment?: string;
  /** Design-only sau merge. */
  includeOf?: string;
  includeSlotId?: string;
  order: number;
  bind: string;
  columns: FormListColumnDef[];
  rowKey?: string;
  onRowClick?: string[];
  /** none | single | multiple */
  selection?: string;
  /** State key mảng khóa đã chọn. */
  selectedKeysBind?: string;
  paging?: FormListPaging;
  onLoadMore?: string[];
  /** table (default) | card | media — hiển thị List (mobile). */
  template?: string;
  itemTemplate?: FormListItemTemplate;
  search?: FormListSearch;
  /** Hiển thị Grid trên PC (cùng load List). Thiếu = PC cũng dùng template List. */
  grid?: FormListGrid;
};

export type FormListGrid = {
  enabled?: boolean;
  rowEdit?: FormListGridRowEdit;
};

export type FormListGridRowEdit = {
  formId?: string;
  /** view | new | edit */
  formMode?: string;
  /** Map đích ← nguồn, giống showForm values (vd. state.id ← row.id). */
  values?: Record<string, string>;
};

export type ClientFormDto = {
  id: string;
  title: LocalizedText;
  /** stack (form) | list (list-only chrome) | drawer (Appdrawer) */
  layout: string;
  /** Mặc định khi mở form nếu không truyền formMode (view|new|edit). */
  defaultFormMode?: string;
  /** Overlay layout PC (opt-in). Mobile bỏ qua. */
  pc?: FormPcLayout;
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
  openForm?: {
    formId: string;
    mode?: string;
    formMode?: string;
    returnMap?: Record<string, string>;
    values?: Record<string, unknown>;
    state?: Record<string, unknown>;
  };
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
