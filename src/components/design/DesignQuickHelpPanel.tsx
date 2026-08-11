import { createPortal } from 'react-dom';
import type { DesignHelpKind } from '../../api/designHelpApi';
import type { DesignSelection, FormDocument } from '../../types/formDoc';

type Guide = {
  title: string;
  lines: string[];
  asks: { label: string; kind: DesignHelpKind; prompt: string }[];
};

type Props = {
  open: boolean;
  editorMode: 'design' | 'actions' | 'json';
  selection: DesignSelection | null;
  doc: FormDocument | null;
  onClose: () => void;
  onAskChat: (kind: DesignHelpKind, prompt: string) => void;
};

const CONTROL_GUIDES: Record<string, Guide> = {
  select: {
    title: 'Control · select',
    lines: [
      '**optionsMode**: static | sqlCache | sqlSearch | listPicker.',
      '**static**: list id/text (+/−) trên Property.',
      '**sqlCache**: `optionsFrom` = dataset (load onLoad) — như list cố định.',
      '**sqlSearch**: `optionsAction` + param `state.selectQuery.{id}`.',
      '**listPicker**: `optionsPickerFormId` — mở form list, returnMap → control.',
      '`optionsValueField` / `optionsLabelField` map cột → value/label.',
      'Event: **onChange** (không onClick).',
      'Dbl-click onChange → Actions (tự tạo action nếu thiếu).',
    ],
    asks: [
      {
        label: 'Chọn mode select?',
        kind: 'design',
        prompt: 'Khi nào dùng static / sqlCache / sqlSearch / listPicker cho select?',
      },
    ],
  },
  button: {
    title: 'Control · button',
    lines: [
      '`text`, `icon`, `color`, `textColor`.',
      '**onClick**: gắn action id (hoặc gõ id mới rồi Gắn).',
      'Hoặc `linkFormId` mở form (không cần SQL).',
      'Dbl-click onClick → Actions; vd `open_picker` → default showForm.',
      '`visibleModes`: vd `new,edit` để ẩn khi view.',
      '`enabled: false` khóa nút.',
      '`placement: footer` + `rowId`/`width` % → pin cuối form (sau list).',
      'Chuỗi onClick chạy tuần tự trái → phải.',
    ],
    asks: [
      {
        label: 'onClick mở picker?',
        kind: 'actions',
        prompt: 'Mẫu button onClick showForm picker và returnMap về control parent.',
      },
    ],
  },
  iconButton: {
    title: 'Control · iconButton',
    lines: [
      'Ô icon + nhãn — hay dùng với `layout: drawer` (Appdrawer).',
      '`icon`, `color`, `text` / `label`.',
      '**onClick** hoặc `linkFormId` giống button.',
      'Dbl-click onClick → Actions (tự tạo nếu thiếu).',
      'Badge type ẩn trên canvas cho gọn.',
    ],
    asks: [
      {
        label: 'Appdrawer iconButton?',
        kind: 'design',
        prompt: 'Cách bố layout drawer với nhiều iconButton và linkFormId.',
      },
    ],
  },
  text: {
    title: 'Control · text',
    lines: [
      '`label`, `placeholder`, `defaultValue` (khi formMode=new). Text đa ngôn ngữ: string = v, hoặc `{v,e,o}` — Property có icon Aa để nhập e/o.',
      '`openAs`: link | mail | phone — **view** hiện link; new/edit nhập text.',
      '**onChange** → thường sqlQuery lọc list (`from: control.{id}`).',
      '`required`, `enabled`, `visible` / `visibleModes`.',
      '`rowId` + `width` để xếp cùng hàng.',
      '`groupId` (+ `groupLabel`, `groupIcon`, `groupBackground`, `groupCollapsed`) → accordion ẩn/hiện cụm control kề nhau.',
    ],
    asks: [
      {
        label: 'onChange lọc list?',
        kind: 'actions',
        prompt: 'Mẫu text onChange sqlQuery LIKE @q từ control và bind list.',
      },
    ],
  },
  textarea: {
    title: 'Control · textarea',
    lines: [
      'Giống text; thêm `height` (vd `120px`).',
      '`placeholder`, `defaultValue`, **onChange**.',
      'Thường dùng ghi chú / lý do — ít lọc list.',
    ],
    asks: [],
  },
  number: {
    title: 'Control · number',
    lines: [
      'Nhập số; runtime ép Number khi onChange.',
      '`placeholder`, `defaultValue`, **onChange**.',
      '`required` / `enabled` / `visibleModes`.',
      'Param SQL: `from: control.{id}`.',
    ],
    asks: [],
  },
  date: {
    title: 'Control · date',
    lines: [
      'Ô ngày theo `format` (mặc định `dd/MM/yyyy`).',
      'Smart: `20/6` → `20/06/năm hiện tại`; lưu `yyyy-MM-dd`.',
      'Gõ digit tự chèn `/` hoặc `-` theo format.',
      'Sai lịch → null.',
    ],
    asks: [],
  },
  time: {
    title: 'Control · time',
    lines: [
      'Giờ lưu **text** (`HH:mm` / `HH:mm:ss`), mặc định `00:00`.',
      'Alias: `hh:MM`. Smart: `9:5` → `09:05`.',
    ],
    asks: [],
  },
  color: {
    title: 'Control · color',
    lines: [
      'Nhập #hex hoặc chọn từ lưới ~36 màu phổ biến.',
      'Value: chuỗi `#rrggbb`.',
    ],
    asks: [],
  },
  file: {
    title: 'Control · file',
    lines: [
      'List file: icon cloud upload + `n. name (size)` + ×.',
      '`uploadMode`: immediate (draft status=0) | onSave (gọi `uploadPendingFormAttachments`).',
      'Chỉ upload khi formMode new/edit; view chỉ xem.',
      '`accept`, `maxFiles`; value = mảng `{id,name,sizeKb,status}`.',
    ],
    asks: [],
  },
  image: {
    title: 'Control · image',
    lines: [
      'Preview vuông (`previewWidth` px, mặc định 50); chọn ảnh / chụp.',
      '`uploadMode` giống file. View: chỉ xem, không upload.',
    ],
    asks: [],
  },
  label: {
    title: 'Control · label',
    lines: [
      'Chỉ hiển thị: dùng `text` (hoặc `label`).',
      'Có `values[id]` (setValue) thì hiện value trước `text`.',
      '`openAs`: link | mail | phone — bấm mở web / mailbox / gọi điện.',
      '`placement: footer` để đưa xuống thanh pin cuối form.',
    ],
    asks: [],
  },
  hidden: {
    title: 'Control · hidden',
    lines: [
      'Không hiện UI; vẫn giữ value trong `controlValues`.',
      'Dùng id / khóa ẩn; SQL `from: control.{id}`.',
      'setValue / onLoad có thể gán giá trị.',
    ],
    asks: [],
  },
};

