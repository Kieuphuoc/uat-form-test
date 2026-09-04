import type { ClientFormDto } from '../types/form';
import { resolveLocalizedText, type LangCode } from './localizedText';
import { hrmComingSoonFeature, isHrmAttendanceForm } from './hrmAttendance';

export const BOOKING_RE = /booking|đặt\s*phòng|dat\s*phong|phòng\s*họp|phong\s*hop|meeting\s*room/i;

export type RoomStatus = 'available' | 'occupied' | 'maintenance';

export type TimeSlot = {
  time: string; // e.g. "08:30 - 09:30"
  status: 'available' | 'booked';
  bookedBy?: string;
  title?: string;
};

export type MeetingRoomModel = {
  id: string;
  name: string;
  floor: 'Tầng 1' | 'Tầng 2' | 'Tầng 3';
  capacity: number;
  amenities: string[];
  status: RoomStatus;
  currentBooking?: {
    bookedBy: string;
    department: string;
    until: string;
    title: string;
  };
  slots: TimeSlot[];
};

export type BookingRecordModel = {
  id: string;
  roomId: string;
  roomName: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "09:00 - 10:30"
  title: string;
  bookedBy: string;
  department: string;
  attendees: number;
  equipment: string[];
  createdAt: string;
};

export type BookingCategoryTab = 'all' | 'f1' | 'f2' | 'large' | 'small' | 'my';

export const BOOKING_CATEGORY_TABS: { id: BookingCategoryTab; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'f1', label: 'Tầng 1' },
  { id: 'f2', label: 'Tầng 2' },
  { id: 'large', label: 'Phòng lớn (15+)' },
  { id: 'small', label: 'Phòng nhỏ (≤8)' },
  { id: 'my', label: 'Lịch của tôi' },
];

export const TIME_SLOT_OPTIONS = [
  '08:30 - 09:30',
  '09:30 - 10:30',
  '10:30 - 11:30',
  '13:30 - 14:30',
  '14:30 - 15:30',
  '15:30 - 16:30',
  '16:30 - 17:30',
];

export const INITIAL_MEETING_ROOMS: MeetingRoomModel[] = [
  {
    id: 'ROOM-HS',
    name: 'Phòng Hoàng Sa',
    floor: 'Tầng 1',
    capacity: 25,
    amenities: ['Tivi 75"', 'Máy chiếu 4K', '2 Micro', 'Bảng kính'],
    status: 'occupied',
    currentBooking: {
      bookedBy: 'Lê Hoàng Long',
      department: 'Phòng Kinh Doanh',
      until: '11:45',
      title: 'Họp đối tác & Ký kết hợp đồng',
    },
    slots: [],
  },
  {
    id: 'ROOM-TS',
    name: 'Phòng Trường Sa',
    floor: 'Tầng 1',
    capacity: 15,
    amenities: ['Tivi 65"', 'Micro không dây', 'Bảng viết', 'Wifi riêng'],
    status: 'occupied',
    currentBooking: {
      bookedBy: 'Tôi (Kỹ sư phần mềm)',
      department: 'Phát Triển Sản Phẩm',
      until: '10:00',
      title: 'Review Sprint & Kế hoạch tuần',
    },
    slots: [],
  },
  {
    id: 'ROOM-PQ',
    name: 'Phòng Phú Quốc',
    floor: 'Tầng 2',
    capacity: 8,
    amenities: ['Tivi 55"', 'Bảng trắng', 'Trà & Nước'],
    status: 'available',
    slots: [],
  },
];

export const INITIAL_MY_BOOKINGS: BookingRecordModel[] = [
  {
    id: 'BKG-2026-001',
    roomId: 'ROOM-102',
    roomName: 'Phòng Họp Sáng Tạo',
    date: new Date().toISOString().slice(0, 10),
    timeSlot: '08:30 - 11:00',
    title: 'Review Sprint UI/UX Arito 2.0',
    bookedBy: 'Tôi (Kỹ sư phần mềm)',
    department: 'Phòng Phát Triển Sản Phẩm',
    attendees: 6,
    equipment: ['Tivi', 'Máy chiếu'],
    createdAt: 'Hôm nay, 08:15',
  },
];

function formHaystack(form: ClientFormDto): string {
  const title = typeof form.title === 'string' ? form.title : JSON.stringify(form.title ?? '');
  const listIds = (form.lists ?? []).map((l) => l.id).join(' ');
  return `${form.id} ${title} ${listIds}`;
}

export function isHrmBookingForm(
  slug: string,
  form: ClientFormDto,
  values: Record<string, unknown> = {},
  lan: LangCode = 'v',
): boolean {
  if (slug !== 'hrm' && slug !== 'booking') return false;
  if ((form.layout || 'stack').toLowerCase() === 'drawer') return false;
  if (isHrmAttendanceForm(slug, form)) return false;
  if (BOOKING_RE.test(formHaystack(form))) return true;
  const feat = hrmComingSoonFeature(form, values, lan);
  return feat ? BOOKING_RE.test(feat) : false;
}

export function hrmBookingChromeTitle(
  form: ClientFormDto,
  values: Record<string, unknown>,
  lan: LangCode,
): string {
  const t = resolveLocalizedText(form.title, lan).trim();
  if (BOOKING_RE.test(t)) return t;
  const feat = hrmComingSoonFeature(form, values, lan);
  if (feat && BOOKING_RE.test(feat)) return feat.trim();
  return 'Đặt phòng họp';
}
