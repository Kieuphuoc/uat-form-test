import { useMemo, useState } from 'react';
import type { ClientFormDto, FormControlDef } from '../../types/form';
import type { LangCode } from '../../lib/localizedText';
import { FormIcon } from '../form/FormIcon';
import {
  DEFAULT_PENDING_ITEMS,
  PENDING_CATEGORY_TABS,
  countPendingStats,
  filterPendingItems,
  type PendingCategoryTab,
  type PendingItemModel,
} from '../../lib/hrmPending';
import {
  HrmStatGrid,
  HrmSearchToolbar,
  HrmApprovalCard,
  HrmFloatingBatchBar,
  HrmDetailHeaderNav,
  HrmCardActionButtons,
  HrmFooterButton,
  HrmActionModal,
  type HrmStatItem,
  type HrmFilterTabItem,
} from './HrmSharedComponents';

type Props = {
  form: ClientFormDto;
  values?: Record<string, unknown>;
  datasets?: Record<string, Record<string, unknown>[]>;
  lan: LangCode;
  busy?: boolean;
  onControlClick?: (c: FormControlDef) => void;
  onBack?: () => void;
};

function requestIconName(category: string): string {
  switch (category) {
    case 'leave':
      return 'calendar';
    case 'ot':
      return 'clock';
    case 'trip':
      return 'briefcase';
    case 'attendance':
      return 'map-pin';
    default:
      return 'file-text';
  }
}