const LIST_GUIDE: Guide = {
  title: 'List',
  lines: [
    '`bind` = dataset id (map `datasets` → action sqlQuery).',
    '`columns[]`: field + title + width/bold/italic/color/type.',
    '`template`: table | **card** | **media** + `itemTemplate` (line1/line2/image/icon).',
    '`search`: columns `field:op` (like / likePrefix / eq / in) + onSearch SQL `@q`.',
    '`selection: multiple` → checkbox trái; `selectedKeysBind` trong state.',
    '`paging`: loadMore (append) | pages (replace) + pageSize / totalDataset.',
    '`rowKey` khóa dòng; **onRowClick** / **onLoadMore**.',
    'Property **mockRows** — xem trên canvas; PreferMock khi preview.',
    'Demo: products → **Chọn vật tư (dmvt)** (`template: media`).',
  ],
  asks: [
    {
      label: 'List picker row?',
      kind: 'actions',
      prompt: 'Mẫu onRowClick setValue + closeForm returnMap cho list picker.',
    },
  ],
};

const FORM_GUIDE: Guide = {
  title: 'Form (đang chọn root)',
  lines: [
    '`title`, `layout` (stack | drawer), `defaultFormMode`.',
    '**onLoad**: sqlQuery nạp dataset / list.',
    'Dbl-click onLoad → Actions (tự tạo nếu thiếu).',
    'Chọn một control trên canvas để xem hướng dẫn riêng control đó.',
    'Tổng quát Design / SQL → hỏi 💬 chatbot.',
  ],
  asks: [
    {
      label: 'onLoad nạp list?',
      kind: 'actions',
      prompt: 'Mẫu form onLoad sqlQuery targetDataset và list.bind.',
    },
  ],
};

