import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExpenseReportData,
  formatSpentAtReportVN,
  sanitizeFileNameSegment,
  shortenCategoryLabelForTable,
} from './pdfReport';
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
  {
    id: 'm1',
    name: 'Minh Anh',
    avatarColor: '#0f766e',
    bankName: 'Vietcombank',
    accountNo: '0123456789',
    accountHolder: 'NGUYEN MINH ANH',
  },
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

test('buildExpenseReportData - xuất toàn bộ chuyến đi (all) có đủ Tổng quan, Chia tiền, Chi tiết và Phụ lục từng cá nhân', () => {
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

  // 1. Kiểm tra Overview (Tổng quan + Biểu đồ Danh mục + Ngày)
  assert.equal(report.overview.totalExpenseAmount, 750000);
  assert.equal(report.overview.averagePerMember, 250000);
  assert.equal(report.overview.expenseCount, 2);
  assert.equal(report.overview.transferCount, 1);
  assert.equal(report.overview.byCategory.length, 2);
  assert.equal(report.overview.byCategory[0].categoryName, 'Ăn uống');
  assert.equal(report.overview.byCategory[0].amount, 450000);
  assert.equal(report.overview.byCategory[0].percentage, 60);
  assert.equal(report.overview.byCategory[1].categoryName, 'Di chuyển');
  assert.equal(report.overview.byCategory[1].amount, 300000);
  assert.equal(report.overview.byCategory[1].percentage, 40);
  assert.equal(report.overview.byDay.length, 1);
  assert.equal(report.overview.byDay[0].label, 'Ngày 1 (24/10/2026)');
  assert.equal(report.overview.byDay[0].amount, 750000);

  // 2. Kiểm tra Settlement (Chia tiền & Quyết toán cuối cùng)
  assert.equal(report.settlement.balances.length, 3);
  const m1Bal = report.settlement.balances.find((b) => b.memberId === 'm1');
  const m2Bal = report.settlement.balances.find((b) => b.memberId === 'm2');
  const m3Bal = report.settlement.balances.find((b) => b.memberId === 'm3');
  assert.ok(m1Bal && m2Bal && m3Bal);
  // m1: đã chi 450k, phải chịu 300k, nhận chuyển 50k => balance = +100k
  assert.equal(m1Bal.balance, 100000);
  // m2: đã chi 300k, phải chịu 300k, đã chuyển 50k => balance = +50k
  assert.equal(m2Bal.balance, 50000);
  // m3: đã chi 0, phải chịu 150k => balance = -150k
  assert.equal(m3Bal.balance, -150000);

  // Gợi ý chuyển khoản tối ưu: Thảo Vy chuyển 100k cho Minh Anh và 50k cho Hoàng Nam
  assert.equal(report.settlement.simplifiedDebts.length, 2);
  const toM1 = report.settlement.simplifiedDebts.find((d) => d.toMemberId === 'm1');
  assert.ok(toM1);
  assert.equal(toM1.fromMemberName, 'Thảo Vy');
  assert.equal(toM1.amount, 100000);
  assert.ok(toM1.toBankInfo.includes('Vietcombank'));

  // 3. Kiểm tra Sổ chi tiết sắp xếp theo thời gian tăng dần
  assert.equal(report.rows[0].id, 'exp_2');
  assert.equal(report.rows[0].date, '24/10/2026 08:15');
  assert.equal(report.rows[0].participantsSummary, 'Minh Anh, Hoàng Nam');
  assert.equal(report.rows[0].compactTypeLabel, 'Di chuyển');
  assert.equal(report.rows[2].id, 'exp_3');
  assert.equal(report.rows[2].typeLabel, 'Chuyển trả');
  assert.equal(report.rows[2].participantsSummary, 'Hoàng Nam -> Minh Anh');

  // 4. Kiểm tra Phụ lục cá nhân (3 trang tương ứng 3 thành viên)
  assert.equal(report.memberAppendices.length, 3);
  const m1App = report.memberAppendices.find((a) => a.memberId === 'm1');
  assert.ok(m1App);
  assert.equal(m1App.paidRows.length, 1); // trả exp_1
  assert.equal(m1App.participatedRows.length, 3); // thụ hưởng exp_1, exp_2 và nhận chuyển exp_3
  assert.equal(m1App.byCategory.length, 2); // Ăn uống (150k) + Di chuyển (150k)
});

test('buildExpenseReportData - lọc theo thành viên cụ thể (m3 - Thảo Vy) chỉ tạo phụ lục của thành viên đó', () => {
  const report = buildExpenseReportData({
    config: mockConfig,
    members: mockMembers,
    categories: mockCategories,
    expenses: mockExpenses,
    filterMemberId: 'm3',
  });

  assert.equal(report.scopeLabel, 'Thành viên: Thảo Vy');
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].id, 'exp_1');
  assert.equal(report.rows[0].memberShare, 150000);
  assert.ok(report.memberSummary);
  assert.equal(report.memberSummary.paidExpense, 0);
  assert.equal(report.memberSummary.owedExpense, 150000);
  assert.equal(report.memberSummary.balance, -150000);
  assert.equal(report.memberAppendices.length, 1);
  assert.equal(report.memberAppendices[0].memberName, 'Thảo Vy');
  assert.equal(report.memberAppendices[0].finalSettlementActions.length, 2);
  assert.equal(report.suggestedFileName, 'bao-cao-da-lat-mua-suong-2026-thao-vy.pdf');
});

test('formatSpentAtReportVN, sanitizeFileNameSegment & shortenCategoryLabelForTable hoạt động chính xác', () => {
  assert.equal(formatSpentAtReportVN('2026-10-24 19:30'), '24/10/2026 19:30');
  assert.equal(sanitizeFileNameSegment('Đà Lạt 2026!'), 'da-lat-2026');
  assert.equal(shortenCategoryLabelForTable('Vé đi/về (máy bay/tàu xe)'), 'Vé đi/về');
  assert.equal(shortenCategoryLabelForTable('Lưu trú (KS/homestay)'), 'Lưu trú');
});

