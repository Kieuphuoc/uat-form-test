import type { LangCode } from './localizedText';

/** Chuỗi UI runtime cố định (không nằm trong form JSON). e/o → English. */
const UI_COPY = {
  noImage: { v: 'Chưa có ảnh', e: 'No image' },
  noImageParen: { v: ' (Chưa có ảnh)', e: ' (No image)' },
  noFiles: { v: 'Chưa có files', e: 'No files' },
  noFilesParen: { v: ' (Chưa có files)', e: ' (No files)' },
  noFile: { v: 'Chưa có file', e: 'No file' },
  noData: { v: 'Không có dữ liệu', e: 'No data' },
  close: { v: 'Đóng', e: 'Close' },
  closed: { v: 'Đã đóng', e: 'Closed' },
  actionFailed: { v: 'Action lỗi', e: 'Action failed' },
  cannotOpenForm: { v: 'Không mở được form', e: 'Could not open form' },
  mainFormModalOpen: {
    v: 'Form chính đang mở hộp thoại…',
    e: 'Main form has a dialog open…',
  },
  pickFromList: { v: 'Chọn từ danh sách…', e: 'Choose from list…' },
  search: { v: 'Tìm…', e: 'Search…' },
  pickColor: { v: 'Chọn màu', e: 'Pick color' },
  takePhoto: { v: 'Chụp ảnh', e: 'Take photo' },
  chooseImage: { v: 'Chọn ảnh', e: 'Choose image' },
  loading: { v: 'Đang tải…', e: 'Loading…' },
  removeImage: { v: 'Xóa ảnh', e: 'Remove image' },
  remove: { v: 'Xóa', e: 'Remove' },
  pickFileOnSave: {
    v: 'Chọn file (upload khi lưu)',
    e: 'Choose file (upload on save)',
  },
  uploadNowDraft: { v: 'Upload ngay (draft)', e: 'Upload now (draft)' },
  pendingSave: { v: ' · chờ lưu', e: ' · pending save' },
  maxFiles: { v: 'Tối đa {n} file', e: 'Maximum {n} file(s)' },
  uploadFailed: { v: 'Upload lỗi', e: 'Upload failed' },
  initializing: { v: 'Đang khởi tạo…', e: 'Initializing…' },
  loadingForm: { v: 'Đang tải form…', e: 'Loading form…' },
  cannotLoadForm: { v: 'Không tải được form', e: 'Could not load form' },
  cannotLoadApp: { v: 'Không tải được app', e: 'Could not load app' },
  listLoadMore: { v: 'Load more', e: 'Load more' },
  listNextPage: { v: 'Trang sau', e: 'Next page' },
  listPrevPage: { v: 'Trang trước', e: 'Previous page' },
  listPagingLoaded: { v: 'Đã tải {n}', e: 'Loaded {n}' },
  listPagingTotal: { v: 'Đã tải {n}/{total}', e: 'Loaded {n}/{total}' },
  listPagingPage: { v: 'Trang {n}/{total}', e: 'Page {n}/{total}' },
  listPagingPageOnly: { v: 'Trang {n}', e: 'Page {n}' },
  listSelectedCount: { v: 'Chọn {n}', e: 'Selected {n}' },
  listSelectAll: { v: 'Chọn tất cả', e: 'Select all' },
  listSearchPlaceholder: { v: 'Tìm kiếm…', e: 'Search…' },
} as const;

export type UiCopyKey = keyof typeof UI_COPY;

/** e và o dùng bản English; v dùng tiếng Việt. */
export function uiCopy(
  lan: LangCode | undefined,
  key: UiCopyKey,
  vars?: { n?: number; total?: number },
): string {
  const row = UI_COPY[key];
  const useEn = lan === 'e' || lan === 'o';
  let text: string = useEn ? row.e : row.v;
  if (vars?.n != null) text = text.replace('{n}', String(vars.n));
  if (vars?.total != null) text = text.replace('{total}', String(vars.total));
  return text;
}
