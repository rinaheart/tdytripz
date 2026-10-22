import type { Category, ExpenseRecord, Member, TripConfig } from './types';
import { splitEqual, splitByShares } from './utils/math';

const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;

/**
 * CẤU HÌNH CỨNG LINK GOOGLE APPS SCRIPT (WEB APP URL) TẠI ĐÂY:
 * Dán link https://script.google.com/macros/s/.../exec vào chuỗi bên dưới
 * để mọi thành viên mở link web app là tự động kết nối và tải dữ liệu từ Sheet.
 */
export const DEFAULT_GAS_URL: string =
  metaEnv?.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbz4wJVFOsvnJ6aY_S62gnQ_Vazjm9qbVvnbImbEaDaSiEmZZqAjAHLy9oZXxIR0fnQ/exec';

export const AVATAR_COLORS: string[] = [
  '#000777', // Brand Navy (18.1:1)
  '#065f46', // Emerald 800 (7.7:1)
  '#92400e', // Amber 800 (7.1:1)
  '#1e40af', // Blue 800 (8.7:1)
  '#9f1239', // Rose 800 (8.3:1)
  '#5b21b6', // Violet 800 (8.4:1)
  '#155e75', // Cyan 800 (7.5:1)
];

export const BANK_LIST: string[] = [
  'Vietcombank (VCB)',
  'Techcombank (TCB)',
  'MB Bank (MB)',
  'BIDV',
  'VietinBank (CTG)',
  'ACB',
  'VPBank',
  'TPBank',
  'Sacombank (STB)',
  'VIB',
];

export const DEFAULT_TRIP_CONFIG: TripConfig = {
  tripId: 'HN3N2D_2026',
  tripName: 'Hà Nội 3N2Đ',
  location: 'Hoàn Kiếm, Hà Nội',
  startDate: '2026-10-23',
  endDate: '2026-10-25',
  tripStatus: 'active',
  defaultSplitMode: 'equal',
  enabledSplitModes: ['equal', 'shares', 'exact'],
  suggestMultipliers: [1000, 10000, 100000],
  maxSuggestAmount: 50000000,
  accentColor: '#000777',
};

export const DEFAULT_MEMBERS: Member[] = [
  {
    id: 'mem_duy',
    name: 'Duy',
    avatarColor: '#000777',
    defaultWeight: 1,
    bankName: 'VCB',
    accountNo: '0011004567890',
    accountHolder: 'NGUYEN QUOC DUY',
    active: true,
  },
  {
    id: 'mem_duong',
    name: 'Dương',
    avatarColor: '#065f46',
    defaultWeight: 1,
    bankName: 'MB',
    accountNo: '0987654321123',
    accountHolder: 'LE HAI DUONG',
    active: true,
  },
  {
    id: 'mem_duc',
    name: 'Đức',
    avatarColor: '#1e40af',
    defaultWeight: 1,
    bankName: 'TCB',
    accountNo: '19036889922015',
    accountHolder: 'TRAN MINH DUC',
    active: true,
  },
  {
    id: 'mem_lan',
    name: 'Lan',
    avatarColor: '#9f1239',
    defaultWeight: 1,
    bankName: 'TPBank',
    accountNo: '03698889991',
    accountHolder: 'HOANG PHUONG LAN',
    active: true,
  },
  {
    id: 'mem_minh',
    name: 'Minh',
    avatarColor: '#5b21b6',
    defaultWeight: 1,
    bankName: 'ACB',
    accountNo: '23456789',
    accountHolder: 'PHAM NHAT MINH',
    active: true,
  },
];

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'cat_flight',
    name: 'Vé máy bay / Tàu xe',
    icon: 'Plane',
    order: 1,
    hidden: false,
  },
  {
    id: 'cat_transport',
    name: 'Di chuyển tại chỗ',
    icon: 'Car',
    order: 2,
    hidden: false,
  },
  {
    id: 'cat_food',
    name: 'Ăn uống',
    icon: 'Utensils',
    order: 3,
    hidden: false,
  },
  {
    id: 'cat_hotel',
    name: 'Khách sạn / Lưu trú',
    icon: 'Hotel',
    order: 4,
    hidden: false,
  },
  {
    id: 'cat_ticket',
    name: 'Vé tham quan',
    icon: 'Ticket',
    order: 5,
    hidden: false,
  },
  {
    id: 'cat_other',
    name: 'Khác',
    icon: 'Package',
    order: 6,
    hidden: false,
  },
];

const ALL_MEMBER_IDS = DEFAULT_MEMBERS.map((m) => m.id);

