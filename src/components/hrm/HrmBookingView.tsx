import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ClientFormDto } from '../../types/form';
import type { LangCode } from '../../lib/localizedText';
import { FormIcon } from '../form/FormIcon';
import { HrmFooterButton } from './HrmSharedComponents';
import {
  INITIAL_MEETING_ROOMS,
  type MeetingRoomModel,
} from '../../lib/hrmBooking';

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const HOURS_AXIS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const TOTAL_MINUTES = 600; // Từ 08:00 (480 phút) đến 18:00 (1080 phút)

export type FlexibleBookingRecord = {
  id: string;
  roomId: string;
  roomName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "09:15"
  endTime: string;   // "10:45"
  title: string;
  bookedBy: string;
  department: string;
  attendees: number;
  equipment: string[];
  isMine?: boolean;
};

// Dữ liệu mẫu ban đầu cho 3 phòng họp của công ty: Hoàng Sa, Trường Sa, Phú Quốc
const INITIAL_FLEXIBLE_BOOKINGS: FlexibleBookingRecord[] = [
  {
    id: 'BKG-2026-001',
    roomId: 'ROOM-HS',
    roomName: 'Phòng Hoàng Sa',
    date: '2026-09-03',
    startTime: '10:30',
    endTime: '11:45',
    title: 'Họp đối tác & Ký kết hợp đồng',
    bookedBy: 'Lê Hoàng Long',
    department: 'Phòng Kinh Doanh',
    attendees: 18,
    equipment: ['Máy chiếu 4K', '2 Micro'],
    isMine: false,
  },
  {
    id: 'BKG-2026-002',
    roomId: 'ROOM-TS',
    roomName: 'Phòng Trường Sa',
    date: '2026-09-03',
    startTime: '08:30',
    endTime: '10:00',
    title: 'Review Sprint & Kế hoạch tuần',
    bookedBy: 'Tôi (Kỹ sư phần mềm)',
    department: 'Phát Triển Sản Phẩm',
    attendees: 8,
    equipment: ['Tivi 65"', 'Bảng viết'],
    isMine: true,
  },
  {
    id: 'BKG-2026-003',
    roomId: 'ROOM-TS',
    roomName: 'Phòng Trường Sa',
    date: '2026-09-03',
    startTime: '14:00',
    endTime: '15:30',
    title: 'Đào tạo nghiệp vụ nội bộ',
    bookedBy: 'Trần Mỹ Duyên',
    department: 'Phòng Nhân Sự',
    attendees: 12,
    equipment: ['Tivi 65"', 'Wifi riêng'],
    isMine: false,
  },
  {
    id: 'BKG-2026-004',
    roomId: 'ROOM-PQ',
    roomName: 'Phòng Phú Quốc',
    date: '2026-09-03',
    startTime: '14:30',
    endTime: '16:00',
    title: 'Brainstorm ý tưởng sản phẩm mới',
    bookedBy: 'Nguyễn Văn An',
    department: 'Team R&D',
    attendees: 6,
    equipment: ['Tivi 55"', 'Bảng trắng'],
    isMine: false,
  },
];