const ACTIONS_GUIDE: Guide = {
  title: 'Tab Actions',
  lines: [
    'Chọn action bên trái; sửa type / SQL / params.',
    'Event Property chỉ gắn **id** — body nằm ở đây.',
    'sqlQuery → `targetDataset`; PreferMock + mockRows.',
    'showForm / closeForm / setValue / validate / message.',
    'Params: `control.*` | `state.*` | `row.*` | `session.userId|clientId|lan`.',
  ],
  asks: [
    {
      label: 'Mẫu params SQL?',
      kind: 'actions',
      prompt: 'Liệt kê from: control/state/row/session cho params action.',
    },
  ],
};

const JSON_GUIDE: Guide = {
  title: 'Tab JSON',
  lines: [
    'Nguồn sự thật của form; Design/Actions ghi vào đây.',
    'Parse lỗi → sửa trước khi sang Design/Actions.',
    'Undo/Redo theo lịch sử JSON.',
    'Runtime không nhận `command` (đã strip).',
  ],
  asks: [
    {
      label: 'Cấu trúc JSON?',
      kind: 'design',
      prompt: 'Tóm tắt FormDocument: controls, lists, actions, datasets.',
    },
  ],
};

const COLUMN_GUIDE: Guide = {
  title: 'List column',
  lines: [
    '`field` = key trong row dataset.',
    '`title` = tiêu đề cột trên bảng.',
    'Copy / Insert / kéo cột trên canvas.',
    'Chọn lại **List** để sửa bind / onRowClick / mockRows.',
  ],
  asks: [],
};

function resolveGuide(
  editorMode: Props['editorMode'],
  selection: DesignSelection | null,
  doc: FormDocument | null,
): Guide {
  if (editorMode === 'actions') return ACTIONS_GUIDE;
  if (editorMode === 'json') return JSON_GUIDE;

  const sel = selection ?? { kind: 'form' as const };
  if (sel.kind === 'list') return LIST_GUIDE;
  if (sel.kind === 'column') return COLUMN_GUIDE;
  if (sel.kind === 'control' && doc) {
    const c = doc.controls.find((x) => x.id === sel.id);
    const type = c?.type ?? 'text';
    const base = CONTROL_GUIDES[type] ?? {
      title: `Control · ${type}`,
      lines: [
        `Type \`${type}\`: xem Property bên phải.`,
        '`id`, `order`, `label` / `text`, enabled / visible.',
        'Event onChange hoặc onClick tùy loại.',
        'Tổng quát → hỏi 💬 chatbot.',
      ],
      asks: [
        {
          label: `Hỏi về ${type}`,
          kind: 'design' as const,
          prompt: `Hướng dẫn chi tiết control type=${type} trong Form Designer.`,
        },
      ],
    };
    return {
      ...base,
      title: c ? `${base.title} · ${c.id}` : base.title,
    };
  }
  return FORM_GUIDE;
}

/** Hướng dẫn ngắn theo selection / tab — không tổng quát toàn Designer. */
export function DesignQuickHelpPanel({
  open,
  editorMode,
  selection,
  doc,
  onClose,
  onAskChat,
}: Props) {
  if (!open) return null;
  const g = resolveGuide(editorMode, selection, doc);

  return createPortal(
    <div className="design-quick-help" role="dialog" aria-label={g.title}>
      <div className="design-quick-help__head">
        <strong>{g.title}</strong>
        <button type="button" className="secondary" onClick={onClose} aria-label="Đóng">
          ✕
        </button>
      </div>
      <ol className="design-quick-help__list">
        {g.lines.map((line) => (
          <li key={line}>{renderInlineMd(line)}</li>
        ))}
      </ol>
      <div className="design-quick-help__asks">
        <span className="muted">Chi tiết → 💬</span>
        {g.asks.map((a) => (
          <button
            key={a.label}
            type="button"
            className="secondary design-quick-help__ask"
            onClick={() => onAskChat(a.kind, a.prompt)}
          >
            {a.label}
          </button>
        ))}
        {g.asks.length === 0 && (
          <button
            type="button"
            className="secondary design-quick-help__ask"
            onClick={() =>
              onAskChat(
                editorMode === 'actions' ? 'actions' : 'design',
                `Giải thích thêm về: ${g.title}`,
              )
            }
          >
            Hỏi chatbot
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function renderInlineMd(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={i}>{p.slice(1, -1)}</code>;
    }
    return <span key={i}>{p}</span>;
  });
}