export const DEFAULT_EXPENSES: ExpenseRecord[] = [
  {
    id: 'f1a01001-1000-4000-8000-000000000001',
    rev: 1,
    type: 'expense',
    title: 'Vé máy bay khứ hồi (5 người)',
    amount: 10500000,
    payer: 'mem_duy',
    splits: splitEqual(10500000, ALL_MEMBER_IDS, 'f1a01001-1000-4000-8000-000000000001'),
    splitMode: 'equal',
    splitMeta: { selectedMembers: ALL_MEMBER_IDS },
    categoryId: 'cat_flight',
    spentAt: '2026-10-15 14:30',
    createdBy: 'mem_duy',
    createdAt: '2026-10-15 14:32:10',
    updatedBy: 'mem_duy',
    updatedAt: '2026-10-15 14:32:10',
    deleted: false,
    note: '2.100.000đ/người',
    syncStatus: 'synced',
  },
  {
    id: 'f1a01001-1000-4000-8000-000000000002',
    rev: 1,
    type: 'expense',
    title: 'Khách sạn La Siesta Phố Cổ (2 đêm)',
    amount: 5200000,
    payer: 'mem_lan',
    splits: splitEqual(5200000, ALL_MEMBER_IDS, 'f1a01001-1000-4000-8000-000000000002'),
    splitMode: 'equal',
    splitMeta: { selectedMembers: ALL_MEMBER_IDS },
    categoryId: 'cat_hotel',
    spentAt: '2026-10-18 09:45',
    createdBy: 'mem_lan',
    createdAt: '2026-10-18 09:46:05',
    updatedBy: 'mem_lan',
    updatedAt: '2026-10-18 09:46:05',
    deleted: false,
    note: '2 phòng đôi + 1 giường phụ',
    syncStatus: 'synced',
  },
  {
    id: 'f1a01001-1000-4000-8000-000000000003',
    rev: 1,
    type: 'expense',
    title: 'Xe 7 chỗ đón sân bay Nội Bài',
    amount: 380000,
    payer: 'mem_duc',
    splits: splitEqual(380000, ALL_MEMBER_IDS, 'f1a01001-1000-4000-8000-000000000003'),
    splitMode: 'equal',
    splitMeta: { selectedMembers: ALL_MEMBER_IDS },
    categoryId: 'cat_transport',
    spentAt: '2026-10-23 08:15',
    createdBy: 'mem_duc',
    createdAt: '2026-10-23 08:20:00',
    updatedBy: 'mem_duc',
    updatedAt: '2026-10-23 08:20:00',
    deleted: false,
    note: '',
    syncStatus: 'synced',
  },
  {
    id: 'f1a01001-1000-4000-8000-000000000004',
    rev: 1,
    type: 'expense',
    title: 'Phở Thìn Bờ Hồ + Cafe Giảng',
    amount: 575000,
    payer: 'mem_duong',
    splits: splitEqual(575000, ALL_MEMBER_IDS, 'f1a01001-1000-4000-8000-000000000004'),
    splitMode: 'equal',
    splitMeta: { selectedMembers: ALL_MEMBER_IDS },
    categoryId: 'cat_food',
    spentAt: '2026-10-23 09:30',
    createdBy: 'mem_duong',
    createdAt: '2026-10-23 09:35:12',
    updatedBy: 'mem_duong',
    updatedAt: '2026-10-23 09:35:12',
    deleted: false,
    note: '',
    syncStatus: 'synced',
  },
  {
    id: 'f1a01001-1000-4000-8000-000000000005',
    rev: 1,
    type: 'expense',
    title: 'Ăn tối Chả cá Thăng Long',
    amount: 1450000,
    payer: 'mem_duy',
    splits: splitEqual(1450000, ALL_MEMBER_IDS, 'f1a01001-1000-4000-8000-000000000005'),
    splitMode: 'equal',
    splitMeta: { selectedMembers: ALL_MEMBER_IDS },
    categoryId: 'cat_food',
    spentAt: '2026-10-23 19:30',
    createdBy: 'mem_duy',
    createdAt: '2026-10-23 20:10:00',
    updatedBy: 'mem_duy',
    updatedAt: '2026-10-23 20:10:00',
    deleted: false,
    note: '',
    syncStatus: 'synced',
  },
  {
    id: 'f1a01001-1000-4000-8000-000000000006',
    rev: 1,
    type: 'expense',
    title: 'Vé Tour Đêm Hoàng Thành & Văn Miếu',
    amount: 750000,
    payer: 'mem_minh',
    splits: splitByShares(
      750000,
      {
        mem_duy: 1,
        mem_duc: 1,
        mem_duong: 1,
        mem_minh: 1,
        mem_lan: 1,
      },
      'f1a01001-1000-4000-8000-000000000006'
    ),
    splitMode: 'shares',
    splitMeta: {
      shares: {
        mem_duy: 1,
        mem_duc: 1,
        mem_duong: 1,
        mem_minh: 1,
        mem_lan: 1,
      },
    },
    categoryId: 'cat_ticket',
    spentAt: '2026-10-24 09:00',
    createdBy: 'mem_minh',
    createdAt: '2026-10-24 09:05:00',
    updatedBy: 'mem_minh',
    updatedAt: '2026-10-24 09:05:00',
    deleted: false,
    note: '150k/người',
    syncStatus: 'synced',
  },
];

export { GOOGLE_APPS_SCRIPT_CODE } from './assets/gasCode';