export function HrmPendingView({
  form: _form,
  values: _values,
  datasets: _datasets,
  lan: _lan,
  busy = false,
  onControlClick: _onControlClick,
  onBack: _onBack,
}: Props) {
  const [tab, setTab] = useState<PendingCategoryTab>('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PendingItemModel[]>(DEFAULT_PENDING_ITEMS);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<PendingItemModel | null>(null);
  const [actionModal, setActionModal] = useState<{
    item: PendingItemModel;
    action: 'approve' | 'reject';
  } | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const stats = useMemo(() => countPendingStats(items), [items]);
  const filteredItems = useMemo(() => filterPendingItems(items, tab, query), [items, tab, query]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleConfirmAction = () => {
    if (!actionModal) return;
    const { item, action } = actionModal;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    if (action === 'approve') {
      showToast(`Đã duyệt đơn "${item.type}" của ${item.sender}`);
    } else {
      showToast(`Đã từ chối đơn "${item.type}" của ${item.sender}`);
    }
    setActionModal(null);
    setActionComment('');
    if (detailItem?.id === item.id) setDetailItem(null);
  };

  const handleBatchApprove = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
    setSelectedIds(new Set());
    setBatchMode(false);
    showToast(`Đã duyệt thành công ${count} phiếu đã chọn.`);
  };

  const statItems: HrmStatItem[] = [
    {
      id: 'urgent',
      label: 'Khẩn cấp',
      count: stats.urgent,
      icon: 'alert-triangle',
      tone: 'urgent',
      selected: tab === 'urgent',
      onClick: () => setTab(tab === 'urgent' ? 'all' : 'urgent'),
    },
    {
      id: 'today',
      label: 'Hôm nay',
      count: stats.today,
      icon: 'clock',
      tone: 'today',
      onClick: () => setTab('all'),
    },
    {
      id: 'total',
      label: 'Cần duyệt',
      count: stats.total,
      icon: 'inbox',
      tone: 'total',
      selected: tab === 'all',
      onClick: () => setTab('all'),
    },
  ];

  const filterTabs: HrmFilterTabItem[] = PENDING_CATEGORY_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: stats.categories[t.id],
  }));

  return (
    <div className="hrm-pend-v2">
      {/* Toast thông báo nhanh */}
      {toast ? <div className="hrm-pend__toast">{toast}</div> : null}

      {/* 1. Bộ 3 thẻ thống kê dùng chung */}
      <HrmStatGrid items={statItems} />

      {/* 2. Toolbar tìm kiếm & Tabs lọc dùng chung */}
      <HrmSearchToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Tìm người gửi, loại đơn, phòng ban…"
        batchMode={batchMode}
        onToggleBatchMode={() => {
          setBatchMode(!batchMode);
          setSelectedIds(new Set());
        }}
        tabs={filterTabs}
        activeTab={tab}
        onTabChange={(tId) => setTab(tId as PendingCategoryTab)}
        totalItemsCount={filteredItems.length}
        selectedCount={selectedIds.size}
        onSelectAllVisible={handleSelectAllVisible}
      />

      {/* 6. Danh sách thẻ đơn Chờ duyệt */}
      <div className="hrm-pend-v2__list">
        {filteredItems.length === 0 ? (
          <div className="hrm-pend-v2__empty" role="status">
            <span className="hrm-pend-v2__empty-icon" aria-hidden>
              <FormIcon name="user-round-check" size={28} />
            </span>
            <p className="hrm-pend-v2__empty-title">Không có phiếu cần duyệt</p>
            <p className="hrm-pend-v2__empty-text">
              {query
                ? 'Không tìm thấy kết quả phù hợp với từ khóa.'
                : 'Tất cả các đơn gửi đến bạn đều đã được xử lý xong!'}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <HrmApprovalCard
                key={item.id}
                id={item.id}
                title={item.type}
                iconName={requestIconName(item.category)}
                sender={item.sender}
                department={item.department}
                reason={item.reason}
                date={item.requestDate}
                footerRightText={item.id}
                badge={
                  <div className="hrm-pend-v2__tags">
                    {item.priority === 'urgent' ? (
                      <span className="hrm-pend-v2__tag hrm-pend-v2__tag--urgent">
                        Khẩn cấp
                      </span>
                    ) : null}
                    {item.dueLabel ? (
                      <span
                        className={`hrm-pend-v2__tag${item.isOverdue ? ' hrm-pend-v2__tag--overdue' : ' hrm-pend-v2__tag--due'}`}
                      >
                        {item.dueLabel}
                      </span>
                    ) : null}
                  </div>
                }
                actions={
                  !batchMode ? (
                    <HrmCardActionButtons
                      onReject={(e) => {
                        e.stopPropagation();
                        setActionModal({ item, action: 'reject' });
                      }}
                      onApprove={(e) => {
                        e.stopPropagation();
                        setActionModal({ item, action: 'approve' });
                      }}
                    />
                  ) : null
                }
                isSelected={isSelected}
                batchMode={batchMode}
                onToggleSelect={() => handleToggleSelect(item.id)}
                onClick={() => {
                  if (batchMode) handleToggleSelect(item.id);
                  else setDetailItem(item);
                }}
              />
            );
          })
        )}
      </div>

      {/* 7. Thanh Tác vụ Phê duyệt hàng loạt nổi dùng chung */}
      <HrmFloatingBatchBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onSubmit={handleBatchApprove}
        submitLabel={`Duyệt ${selectedIds.size} phiếu`}
        submitIcon="check-check"
      />

      {/* 8. Nút tác vụ chân trang */}
      {!batchMode ? (
        <HrmFooterButton
          icon="check-check"
          label={`Duyệt tất cả (${items.length})`}
          disabled={busy || items.length === 0}
          onClick={() => {
            if (confirm(`Bạn có chắc muốn duyệt tất cả ${items.length} phiếu đang chờ?`)) {
              setItems([]);
              showToast(`Đã duyệt toàn bộ ${items.length} phiếu.`);
            }
          }}
        />
      ) : null}

      {/* 9. Modal xác nhận Duyệt / Từ chối có ghi chú */}
      {actionModal ? (
        <HrmActionModal
          isOpen={true}
          title={actionModal.action === 'approve' ? 'Phê duyệt phiếu' : 'Từ chối phiếu'}
          itemName={actionModal.item.type}
          senderInfo={`Người gửi: ${actionModal.item.sender} (${actionModal.item.department})`}
          actionType={actionModal.action}
          comment={actionComment}
          onCommentChange={setActionComment}
          onClose={() => setActionModal(null)}
          onConfirm={handleConfirmAction}
        />
      ) : null}

      {/* 10. Modal xem chi tiết phiếu & Tiến trình duyệt */}
      {detailItem ? (
        <div className="hrm-proc-detail" role="dialog" aria-label="Chi tiết phiếu chờ duyệt">
          <HrmDetailHeaderNav
            onBack={() => setDetailItem(null)}
            backLabel="Danh sách"
          />

          <div className="hrm-proc-detail__hero">
            <span className="hrm-proc-detail__icon" aria-hidden>
              <FormIcon name={requestIconName(detailItem.category)} size={24} />
            </span>
            <div className="hrm-proc-detail__hero-text">
              <p className="hrm-proc-detail__type">{detailItem.type}</p>
              <p className="hrm-proc-detail__sender">
                {detailItem.sender} ({detailItem.department})
              </p>
            </div>
            <span className="hrm-pend-v2__tag hrm-pend-v2__tag--urgent">Chờ bạn duyệt</span>
          </div>

          <div className="hrm-proc-detail__card">
            <div className="hrm-proc-detail__row">
              <span className="hrm-proc-detail__label">Mã phiếu</span>
              <span className="hrm-proc-detail__value">{detailItem.id}</span>
            </div>
            <div className="hrm-proc-detail__row">
              <span className="hrm-proc-detail__label">Thời gian tạo</span>
              <span className="hrm-proc-detail__value">{detailItem.requestDate}</span>
            </div>
            <div className="hrm-proc-detail__row">
              <span className="hrm-proc-detail__label">Lý do gửi</span>
              <span className="hrm-proc-detail__value">{detailItem.reason}</span>
            </div>
            {detailItem.note ? (
              <div className="hrm-proc-detail__row">
                <span className="hrm-proc-detail__label">Ghi chú</span>
                <span className="hrm-proc-detail__value">{detailItem.note}</span>
              </div>
            ) : null}
            {detailItem.extras?.map((ex, idx) => (
              <div key={idx} className="hrm-proc-detail__row">
                <span className="hrm-proc-detail__label">{ex.label}</span>
                <span className="hrm-proc-detail__value">{ex.value}</span>
              </div>
            ))}
          </div>

          {/* Sơ đồ tiến trình các cấp duyệt */}
          {detailItem.steps ? (
            <div className="hrm-pend-v2__timeline-card">
              <span className="hrm-pend-v2__timeline-title">Tiến trình phê duyệt</span>
              <div className="hrm-pend-v2__timeline-list">
                {detailItem.steps.map((st, idx) => (
                  <div
                    key={idx}
                    className={`hrm-pend-v2__timeline-step is-${st.status}`}
                  >
                    <span className="hrm-pend-v2__timeline-dot" />
                    <div className="hrm-pend-v2__timeline-info">
                      <strong>{st.name}</strong>
                      <span>{st.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="hrm-pend-v2__detail-actions">
            <button
              type="button"
              className="hrm-pend-v2__btn-reject"
              onClick={() => setActionModal({ item: detailItem, action: 'reject' })}
            >
              <FormIcon name="x" size={16} />
              <span>Từ chối</span>
            </button>
            <button
              type="button"
              className="hrm-pend-v2__btn-approve"
              onClick={() => setActionModal({ item: detailItem, action: 'approve' })}
            >
              <FormIcon name="check" size={16} />
              <span>Duyệt</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
