import { useMemo, useState } from 'react';
import type { ClientFormDto, FormControlDef } from '../../types/form';
import type { LangCode } from '../../lib/localizedText';
import { FormIcon } from '../form/FormIcon';
import {
  DEFAULT_MY_REQUESTS,
  MY_REQUEST_CATEGORY_TABS,
  MY_REQUEST_STATUS_TABS,
  countMyRequestsStats,
  filterMyRequests,
  type MyRequestCategory,
  type MyRequestItemModel,
  type MyRequestStatus,
} from '../../lib/hrmMyRequests';
import {
  HrmStatGrid,
  HrmSearchToolbar,
  HrmApprovalCard,
  HrmWorkflowTimeline,
  HrmDetailHeaderNav,
  HrmFooterButton,
  type HrmStatItem,
  type HrmFilterTabItem,
} from './HrmSharedComponents';

type Props = {
  form?: ClientFormDto;
  lan?: LangCode;
  busy?: boolean;
  onControlClick?: (c: FormControlDef) => void;
  onBack?: () => void;
  onGoToCreate?: () => void;
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
    case 'equipment':
      return 'laptop';
    default:
      return 'file-text';
  }
}

export function HrmMyRequestsView({
  onBack: _onBack,
  onGoToCreate,
}: Props) {
  const [items, setItems] = useState<MyRequestItemModel[]>(DEFAULT_MY_REQUESTS);
  const [statusTab, setStatusTab] = useState<MyRequestStatus>('all');
  const [categoryTab, setCategoryTab] = useState<MyRequestCategory>('all');
  const [query, setQuery] = useState('');
  const [detailItem, setDetailItem] = useState<MyRequestItemModel | null>(null);
  const [recallModal, setRecallModal] = useState<MyRequestItemModel | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const stats = useMemo(() => countMyRequestsStats(items), [items]);
  const filteredItems = useMemo(
    () => filterMyRequests(items, statusTab, categoryTab, query),
    [items, statusTab, categoryTab, query],
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleConfirmRecall = () => {
    if (!recallModal) return;
    setItems((prev) => prev.filter((i) => i.id !== recallModal.id));
    showToast(`Đã thu hồi đơn "${recallModal.title}" thành công.`);
    if (detailItem?.id === recallModal.id) setDetailItem(null);
    setRecallModal(null);
  };

  const handleResubmit = (item: MyRequestItemModel) => {
    showToast(`Đang chuyển thông tin đơn "${item.title}" sang màn hình tạo mới...`);
    setTimeout(() => {
      onGoToCreate?.();
    }, 600);
  };

  const statItems: HrmStatItem[] = [
    {
      id: 'pending',
      label: 'Chờ duyệt',
      count: stats.pending,
      icon: 'clock',
      tone: 'today',
      selected: statusTab === 'pending',
      onClick: () => setStatusTab(statusTab === 'pending' ? 'all' : 'pending'),
    },
    {
      id: 'approved',
      label: 'Đã duyệt',
      count: stats.approved,
      icon: 'check-check',
      tone: 'ok',
      selected: statusTab === 'approved',
      onClick: () => setStatusTab(statusTab === 'approved' ? 'all' : 'approved'),
    },
    {
      id: 'rejected',
      label: 'Từ chối',
      count: stats.rejected,
      icon: 'alert-triangle',
      tone: 'no',
      selected: statusTab === 'rejected',
      onClick: () => setStatusTab(statusTab === 'rejected' ? 'all' : 'rejected'),
    },
  ];

  const filterCategoryTabs: HrmFilterTabItem[] = MY_REQUEST_CATEGORY_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    count: stats.categories[t.id] ?? 0,
  }));

  // Giao diện chi tiết đơn
  if (detailItem) {
    const isPending = detailItem.status === 'pending';
    const isRejected = detailItem.status === 'rejected';
    const isApproved = detailItem.status === 'approved';

    return (
      <div className="hrm-pend-v2 hrm-my-req-v2">
        {toast ? <div className="hrm-pend__toast">{toast}</div> : null}

        <HrmDetailHeaderNav
          onBack={() => setDetailItem(null)}
          backLabel="Danh sách đơn"
          crumbTitle="Chi tiết đơn đã gửi"
        />

        {/* Card tóm tắt tiêu đề & trạng thái */}
        <div className="hrm-pend-v2__card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <span className="hrm-pend-v2__card-icon" aria-hidden>
              <FormIcon name={requestIconName(detailItem.category)} size={22} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{detailItem.title}</h2>
                <span
                  className={`hrm-pend-v2__tag ${
                    isApproved
                      ? 'hrm-pend-v2__tag--due'
                      : isRejected
                      ? 'hrm-pend-v2__tag--urgent'
                      : 'hrm-pend-v2__tag--due'
                  }`}
                  style={
                    isApproved
                      ? { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }
                      : undefined
                  }
                >
                  {detailItem.statusLabel}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                Mã đơn: <strong>{detailItem.id}</strong> · Nộp lúc: {detailItem.createdAt}
              </div>
            </div>
          </div>

          {/* Lý do từ chối (nếu có) */}
          {isRejected && detailItem.rejectedReason ? (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
                <FormIcon name="alert-triangle" size={15} />
                Lý do không duyệt từ quản lý:
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#991b1b', lineHeight: 1.5 }}>
                {detailItem.rejectedReason}
              </p>
            </div>
          ) : null}

          {/* Thông tin chi tiết các trường */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--muted)' }}>Thời gian áp dụng:</span>
              <strong style={{ textAlign: 'right' }}>{detailItem.appliedTime}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--muted)' }}>Người duyệt:</span>
              <strong style={{ textAlign: 'right', color: 'var(--secondary)' }}>{detailItem.approver}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--muted)' }}>Lý do gửi:</span>
              <span style={{ textAlign: 'right', maxWidth: '60%' }}>{detailItem.reason}</span>
            </div>

            {detailItem.details?.map((d, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--muted)' }}>{d.label}:</span>
                <span style={{ textAlign: 'right', maxWidth: '65%', fontWeight: 500 }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tiến trình duyệt */}
        <HrmWorkflowTimeline
          sender="Tôi (Người tạo đơn)"
          requestDate={detailItem.createdAt}
          approver={isPending ? undefined : detailItem.approver}
          processDate={detailItem.approvedAt || (isRejected ? 'Đã phản hồi' : undefined)}
          statusLabel={detailItem.statusLabel}
          isRejected={isRejected}
        />

        {/* Cụm nút hành động chân trang */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          {isPending ? (
            <HrmFooterButton
              icon="x"
              label="Thu hồi đơn này"
              onClick={() => setRecallModal(detailItem)}
            />
          ) : isRejected ? (
            <HrmFooterButton
              icon="rotate-ccw"
              label="Tạo lại đơn dựa trên mẫu này"
              onClick={() => handleResubmit(detailItem)}
            />
          ) : (
            <HrmFooterButton
              icon="arrow-left"
              label="Quay lại danh sách"
              onClick={() => setDetailItem(null)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="hrm-pend-v2 hrm-my-req-v2">
      {toast ? <div className="hrm-pend__toast">{toast}</div> : null}

      {/* 1. Bộ 3 thẻ thống kê (Chờ duyệt, Đã duyệt, Từ chối) */}
      <HrmStatGrid items={statItems} />

      {/* Dải phím tắt lọc trạng thái nhanh */}
      <div className="hrm-my-req__status-bar">
        {MY_REQUEST_STATUS_TABS.map((st) => (
          <button
            key={st.id}
            type="button"
            className={`hrm-my-req__status-pill${statusTab === st.id ? ' is-active' : ''}`}
            onClick={() => setStatusTab(st.id)}
          >
            {st.label}
          </button>
        ))}
      </div>

      {/* 2. Thanh tìm kiếm & Tabs lọc danh mục */}
      <HrmSearchToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Tìm mã đơn, loại đơn, lý do, người duyệt…"
        tabs={filterCategoryTabs}
        activeTab={categoryTab}
        onTabChange={(tId) => setCategoryTab(tId as MyRequestCategory)}
        totalItemsCount={filteredItems.length}
      />

      {/* 3. Danh sách thẻ đơn của bạn */}
      <div className="hrm-pend-v2__list">
        {filteredItems.length === 0 ? (
          <div className="hrm-pend-v2__empty" role="status">
            <span className="hrm-pend-v2__empty-icon" aria-hidden>
              <FormIcon name="clipboard-list" size={28} />
            </span>
            <p className="hrm-pend-v2__empty-title">Không tìm thấy đơn phù hợp</p>
            <p className="hrm-pend-v2__empty-text">
              {query
                ? 'Không có kết quả khớp với từ khóa tìm kiếm.'
                : 'Bạn chưa gửi đơn từ nào trong danh mục này.'}
            </p>
            {onGoToCreate ? (
              <button
                type="button"
                className="hrm-pend-v2__batch-toggle"
                style={{ marginTop: '8px', background: 'var(--secondary)', color: '#fff' }}
                onClick={onGoToCreate}
              >
                <FormIcon name="plus" size={14} />
                <span>Tạo đơn đầu tiên</span>
              </button>
            ) : null}
          </div>
        ) : (
          filteredItems.map((item) => {
            const isApproved = item.status === 'approved';
            const isRejected = item.status === 'rejected';

            return (
              <HrmApprovalCard
                key={item.id}
                id={item.id}
                title={item.title}
                iconName={requestIconName(item.category)}
                sender={item.appliedTime}
                department={item.approver ? `Duyệt bởi: ${item.approver}` : undefined}
                reason={item.reason}
                date={item.createdAt}
                footerRightText={item.id}
                badge={
                  <span
                    className={`hrm-pend-v2__tag ${
                      isApproved
                        ? 'hrm-pend-v2__tag--due'
                        : isRejected
                        ? 'hrm-pend-v2__tag--urgent'
                        : 'hrm-pend-v2__tag--due'
                    }`}
                    style={
                      isApproved
                        ? { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }
                        : item.status === 'draft'
                        ? { background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }
                        : undefined
                    }
                  >
                    {item.statusLabel}
                  </span>
                }
                actions={
                  item.status === 'pending' ? (
                    <div className="hrm-pend-v2__action-row">
                      <button
                        type="button"
                        className="hrm-pend-v2__btn-reject"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecallModal(item);
                        }}
                      >
                        <FormIcon name="x" size={14} />
                        <span>Thu hồi đơn</span>
                      </button>
                      <button
                        type="button"
                        className="hrm-pend-v2__btn-approve"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailItem(item);
                        }}
                      >
                        <FormIcon name="eye" size={14} />
                        <span>Xem chi tiết</span>
                      </button>
                    </div>
                  ) : item.status === 'rejected' ? (
                    <div className="hrm-pend-v2__action-row">
                      <button
                        type="button"
                        className="hrm-pend-v2__btn-reject"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailItem(item);
                        }}
                      >
                        <FormIcon name="alert-triangle" size={14} />
                        <span>Xem lý do</span>
                      </button>
                      <button
                        type="button"
                        className="hrm-pend-v2__btn-approve"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResubmit(item);
                        }}
                      >
                        <FormIcon name="rotate-ccw" size={14} />
                        <span>Gửi lại</span>
                      </button>
                    </div>
                  ) : undefined
                }
                onClick={() => setDetailItem(item)}
              />
            );
          })
        )}
      </div>

      {/* 4. Nút bấm tạo đơn mới nổi bật ở chân trang */}
      {onGoToCreate ? (
        <div style={{ marginTop: '8px' }}>
          <HrmFooterButton
            icon="plus"
            label="Tạo đơn từ mới"
            onClick={onGoToCreate}
          />
        </div>
      ) : null}

      {/* Modal xác nhận thu hồi đơn */}
      {recallModal ? (
        <div className="hrm-pend-v2__modal-backdrop" role="dialog" aria-modal="true">
          <div className="hrm-pend-v2__modal">
            <div className="hrm-pend-v2__modal-head">
              <h3 className="hrm-pend-v2__modal-title">Xác nhận thu hồi đơn</h3>
              <button
                type="button"
                className="hrm-pend-v2__modal-close"
                onClick={() => setRecallModal(null)}
              >
                <FormIcon name="x" size={16} />
              </button>
            </div>
            <div className="hrm-pend-v2__modal-body">
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text)' }}>
                Bạn có chắc chắn muốn thu hồi đơn <strong>{recallModal.title}</strong> (Mã: {recallModal.id})?
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                Sau khi thu hồi, người quản lý ({recallModal.approver}) sẽ không còn thấy đơn này trong danh sách chờ duyệt nữa.
              </p>
            </div>
            <div className="hrm-pend-v2__modal-foot">
              <button
                type="button"
                className="hrm-pend-v2__modal-btn-cancel"
                onClick={() => setRecallModal(null)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="hrm-pend-v2__modal-btn-confirm is-reject"
                onClick={handleConfirmRecall}
              >
                Xác nhận thu hồi
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
