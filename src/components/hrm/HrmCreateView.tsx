import { useMemo, useState } from 'react';
import type { ClientFormDto, FormControlDef } from '../../types/form';
import type { LangCode } from '../../lib/localizedText';
import { FormIcon } from '../form/FormIcon';
import {
  FORM_CATEGORY_GROUPS,
  POPULAR_TEMPLATES,
  REQUEST_TEMPLATES,
  getTemplateIconTheme,
  type RequestFormTemplate,
} from '../../lib/hrmCreate';
import { HrmFooterButton } from './HrmSharedComponents';
import { HrmRequestEditorView } from './HrmRequestEditorView';

type Props = {
  form?: ClientFormDto;
  lan?: LangCode;
  busy?: boolean;
  onControlClick?: (c: FormControlDef) => void;
  onBack?: () => void;
  onGoToMyRequests?: () => void;
  onGoToBooking?: () => void;
};

export function HrmCreateView({
  onGoToMyRequests,
  onGoToBooking,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<RequestFormTemplate | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REQUEST_TEMPLATES;
    return REQUEST_TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [query]);

  const groupsToRender = useMemo(() => {
    if (selectedCategory === 'all') return FORM_CATEGORY_GROUPS;
    return FORM_CATEGORY_GROUPS.filter((g) => g.key === selectedCategory);
  }, [selectedCategory]);

  const handleOpenForm = (t: RequestFormTemplate) => {
    if (t.id === 'admin-booking' && onGoToBooking) {
      onGoToBooking();
      return;
    }
    setSelectedTemplate(t);
  };

  // KHI MỞ ĐƠN: HIỂN THỊ MÀN HÌNH TẠO ĐƠN ĐẦY ĐỦ THÔNG TIN CHUẨN NHƯ THIẾT KẾ
  if (selectedTemplate) {
    return (
      <div className="hrm-cgrid-page" style={{ padding: 0 }}>
        {toast ? <div className="hrm-pend__toast">{toast}</div> : null}
        <HrmRequestEditorView
          template={selectedTemplate}
          onBack={() => setSelectedTemplate(null)}
          onSaved={(msg) => {
            showToast(msg);
            setSelectedTemplate(null);
            if (onGoToMyRequests) {
              setTimeout(() => onGoToMyRequests(), 1200);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="hrm-cgrid-page">
      {toast ? <div className="hrm-pend__toast">{toast}</div> : null}

      {/* 1. THANH TÌM KIẾM MẪU ĐƠN TRÊN CÙNG (GÕ TÌM TỨC THÌ) */}
      <div className="hrm-cgrid__search-box">
        <span className="hrm-cgrid__search-icon" aria-hidden>
          <FormIcon name="search" size={16} />
        </span>
        <input
          type="search"
          className="hrm-cgrid__search-input"
          value={query}
          placeholder="Tìm trong 39 loại đơn: chấm công, nghỉ phép, hợp đồng, chi tiêu..."
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? (
          <button
            type="button"
            className="hrm-cgrid__search-clear"
            onClick={() => setQuery('')}
            title="Xóa tìm kiếm"
          >
            <FormIcon name="x" size={14} />
          </button>
        ) : null}
      </div>

      {/* 2. DẢI TABS LỌC THEO DANH MỤC */}
      {!query ? (
        <div className="hrm-cgrid__tabs">
          <button
            type="button"
            className={`hrm-cgrid__tab${selectedCategory === 'all' ? ' is-active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            Tất cả ({REQUEST_TEMPLATES.length})
          </button>
          {FORM_CATEGORY_GROUPS.map((g) => {
            const count = REQUEST_TEMPLATES.filter((t) => t.category === g.key).length;
            return (
              <button
                key={g.key}
                type="button"
                className={`hrm-cgrid__tab${selectedCategory === g.key ? ' is-active' : ''}`}
                onClick={() => setSelectedCategory(g.key)}
              >
                {g.title} ({count})
              </button>
            );
          })}
        </div>
      ) : null}

      {/* 3. LỐI TẮT THƯỜNG DÙNG NHẤT (QUICK ACCESS) - NẾU KHÔNG TÌM KIẾM VÀ ĐANG CHỌN TẤT CẢ */}
      {!query && selectedCategory === 'all' ? (
        <div className="hrm-cgrid__quick-section">
          <div className="hrm-cgrid__section-title-row">
            <span className="hrm-cgrid__section-title">⭐ Mẫu đơn thường dùng nhất</span>
          </div>
          <div className="hrm-cgrid__icon-grid">
            {POPULAR_TEMPLATES.map((item) => {
              const theme = getTemplateIconTheme(item.category, item.id);
              return (
                <div
                  key={item.id}
                  className="hrm-cgrid__tile"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenForm(item)}
                >
                  <div
                    className="hrm-cgrid__icon-box"
                    style={{
                      backgroundColor: theme.bg,
                      color: theme.color,
                      borderColor: theme.border,
                    }}
                  >
                    <FormIcon name={item.icon} size={22} />
                    {item.badge ? (
                      <span className="hrm-cgrid__badge-dot" title={item.badge} />
                    ) : null}
                  </div>
                  <span className="hrm-cgrid__tile-name">{item.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 4. LƯỚI ICON THEO TỪNG NHÓM (HOẶC KẾT QUẢ TÌM KIẾM) */}
      <div className="hrm-cgrid__groups">
        {filteredTemplates.length === 0 ? (
          <div className="hrm-pend-v2__empty" role="status">
            <span className="hrm-pend-v2__empty-icon" aria-hidden>
              <FormIcon name="file-question" size={28} />
            </span>
            <p className="hrm-pend-v2__empty-title">Không tìm thấy mẫu đơn</p>
            <p className="hrm-pend-v2__empty-text">
              Không có loại đơn nào khớp với từ khóa "{query}".
            </p>
          </div>
        ) : query ? (
          /* Khi đang tìm kiếm */
          <div className="hrm-cgrid__group-card">
            <div className="hrm-cgrid__section-title-row">
              <span className="hrm-cgrid__section-title">
                Kết quả tìm kiếm ({filteredTemplates.length})
              </span>
            </div>
            <div className="hrm-cgrid__icon-grid">
              {filteredTemplates.map((template) => {
                const theme = getTemplateIconTheme(template.category, template.id);
                return (
                  <div
                    key={template.id}
                    className="hrm-cgrid__tile"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenForm(template)}
                  >
                    <div
                      className="hrm-cgrid__icon-box"
                      style={{
                        backgroundColor: theme.bg,
                        color: theme.color,
                        borderColor: theme.border,
                      }}
                    >
                      <FormIcon name={template.icon} size={22} />
                      {template.badge ? (
                        <span className="hrm-cgrid__badge-dot" title={template.badge} />
                      ) : null}
                    </div>
                    <span className="hrm-cgrid__tile-name">{template.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Khi ở màn hình chính: hiển thị các nhóm dạng Card kèm Lưới icon */
          groupsToRender.map((group) => {
            const groupTemplates = filteredTemplates.filter((t) => t.category === group.key);
            if (groupTemplates.length === 0) return null;

            return (
              <div key={group.key} className="hrm-cgrid__group-card">
                <div className="hrm-cgrid__section-title-row">
                  <span className="hrm-cgrid__section-title">
                    <FormIcon name={group.icon} size={15} />
                    <span>{group.title}</span>
                  </span>
                  <span className="hrm-cgrid__count-badge">{groupTemplates.length} đơn</span>
                </div>

                <div className="hrm-cgrid__icon-grid">
                  {groupTemplates.map((template) => {
                    const theme = getTemplateIconTheme(template.category, template.id);
                    return (
                      <div
                        key={template.id}
                        className="hrm-cgrid__tile"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleOpenForm(template)}
                      >
                        <div
                          className="hrm-cgrid__icon-box"
                          style={{
                            backgroundColor: theme.bg,
                            color: theme.color,
                            borderColor: theme.border,
                          }}
                        >
                          <FormIcon name={template.icon} size={22} />
                          {template.badge ? (
                            <span className="hrm-cgrid__badge-dot" title={template.badge} />
                          ) : null}
                        </div>
                        <span className="hrm-cgrid__tile-name">{template.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. LỐI TẮT SANG TAB "ĐƠN CỦA BẠN" */}
      {onGoToMyRequests ? (
        <div style={{ marginTop: '16px' }}>
          <HrmFooterButton
            icon="clipboard-list"
            label="Xem danh sách Đơn của bạn đã gửi"
            onClick={onGoToMyRequests}
          />
        </div>
      ) : null}
    </div>
  );
}
