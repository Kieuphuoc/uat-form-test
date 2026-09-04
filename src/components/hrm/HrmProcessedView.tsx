import { useMemo, useState } from 'react';
import type { ClientFormDto, FormControlDef } from '../../types/form';
import type { LangCode } from '../../lib/localizedText';
import { FormIcon } from '../form/FormIcon';
import {
  DEFAULT_PROCESSED_ITEMS,
  PROCESSED_TABS,
  countProcessedStats,
  filterProcessedItems,
  type ProcessedItemModel,
  type ProcessedTabId,
} from '../../lib/hrmProcessed';
import {
  HrmStatGrid,
  HrmSearchToolbar,
  HrmApprovalCard,
  HrmFloatingBatchBar,
  HrmWorkflowTimeline,
  HrmDetailHeaderNav,
  HrmFooterButton,
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

function requestIconName(type: string): string {
  const t = type.toLowerCase();
  if (/nghỉ|leave|phép/i.test(t)) return 'calendar';
  if (/ot|làm thêm|overtime|giờ/i.test(t)) return 'clock';
  if (/công tác|mission|trip/i.test(t)) return 'briefcase';
  if (/wfh|nhà|remote/i.test(t)) return 'home';
  if (/chấm công|điểm danh|timekeep/i.test(t)) return 'map-pin';
  return 'file-text';
}

export function HrmProcessedView({
  form: _form,
  values: _values,
  datasets: _datasets,
  lan: _lan,
  busy = false,
  onControlClick: _onControlClick,
  onBack: _onBack,
}: Props) {
  const [tab, setTab] = useState<ProcessedTabId>('all');
  const [query, setQuery] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<ProcessedItemModel | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const items = useMemo(() => {
    return DEFAULT_PROCESSED_ITEMS;
  }, []);

  const stats = useMemo(() => countProcessedStats(items), [items]);
  const filteredItems = useMemo(
    () => filterProcessedItems(items, tab, query),
    [items, tab, query],
  );

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

  const handleBatchExport = () => {
    if (selectedIds.size === 0) return;
    showToast(`Đã xuất báo cáo thành công cho ${selectedIds.size} phiếu đã chọn.`);
    setSelectedIds(new Set());
    setBatchMode(false);
  };

  const statItems: HrmStatItem[] = [
    {
      id: 'ok',
      label: 'Đã duyệt',
      count: stats.ok,
      icon: 'check',
      tone: 'ok',
      selected: tab === 'ok',
      onClick: () => setTab(tab === 'ok' ? 'all' : 'ok'),
    },
    {
      id: 'no',
      label: 'Từ chối',
      count: stats.no,
      icon: 'x',
      tone: 'no',
      selected: tab === 'no',
      onClick: () => setTab(tab === 'no' ? 'all' : 'no'),
    },
    {
      id: 'all',
      label: 'Tổng xử lý',
      count: stats.all,
      icon: 'clipboard-list',
      tone: 'total',
      selected: tab === 'all',
      onClick: () => setTab('all'),
    },
  ];

  const filterTabs: HrmFilterTabItem[] = PROCESSED_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: stats[t.id],
  }));

  return (
    <div className="hrm-pend-v2">
      {/* Toast thông báo */}
      {toast ? <div className="hrm-pend__toast">{toast}</div> : null}

      {/* 1. Bộ 3 thẻ thống kê dùng chung */}
      <HrmStatGrid items={statItems} />

      {/* 2. Toolbar tìm kiếm & Tabs lọc dùng chung */}
      <HrmSearchToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Tìm người gửi, loại đơn, mã phiếu…"
        batchMode={batchMode}
        onToggleBatchMode={() => {
          setBatchMode(!batchMode);
          setSelectedIds(new Set());
        }}
        tabs={filterTabs}
        activeTab={tab}
        onTabChange={(tId) => setTab(tId as ProcessedTabId)}
        totalItemsCount={filteredItems.length}
        selectedCount={selectedIds.size}
        onSelectAllVisible={handleSelectAllVisible}
      />

      {/* 3. Danh sách thẻ phiếu đã xử lý dùng chung HrmApprovalCard */}
      <div className="hrm-pend-v2__list">
        {filteredItems.length === 0 ? (
          <div className="hrm-pend-v2__empty" role="status">
            <span className="hrm-pend-v2__empty-icon" aria-hidden>
              <FormIcon name="file-check" size={28} />
            </span>
            <p className="hrm-pend-v2__empty-title">Chưa có phiếu đã xử lý</p>
            <p className="hrm-pend-v2__empty-text">
              {query
                ? 'Không tìm thấy kết quả phù hợp với từ khóa.'
                : 'Các phiếu sau khi duyệt hoặc từ chối sẽ hiển thị tại đây.'}
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
                iconName={requestIconName(item.type)}
                sender={item.sender}
                department={item.department}
                reason={item.reason}
                date={item.processedDate}
                footerRightText={`Duyệt bởi: ${item.processedBy.split(' ')[0] || item.processedBy} · ${item.id}`}
                badge={
                  <span className={`hrm-proc__badge hrm-proc__badge--${item.status}`}>
                    {item.statusLabel}
                  </span>
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

      {/* 4. Thanh tác vụ hàng loạt nổi dùng chung */}
      <HrmFloatingBatchBar
        selectedCount={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        onSubmit={handleBatchExport}
        submitLabel={`Xuất ${selectedIds.size} phiếu`}
        submitIcon="download"
      />

      {/* 5. Nút tác vụ chân trang */}
      {!batchMode ? (
        <HrmFooterButton
          icon="download"
          label={`Xuất báo cáo tổng hợp (${items.length})`}
          disabled={busy}
          onClick={() => {
            showToast('Đang tạo và tải báo cáo tổng hợp lịch sử xử lý...');
          }}
        />
      ) : null}

      {/* 6. Modal xem chi tiết phiếu */}
      {detailItem ? (
        <div className="hrm-proc-detail" role="dialog" aria-label="Chi tiết phiếu đã xử lý">
          <HrmDetailHeaderNav
            onBack={() => setDetailItem(null)}
            backLabel="Danh sách"
          />

          <div className="hrm-proc-detail__hero">
            <span className="hrm-proc-detail__icon" aria-hidden>
              <FormIcon name={requestIconName(detailItem.type)} size={24} />
            </span>
            <div className="hrm-proc-detail__hero-text">
              <p className="hrm-proc-detail__type">{detailItem.type}</p>
              <p className="hrm-proc-detail__sender">{detailItem.sender} ({detailItem.department})</p>
            </div>
            <span className={`hrm-proc__badge hrm-proc__badge--${detailItem.status}`}>
              {detailItem.statusLabel}
            </span>
          </div>

          <div className="hrm-proc-detail__card">
            <div className="hrm-proc-detail__row">
              <span className="hrm-proc-detail__label">Mã phiếu</span>
              <span className="hrm-proc-detail__value">{detailItem.id}</span>
            </div>
            <div className="hrm-proc-detail__row">
              <span className="hrm-proc-detail__label">Thời gian gửi</span>
              <span className="hrm-proc-detail__value">{detailItem.requestDate}</span>
            </div>
            <div className="hrm-proc-detail__row">
              <span className="hrm-proc-detail__label">Thời gian xử lý</span>
              <span className="hrm-proc-detail__value">{detailItem.processedDate}</span>
            </div>
            <div className="hrm-proc-detail__row">
              <span className="hrm-proc-detail__label">Người phê duyệt</span>
              <span className="hrm-proc-detail__value">{detailItem.processedBy}</span>
            </div>
            {detailItem.reason ? (
              <div className="hrm-proc-detail__row">
                <span className="hrm-proc-detail__label">Lý do gửi</span>
                <span className="hrm-proc-detail__value">{detailItem.reason}</span>
              </div>
            ) : null}
            {detailItem.note ? (
              <div className="hrm-proc-detail__row">
                <span className="hrm-proc-detail__label">Ý kiến phê duyệt</span>
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

          {/* Sơ đồ tiến trình phê duyệt dùng chung */}
          <HrmWorkflowTimeline
            sender={detailItem.sender}
            requestDate={detailItem.requestDate}
            approver={detailItem.processedBy}
            processDate={detailItem.processedDate}
            statusLabel={detailItem.statusLabel}
            isRejected={detailItem.status === 'no'}
          />

          <button
            type="button"
            className="hrm-proc-detail__close-btn"
            onClick={() => setDetailItem(null)}
          >
            Đóng
          </button>
        </div>
      ) : null}
    </div>
  );
}