function parseTimeToMinutes(t: string): number {
  if (!t || !t.includes(':')) return 480;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTimeStr(m: number): string {
  const clamped = Math.max(0, Math.min(1439, m));
  const h = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function formatDurationText(mins: number): string {
  if (mins <= 0) return '0 phút';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDateDisplay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

type Props = {
  form?: ClientFormDto;
  lan?: LangCode;
  busy?: boolean;
  onBack?: () => void;
};

export function HrmBookingView({ busy = false }: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<'all' | string>('all');
  const [rooms] = useState<MeetingRoomModel[]>(INITIAL_MEETING_ROOMS);
  const [bookings, setBookings] = useState<FlexibleBookingRecord[]>(INITIAL_FLEXIBLE_BOOKINGS);
  const [toast, setToast] = useState<string | null>(null);

  // Modal Đặt phòng
  const [modalRoom, setModalRoom] = useState<MeetingRoomModel | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [modalTitle, setModalTitle] = useState('');
  const [modalAttendees, setModalAttendees] = useState('6');
  const [modalEquipments, setModalEquipments] = useState<string[]>(['Tivi 4K', 'Wifi']);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const handlePrevDay = () => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 1);
      return d;
    });
  };

  const handleNextDay = () => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 1);
      return d;
    });
  };

  const handleGoToday = () => {
    setSelectedDate(today);
  };

  const dateStr = selectedDate.toISOString().slice(0, 10);
  const isTodayDate = sameDay(selectedDate, today);
  const weekdayName = WEEKDAYS[selectedDate.getDay()];

  // Lấy danh sách booking trong ngày đang chọn
  const activeDateBookings = useMemo(() => {
    return bookings.filter((b) => b.date === dateStr);
  }, [bookings, dateStr]);


  // Lọc phòng theo filter
  const visibleRooms = useMemo(() => {
    if (selectedRoomFilter === 'all') return rooms;
    return rooms.filter((r) => r.id === selectedRoomFilter);
  }, [rooms, selectedRoomFilter]);

  // Danh sách cuộc họp để hiển thị ở bảng lịch chi tiết bên dưới
  const sortedDayBookings = useMemo(() => {
    const list = [...activeDateBookings];
    list.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
    if (selectedRoomFilter !== 'all') {
      return list.filter((b) => b.roomId === selectedRoomFilter);
    }
    return list;
  }, [activeDateBookings, selectedRoomFilter]);

  // Mở modal đặt phòng
  const handleOpenBooking = (room: MeetingRoomModel, initialStart = '09:00', durationMins = 60) => {
    setModalRoom(room);
    setStartTime(initialStart);
    const sMins = parseTimeToMinutes(initialStart);
    setEndTime(minutesToTimeStr(sMins + durationMins));
    setModalTitle('');
    setModalAttendees(String(Math.min(6, room.capacity)));
    setModalEquipments(room.amenities.slice(0, 2));
  };

  // Click vào vị trí trên timeline track để chọn giờ trực quan
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>, room: MeetingRoomModel) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const rawMins = 480 + pct * TOTAL_MINUTES;
    // Làm tròn đến 15 phút gần nhất
    const roundedMins = Math.round(rawMins / 15) * 15;
    const startStr = minutesToTimeStr(roundedMins);
    handleOpenBooking(room, startStr, 60);
  };

  // Nút cộng thời lượng nhanh
  const handleAddDuration = (durationMinutes: number) => {
    const sMins = parseTimeToMinutes(startTime);
    setEndTime(minutesToTimeStr(sMins + durationMinutes));
  };

  // Tính thời lượng thực tế
  const modalDurationMins = useMemo(() => {
    const s = parseTimeToMinutes(startTime);
    const e = parseTimeToMinutes(endTime);
    return Math.max(0, e - s);
  }, [startTime, endTime]);

  // Kiểm tra trùng lịch trong phòng
  const conflictingBooking = useMemo(() => {
    if (!modalRoom) return null;
    const sNew = parseTimeToMinutes(startTime);
    const eNew = parseTimeToMinutes(endTime);
    if (eNew <= sNew) return null;

    return activeDateBookings.find((b) => {
      if (b.roomId !== modalRoom.id) return false;
      const sOld = parseTimeToMinutes(b.startTime);
      const eOld = parseTimeToMinutes(b.endTime);
      return sNew < eOld && eNew > sOld;
    });
  }, [modalRoom, startTime, endTime, activeDateBookings]);

  // Xác nhận đặt phòng
  const handleConfirmBooking = () => {
    if (!modalRoom) return;

    if (!modalTitle.trim()) {
      showToast('Vui lòng nhập chủ đề hoặc mục đích cuộc họp.');
      return;
    }

    const s = parseTimeToMinutes(startTime);
    const e = parseTimeToMinutes(endTime);

    if (e <= s) {
      showToast('Giờ kết thúc phải lớn hơn giờ bắt đầu.');
      return;
    }

    if (conflictingBooking) {
      showToast(
        `Khung giờ này trùng với cuộc họp: "${conflictingBooking.title}" (${conflictingBooking.startTime} - ${conflictingBooking.endTime}). Vui lòng chọn giờ khác.`,
      );
      return;
    }

    const newBooking: FlexibleBookingRecord = {
      id: `BKG-2026-${String(Date.now()).slice(-4)}`,
      roomId: modalRoom.id,
      roomName: modalRoom.name,
      date: dateStr,
      startTime,
      endTime,
      title: modalTitle.trim(),
      bookedBy: 'Tôi (Kỹ sư phần mềm)',
      department: 'Phát Triển Sản Phẩm',
      attendees: Number(modalAttendees) || 6,
      equipment: modalEquipments,
      isMine: true,
    };

    setBookings((prev) => [newBooking, ...prev]);
    setModalRoom(null);
    showToast(`Đặt ${modalRoom.name} (${startTime} → ${endTime}) thành công!`);
  };

  // Hủy đặt phòng
  const handleCancelBooking = (bookingId: string) => {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) return;

    if (confirm(`Bạn có chắc muốn hủy lịch đặt "${b.roomName}" (${b.startTime} - ${b.endTime})?`)) {
      setBookings((prev) => prev.filter((x) => x.id !== bookingId));
      showToast(`Đã hủy lịch đặt ${b.roomName}.`);
    }
  };

  return (
    <div className="hrm-book hrm-matrix-page">
      {/* Toast thông báo */}
      {toast ? <div className="hrm-pend__toast">{toast}</div> : null}

      {/* 1. THANH CHỌN NGÀY & ĐIỀU HƯỚNG */}
      <div className="hrm-mat__date-bar">
        <button
          type="button"
          className="hrm-mat__date-btn"
          onClick={handlePrevDay}
          title="Ngày trước"
        >
          <FormIcon name="chevron-left" size={16} />
        </button>
        <div className="hrm-mat__date-center">
          <span className="hrm-mat__weekday">{weekdayName},</span>
          <strong className="hrm-mat__date-str">
            {formatDateDisplay(selectedDate)}
          </strong>
          {isTodayDate ? (
            <span className="hrm-mat__today-badge">Hôm nay</span>
          ) : (
            <button
              type="button"
              className="hrm-mat__btn-today"
              onClick={handleGoToday}
            >
              Về hôm nay
            </button>
          )}
        </div>
        <button
          type="button"
          className="hrm-mat__date-btn"
          onClick={handleNextDay}
          title="Ngày sau"
        >
          <FormIcon name="chevron-right" size={16} />
        </button>
      </div>

      {/* 2. THANH LỌC 3 PHÒNG HỌP & CHÚ THÍCH */}
      <div className="hrm-mat__controls">
        <div className="hrm-mat__room-pills">
          <button
            type="button"
            className={`hrm-mat__pill${selectedRoomFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setSelectedRoomFilter('all')}
          >
            Tất cả 3 phòng
          </button>
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`hrm-mat__pill${selectedRoomFilter === r.id ? ' is-active' : ''}`}
              onClick={() => setSelectedRoomFilter(r.id)}
            >
              {r.name.replace('Phòng ', '')}
            </button>
          ))}
        </div>

        <div className="hrm-mat__legend">
          <span className="hrm-mat__legend-item">
            <span className="hrm-mat__legend-dot is-free" /> Trống (Chạm để đặt)
          </span>
          <span className="hrm-mat__legend-item">
            <span className="hrm-mat__legend-dot is-busy" /> Đã đặt
          </span>
          <span className="hrm-mat__legend-item">
            <span className="hrm-mat__legend-dot is-mine" /> Lịch của bạn
          </span>
        </div>
      </div>

      {/* 3. MA TRẬN LỊCH PHÒNG HỌP (SCHEDULE TIMELINE MATRIX) */}
      <div className="hrm-mat__card">
        <div className="hrm-mat__card-title-bar">
          <div className="hrm-mat__card-heading">
            <FormIcon name="calendar" size={15} />
            <span>Lịch book phòng trực quan (08:00 - 18:00)</span>
          </div>
          <span className="hrm-mat__card-hint">
            💡 Chạm vào khoảng trống trên dòng để đặt giờ tức thì
          </span>
        </div>

        <div className="hrm-mat__scroll-wrap">
          <div className="hrm-mat__matrix-grid">
            {/* Hàng Header trục giờ */}
            <div className="hrm-mat__header-row">
              <div className="hrm-mat__corner-cell">Phòng họp</div>
              <div className="hrm-mat__axis-track">
                {HOURS_AXIS.map((h, idx) => (
                  <span
                    key={h}
                    className="hrm-mat__axis-time"
                    style={{ left: `${(idx / (HOURS_AXIS.length - 1)) * 100}%` }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
            </div>

            {/* 3 Hàng phòng họp: Hoàng Sa, Trường Sa, Phú Quốc */}
            <div className="hrm-mat__body">
              {visibleRooms.map((room) => {
                const roomBookings = activeDateBookings.filter((b) => b.roomId === room.id);
                const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
                const isOccupiedNow = roomBookings.some((b) => {
                  const s = parseTimeToMinutes(b.startTime);
                  const e = parseTimeToMinutes(b.endTime);
                  return isTodayDate && nowMins >= s && nowMins < e;
                });

                return (
                  <div key={room.id} className="hrm-mat__room-row">
                    {/* Cột Tên phòng họp (Sticky bên trái) */}
                    <div className="hrm-mat__room-col">
                      <div className="hrm-mat__room-info">
                        <span
                          className={`hrm-mat__status-dot ${
                            isOccupiedNow ? 'is-busy' : 'is-available'
                          }`}
                          title={isOccupiedNow ? 'Đang có cuộc họp' : 'Đang trống'}
                        />
                        <div className="hrm-mat__room-names">
                          <strong className="hrm-mat__room-title">
                            {room.name.replace('Phòng ', '')}
                          </strong>
                          <span className="hrm-mat__room-sub">
                            {room.capacity} chỗ • {room.floor}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="hrm-mat__btn-quick-add"
                        title={`Đặt nhanh ${room.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenBooking(room, '09:00', 60);
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Dải Timeline liên tục từ 8h đến 18h */}
                    <div
                      className="hrm-mat__timeline-track"
                      onClick={(e) => handleTimelineClick(e, room)}
                      title={`Bấm vào bất kỳ đâu trên dòng ${room.name} để đặt`}
                    >
                      {/* Các vạch giờ dọc mờ */}
                      {HOURS_AXIS.slice(1, -1).map((_, idx) => (
                        <div
                          key={idx}
                          className="hrm-mat__grid-line"
                          style={{ left: `${((idx + 1) / (HOURS_AXIS.length - 1)) * 100}%` }}
                        />
                      ))}

                      {/* Các khối cuộc họp đã đặt */}
                      {roomBookings.map((b) => {
                        const s = Math.max(480, parseTimeToMinutes(b.startTime));
                        const e = Math.min(1080, parseTimeToMinutes(b.endTime));
                        const leftPct = ((s - 480) / TOTAL_MINUTES) * 100;
                        const widthPct = Math.max(3, ((e - s) / TOTAL_MINUTES) * 100);

                        return (
                          <div
                            key={b.id}
                            className={`hrm-mat__event-pill${b.isMine ? ' is-mine' : ''}`}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                            }}
                            title={`${b.startTime} - ${b.endTime}: ${b.title} (${b.bookedBy})`}
                            onClick={(e) => {
                              e.stopPropagation();
                              showToast(`Cuộc họp: "${b.title}" (${b.startTime} - ${b.endTime}) do ${b.bookedBy} đặt.`);
                            }}
                          >
                            <span className="hrm-mat__pill-time">
                              {b.startTime} - {b.endTime}
                            </span>
                            <span className="hrm-mat__pill-title">{b.title}</span>
                            {b.isMine ? (
                              <button
                                type="button"
                                className="hrm-mat__pill-cancel-btn"
                                title="Hủy cuộc họp này"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleCancelBooking(b.id);
                                }}
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. DANH SÁCH CHI TIẾT CÁC CUỘC HỌP TRONG NGÀY (LỊCH BOOK PHÒNG) */}
      <div className="hrm-mat__schedule-section">
        <div className="hrm-mat__section-head">
          <div className="hrm-mat__section-title">
            <FormIcon name="list" size={15} />
            <strong>
              Lịch họp trong ngày ({sortedDayBookings.length} cuộc họp)
            </strong>
          </div>
          <span className="hrm-mat__section-date">
            Ngày {selectedDate.getDate()}/{selectedDate.getMonth() + 1}
          </span>
        </div>

        {sortedDayBookings.length === 0 ? (
          <div className="hrm-mat__empty-schedule">
            <FormIcon name="calendar-check" size={24} />
            <span>Chưa có cuộc họp nào được đặt cho ngày này.</span>
            <button
              type="button"
              className="hrm-mat__btn-empty-book"
              onClick={() => handleOpenBooking(rooms[0], '09:00', 60)}
            >
              Đặt phòng ngay
            </button>
          </div>
        ) : (
          <div className="hrm-mat__meetings-list">
            {sortedDayBookings.map((b) => (
              <div
                key={b.id}
                className={`hrm-mat__meeting-card${b.isMine ? ' is-mine' : ''}`}
              >
                <div className="hrm-mat__meeting-time-col">
                  <span className="hrm-mat__m-start">{b.startTime}</span>
                  <span className="hrm-mat__m-end">{b.endTime}</span>
                  <span className="hrm-mat__m-dur">
                    {formatDurationText(parseTimeToMinutes(b.endTime) - parseTimeToMinutes(b.startTime))}
                  </span>
                </div>

                <div className="hrm-mat__meeting-main-col">
                  <div className="hrm-mat__m-head">
                    <span className="hrm-mat__m-room-tag">
                      🏢 {b.roomName}
                    </span>
                    {b.isMine ? (
                      <span className="hrm-mat__m-mine-badge">Lịch của bạn</span>
                    ) : (
                      <span className="hrm-mat__m-dept-tag">{b.department}</span>
                    )}
                  </div>

                  <h4 className="hrm-mat__m-title">{b.title}</h4>

                  <div className="hrm-mat__m-meta">
                    <span>👤 {b.bookedBy}</span>
                    <span>•</span>
                    <span>👥 {b.attendees} người</span>
                    {b.equipment?.length ? (
                      <>
                        <span>•</span>
                        <span>🛠️ {b.equipment.join(', ')}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                {b.isMine ? (
                  <button
                    type="button"
                    className="hrm-mat__m-cancel-btn"
                    onClick={() => handleCancelBooking(b.id)}
                    title="Hủy đặt phòng này"
                  >
                    Hủy
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. NÚT CHÂN TRANG ĐẶT PHÒNG NHANH */}
      <HrmFooterButton
        icon="calendar-plus"
        label="Đặt phòng họp mới"
        disabled={busy}
        onClick={() => {
          handleOpenBooking(rooms[0], '09:00', 60);
        }}
      />

      {/* 6. MODAL TỰ SETUP KHUNG GIỜ LINH HOẠT (RENDER QUA PORTAL TRÁNH BỊ CO LẠI) */}
      {modalRoom && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-runtime-slug="hrm"
              className="hrm-mat__modal-backdrop"
              role="dialog"
              aria-modal="true"
              onClick={() => setModalRoom(null)}
            >
              <div
                className="hrm-mat__modal"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header modal */}
                <div className="hrm-mat__modal-head">
                  <h3 className="hrm-mat__modal-title">
                    Đặt phòng: {modalRoom.name}
                  </h3>
                  <button
                    type="button"
                    className="hrm-mat__modal-close"
                    onClick={() => setModalRoom(null)}
                    title="Đóng"
                  >
                    <FormIcon name="x" size={16} />
                  </button>
                </div>

                {/* Thân modal có cuộn riêng biệt */}
                <div className="hrm-mat__modal-body">
                  {/* Chọn nhanh 1 trong 3 phòng */}
                  <div>
                    <label className="hrm-mat__modal-label">
                      Phòng họp (*):
                    </label>
                    <div className="hrm-mat__modal-rooms">
                      {rooms.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`hrm-mat__modal-room-item${modalRoom.id === r.id ? ' is-active' : ''}`}
                          onClick={() => setModalRoom(r)}
                        >
                          <strong>{r.name.replace('Phòng ', '')}</strong>
                          <small>({r.capacity} người)</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* KHUNG TỰ SETUP KHUNG GIỜ HỌP */}
                  <div className="hrm-mat__time-card">
                    <div className="hrm-mat__time-row">
                      <div>
                        <label className="hrm-mat__modal-label">
                          Giờ bắt đầu (*):
                        </label>
                        <input
                          type="time"
                          className="hrm-mat__time-input"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="hrm-mat__modal-label">
                          Giờ kết thúc (*):
                        </label>
                        <input
                          type="time"
                          className="hrm-mat__time-input"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Dải 5 nút thời lượng vừa vặn 1 dòng */}
                    <div className="hrm-mat__dur-preset-box">
                      <span className="hrm-mat__dur-preset-title">Gợi ý thời lượng nhanh:</span>
                      <div className="hrm-mat__dur-preset-grid">
                        <button
                          type="button"
                          className="hrm-mat__dur-btn"
                          onClick={() => handleAddDuration(30)}
                        >
                          +30p
                        </button>
                        <button
                          type="button"
                          className="hrm-mat__dur-btn"
                          onClick={() => handleAddDuration(45)}
                        >
                          +45p
                        </button>
                        <button
                          type="button"
                          className="hrm-mat__dur-btn"
                          onClick={() => handleAddDuration(60)}
                        >
                          +1h
                        </button>
                        <button
                          type="button"
                          className="hrm-mat__dur-btn"
                          onClick={() => handleAddDuration(90)}
                        >
                          +1.5h
                        </button>
                        <button
                          type="button"
                          className="hrm-mat__dur-btn"
                          onClick={() => handleAddDuration(120)}
                        >
                          +2h
                        </button>
                      </div>
                    </div>

                    {/* Tóm tắt thời lượng thực tế */}
                    <div className="hrm-mat__dur-summary">
                      <FormIcon name="clock" size={13} />
                      <span>
                        Thời lượng: <strong>{formatDurationText(modalDurationMins)}</strong> ({startTime} → {endTime})
                      </span>
                    </div>

                    {/* Cảnh báo trùng lịch */}
                    {conflictingBooking ? (
                      <div className="hrm-mat__conflict-alert">
                        <FormIcon name="alert-triangle" size={15} />
                        <span>
                          <strong>Trùng lịch!</strong> Khung giờ này đè lên:{' '}
                          <em>"{conflictingBooking.title}"</em> ({conflictingBooking.startTime} - {conflictingBooking.endTime}).
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Tiêu đề cuộc họp */}
                  <div>
                    <label className="hrm-mat__modal-label">
                      Chủ đề / Mục đích cuộc họp (*):
                    </label>
                    <input
                      type="text"
                      className="hrm-mat__modal-input"
                      placeholder="Ví dụ: Họp Sprint Review, Tiếp đối tác..."
                      value={modalTitle}
                      onChange={(e) => setModalTitle(e.target.value)}
                    />
                  </div>

                  {/* Số người & phòng ban */}
                  <div className="hrm-mat__modal-grid-2">
                    <div>
                      <label className="hrm-mat__modal-label">
                        Số người tham dự:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={modalRoom.capacity}
                        className="hrm-mat__modal-input"
                        value={modalAttendees}
                        onChange={(e) => setModalAttendees(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="hrm-mat__modal-label">
                        Phòng ban:
                      </label>
                      <input
                        type="text"
                        disabled
                        className="hrm-mat__modal-input is-readonly"
                        value="Phát Triển Sản Phẩm"
                      />
                    </div>
                  </div>

                  {/* Thiết bị phụ trợ dạng lưới 2 cột */}
                  <div>
                    <label className="hrm-mat__modal-label">
                      Thiết bị phụ trợ:
                    </label>
                    <div className="hrm-mat__equip-grid">
                      {['Máy chiếu 4K', 'Micro không dây', 'Bảng viết & Bút', 'Trà & Cà phê'].map(
                        (eq) => {
                          const checked = modalEquipments.includes(eq);
                          return (
                            <label key={eq} className="hrm-mat__equip-label">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  if (checked) {
                                    setModalEquipments((prev) => prev.filter((x) => x !== eq));
                                  } else {
                                    setModalEquipments((prev) => [...prev, eq]);
                                  }
                                }}
                              />
                              <span>{eq}</span>
                            </label>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer chân modal luôn cố định */}
                <div className="hrm-mat__modal-foot">
                  <button
                    type="button"
                    className="hrm-mat__modal-btn-cancel"
                    onClick={() => setModalRoom(null)}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={!!conflictingBooking || modalDurationMins <= 0}
                    className="hrm-mat__modal-btn-confirm"
                    onClick={handleConfirmBooking}
                  >
                    Xác nhận đặt phòng
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
