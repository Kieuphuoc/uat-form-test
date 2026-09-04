import { FormIcon } from '../form/FormIcon';
import { PENDING_TABS, type PendingTabId } from '../../lib/hrmPending';

export function HrmPendingHeader({ count }: { count: number }) {
  return (
    <div className="hrm-pend__head">
      <div>
        <p className="hrm-pend__kicker">Cần xử lý</p>
        <p className="hrm-pend__sub">{count > 0 ? `${count} phiếu` : 'Không có phiếu mới'}</p>
      </div>
    </div>
  );
}

export function HrmPendingToolbar({
  tab,
  onTab,
  counts,
  query,
  onQuery,
  showSearch,
}: {
  tab: PendingTabId;
  onTab: (id: PendingTabId) => void;
  counts: Record<PendingTabId, number>;
  query: string;
  onQuery: (q: string) => void;
  showSearch: boolean;
}) {
  return (
    <div className="hrm-pend-toolbar">
      {showSearch ? (
        <label className="hrm-pend-search">
          <span className="hrm-pend-search__icon" aria-hidden>
            <FormIcon name="search" size={16} />
          </span>
          <input
            type="search"
            value={query}
            placeholder="Tìm người gửi, loại đơn…"
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      ) : null}
      <div className="hrm-pend-tabs" role="tablist" aria-label="Lọc trạng thái">
        {PENDING_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`hrm-pend-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            <em>{counts[t.id]}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

export function HrmPendingEmpty({ compact }: { compact?: boolean }) {
  return (
    <div className={`hrm-pend-empty${compact ? ' hrm-pend-empty--compact' : ''}`} role="status">
      <span className="hrm-pend-empty__icon" aria-hidden>
        <FormIcon name="inbox" size={compact ? 22 : 28} />
      </span>
      <p className="hrm-pend-empty__title">Chưa có phiếu chờ duyệt</p>
      <p className="hrm-pend-empty__text">Đơn gửi đến bạn sẽ hiện tại đây.</p>
    </div>
  );
}
