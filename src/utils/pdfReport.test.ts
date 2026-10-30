import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExpenseReportData, formatSpentAtReportVN, sanitizeFileNameSegment } from './pdfReport';
import type { Category, ExpenseRecord, Member, TripConfig } from '../types';

const mockConfig: TripConfig = {
  tripId: 'trip_dalat_2026',
  tripName: 'Đà Lạt Mùa Sương 2026',
  location: 'Đà Lạt, Lâm Đồng',
  startDate: '2026-10-24',
  endDate: '2026-10-26',
  currency: 'VND',
  defaultSplitMode: 'equal',
  rev: 3,
  updatedAt: '2026-10-24 10:00:00',
  tripStatus: 'active',
};

const mockMembers: Member[] = [
  { id: 'm1', name: 'Minh Anh', avatarColor: '#0f766e' },
  { id: 'm2', name: 'Hoàng Nam', avatarColor: '#0369a1' },
  { id: 'm3', name: 'Thảo Vy', avatarColor: '#b45309' },
];

const mockCategories: Category[] = [
  { id: 'cat_food', name: 'Ăn uống', icon: 'Utensils', order: 1 },
  { id: 'cat_move', name: 'Di chuyển', icon: 'Car', order: 2 },
  { id: 'cat_other', name: 'Khác', icon: 'Package', order: 99 },
];

const mockExpenses: ExpenseRecord[] = [
  {
    id: 'exp_1',
    rev: 1,
    type: 'expense',
    title: 'Lẩu gà lá é Tao Ngộ',
    amount: 450000,
    payer: 'm1',
    splits: { m1: 150000, m2: 150000, m3: 150000 },
    splitMode: 'equal',
    categoryId: 'cat_food',
    spentAt: '2026-10-24 19:30',
    createdAt: '2026-10-24 19:35:00',
    updatedAt: '2026-10-24 19:35:00',
    deleted: false,
  },
  {
    id: 'exp_2',
    rev: 1,
    type: 'expense',
    title: 'Thuê xe máy 2 ngày',
    amount: 300000,
    payer: 'm2',
    splits: { m1: 150000, m2: 150000 },
    splitMode: 'equal',
    categoryId: 'cat_move',
    spentAt: '2026-10-24 08:15',
    createdAt: '2026-10-24 08:20:00',
    updatedAt: '2026-10-24 08:20:00',
    deleted: false,
  },
  {
    id: 'exp_3',
    rev: 1,
    type: 'transfer',
    title: 'Hoàng Nam chuyển trả Minh Anh',
    amount: 50000,
    payer: 'm2',
    splits: { m1: 50000 },
    splitMode: 'exact',
    categoryId: 'cat_other',
    spentAt: '2026-10-25 10:00',
    createdAt: '2026-10-25 10:00:00',
    updatedAt: '2026-10-25 10:00:00',
    deleted: false,
  },
  {
    id: 'exp_deleted',
    rev: 2,
    type: 'expense',
    title: 'Khoản chi nhầm đã xóa',
    amount: 999000,
    payer: 'm3',
    splits: { m1: 333000, m2: 333000, m3: 333000 },
    splitMode: 'equal',
    categoryId: 'cat_other',
    spentAt: '2026-10-24 12:00',
    createdAt: '2026-10-24 12:00:00',
    updatedAt: '2026-10-24 12:05:00',
    deleted: true,
  },
];

test('buildExpenseReportData - xuất toàn bộ chuyến đi (all) loại bỏ khoản đã xóa và sắp xếp theo thời gian', () => {
  const report = buildExpenseReportData({
    config: mockConfig,
    members: mockMembers,
    categories: mockCategories,
    expenses: mockExpenses,
    filterMemberId: 'all',
  });

  assert.equal(report.scopeLabel, 'Toàn bộ chuyến đi');
  assert.equal(report.rows.length, 3);
  assert.equal(report.totalExpenseAmount, 750000);
  assert.equal(report.totalTransferAmount, 50000);
  assert.equal(report.memberSummary, null);

  // Kiểm tra sắp xếp theo thời gian tăng dần
  assert.equal(report.rows[0].id, 'exp_2');
  assert.equal(report.rows[0].date, '24/10/2026 08:15');
  assert.equal(report.rows[0].title, 'Thuê xe máy 2 ngày');
  assert.equal(report.rows[0].payerName, 'Hoàng Nam');
  assert.equal(report.rows[0].amountFormatted, '300.000');
  assert.equal(report.rows[0].typeLabel, 'Di chuyển');

  assert.equal(report.rows[2].id, 'exp_3');
  assert.equal(report.rows[2].typeLabel, 'Chuyển trả');
});

test('buildExpenseReportData - lọc theo thành viên cụ thể (m3 - Thảo Vy) chỉ lấy khoản có liên quan', () => {
  const report = buildExpenseReportData({
    config: mockConfig,
    members: mockMembers,
    categories: mockCategories,
    expenses: mockExpenses,
    filterMemberId: 'm3',
  });

  assert.equal(report.scopeLabel, 'Thành viên: Thảo Vy');
  // Thảo Vy chỉ tham gia exp_1 (Lẩu gà lá é), không tham gia exp_2 hay exp_3
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].id, 'exp_1');
  assert.equal(report.rows[0].memberShare, 150000);
  assert.ok(report.memberSummary);
  assert.equal(report.memberSummary.paidExpense, 0);
  assert.equal(report.memberSummary.owedExpense, 150000);
  assert.equal(report.memberSummary.balance, -150000);
  assert.equal(report.suggestedFileName, 'bao-cao-da-lat-mua-suong-2026-thao-vy.pdf');
});

test('formatSpentAtReportVN & sanitizeFileNameSegment hoạt động chính xác', () => {
  assert.equal(formatSpentAtReportVN('2026-10-24 19:30'), '24/10/2026 19:30');
  assert.equal(sanitizeFileNameSegment('Đà Lạt 2026!'), 'da-lat-2026');
});
