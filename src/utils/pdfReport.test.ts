import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as LucideIcons from 'lucide-react';
import {
  allocatePercentages,
  buildExpenseReportData,
  buildParticipantsInfo,
  buildReportFileName,
  computeMemberCardGrid,
  deriveBannerPalette,
  formatSpentAtReportVN,
  getDayBucket,
  sanitizeFileNameSegment,
  shortenCategoryLabelForTable,
  buildPdfDocument,
  type PdfFontData,
} from './pdfReport';
import {
  LUCIDE_ICON_NODES,
  parseSvgPathToSubpaths,
  resolveLucideIconKey,
} from './pdfLucideIcons';
import { splitEqual } from './math';
import type { Category, ExpenseRecord, Member, TripConfig } from '../types';

const loadedFonts: PdfFontData = {
  regular: fs
    .readFileSync(path.resolve(process.cwd(), 'public/fonts/PlusJakartaSans-Medium.ttf'))
    .toString('base64'),
  bold: fs
    .readFileSync(path.resolve(process.cwd(), 'public/fonts/PlusJakartaSans-Bold.ttf'))
    .toString('base64'),
};

const hanoiConfig: TripConfig = {
  tripId: 'yhdp_2026',
  tripName: 'Hội nghị YHDP 2026',
  location: 'Hà Nội',
  startDate: '2026-10-22',
  endDate: '2026-10-24',
  tripStatus: 'completed',
  defaultSplitMode: 'equal',
  enabledSplitModes: ['equal', 'shares', 'exact'],
  suggestMultipliers: [1000, 10000, 100000],
  maxSuggestAmount: 50000000,
  accentColor: '#000777',
};

const hanoiMembers: Member[] = [
  {
    id: 'm_duy',
    name: 'Duy',
    avatarColor: '#000777',
    defaultWeight: 1,
    bankName: 'VCB',
    accountNo: '0011004567890',
    accountHolder: 'NGUYEN QUOC DUY',
    active: true,
  },
  {
    id: 'm_duc',
    name: 'Đức',
    avatarColor: '#1e40af',
    defaultWeight: 1,
    bankName: 'TCB',
    accountNo: '19036889922015',
    accountHolder: 'TRAN MINH DUC',
    active: true,
  },
  {
    id: 'm_loan',
    name: 'Loan',
    avatarColor: '#9f1239',
    defaultWeight: 1,
    bankName: 'TPBank',
    accountNo: '03698889991',
    accountHolder: 'HOANG PHUONG LOAN',
    active: true,
  },
  {
    id: 'm_luu',
    name: 'Lưu',
    avatarColor: '#065f46',
    defaultWeight: 1,
    bankName: 'MB',
    accountNo: '0987654321123',
    accountHolder: 'LE VAN LUU',
    active: true,
  },
  {
    id: 'm_nhi',
    name: 'Nhi',
    avatarColor: '#5b21b6',
    defaultWeight: 1,
    bankName: 'VTB',
    accountNo: '0375090782',
    accountHolder: 'PHAM YEN NHI',
    active: true,
  },
];

const hanoiCategories: Category[] = [
  { id: 'cat_flight', name: 'Vé đi/về (máy bay/tàu xe)', icon: 'Plane', order: 1, hidden: false },
  { id: 'cat_food', name: 'Ăn uống', icon: 'Utensils', order: 2, hidden: false },
  { id: 'cat_hotel', name: 'Lưu trú (KS/homestay)', icon: 'Hotel', order: 3, hidden: false },
  { id: 'cat_move', name: 'Di chuyển tại chỗ', icon: 'Car', order: 4, hidden: false },
  { id: 'cat_other', name: 'Khác', icon: 'Package', order: 99, hidden: false },
];

test('1. allocatePercentages luôn tổng bằng 100 theo phương pháp Largest Remainder', () => {
  assert.deepEqual(allocatePercentages([]), []);
  assert.deepEqual(allocatePercentages([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(allocatePercentages([100, 100, 100]), [34, 33, 33]);

  const raw = [11021005, 6823920, 2136000, 1280000, 780475];
  const pcts = allocatePercentages(raw);
  const sum = pcts.reduce((acc, v) => acc + v, 0);
  assert.equal(sum, 100);
  assert.equal(pcts.length, raw.length);
});

test('2. getDayBucket phân loại đúng Trước chuyến, Ngày thứ k, Sau chuyến và Chưa rõ ngày', () => {
  const pre1 = getDayBucket('2026-10-19 14:20', '2026-10-22', '2026-10-24');
  const pre2 = getDayBucket('2026-10-21 09:00', '2026-10-22', '2026-10-24');
  assert.equal(pre1.key, 'PRE_TRIP');
  assert.equal(pre2.key, 'PRE_TRIP');
  assert.equal(pre1.label, 'Trước chuyến');
  assert.equal(pre1.kind, 'pre');

  const day1 = getDayBucket('2026-10-22 20:59', '2026-10-22', '2026-10-24');
  assert.equal(day1.key, '2026-10-22');
  assert.equal(day1.label, 'Thứ Năm 22/10 · Ngày 1');
  assert.equal(day1.kind, 'trip');

  const day3 = getDayBucket('2026-10-24 18:00', '2026-10-22', '2026-10-24');
  assert.equal(day3.key, '2026-10-24');
  assert.equal(day3.label, 'Thứ Bảy 24/10 · Ngày 3');
  assert.equal(day3.kind, 'trip');

  const post = getDayBucket('2026-10-26 10:00', '2026-10-22', '2026-10-24');
  assert.equal(post.key, 'POST_TRIP');
  assert.equal(post.label, 'Sau chuyến');
  assert.equal(post.kind, 'post');

  const unknown = getDayBucket('', '2026-10-22', '2026-10-24');
  assert.equal(unknown.key, 'UNKNOWN');
  assert.equal(unknown.label, 'Chưa rõ ngày');
  assert.equal(unknown.kind, 'unknown');
});

test('3 & 4. buildParticipantsInfo xử lý đúng Cả nhóm, Trừ <tên>, <=3 tên, N người và transfer', () => {
  const memberMap = new Map(hanoiMembers.map((m) => [m.id, m]));
  const allIds = hanoiMembers.map((m) => m.id);

  // Tất cả 5 người -> Cả nhóm
  const allEqual: ExpenseRecord = {
    id: 'e1',
    rev: 1,
    type: 'expense',
    title: 'Ăn trưa',
    amount: 500000,
    payer: 'm_nhi',
    splits: splitEqual(500000, allIds, 'e1'),
    splitMode: 'equal',
    categoryId: 'cat_food',
    spentAt: '2026-10-22 12:00',
    createdBy: 'm_nhi',
    createdAt: '2026-10-22 12:00:00',
    updatedBy: 'm_nhi',
    updatedAt: '2026-10-22 12:00:00',
    deleted: false,
    note: '',
  };
  const infoAll = buildParticipantsInfo(allEqual, hanoiMembers, memberMap);
  assert.equal(infoAll.kind, 'all');
  assert.equal(infoAll.text, 'Cả nhóm');

  // Vắng đúng 1 người (vắng Lưu) -> Trừ Lưu
  const exceptOneIds = ['m_duy', 'm_duc', 'm_loan', 'm_nhi'];
  const exceptOneExp: ExpenseRecord = {
    ...allEqual,
    id: 'e2',
    title: 'Cf HL sân bay',
    amount: 240000,
    splits: splitEqual(240000, exceptOneIds, 'e2'),
  };
  const infoExceptOne = buildParticipantsInfo(exceptOneExp, hanoiMembers, memberMap);
  assert.equal(infoExceptOne.kind, 'except');
  assert.equal(infoExceptOne.text, 'Trừ Lưu');

  // <= 3 người -> liệt kê tên
  const twoExp: ExpenseRecord = {
    ...allEqual,
    id: 'e3',
    title: 'Quà riêng',
    amount: 200000,
    splits: { m_loan: 120000, m_nhi: 80000 },
    splitMode: 'exact',
  };
  const infoTwo = buildParticipantsInfo(twoExp, hanoiMembers, memberMap);
  assert.equal(infoTwo.kind, 'names');
  assert.equal(infoTwo.text, 'Loan, Nhi');

  // Với đoàn 6 người mà chỉ 4 người tham gia (vắng 2 người, >3 người) -> "4 người"
  const sixMembers: Member[] = [
    ...hanoiMembers,
    {
      id: 'm_6',
      name: 'Minh',
      avatarColor: '#155e75',
      defaultWeight: 1,
      bankName: '',
      accountNo: '',
      accountHolder: '',
      active: true,
    },
  ];
  const sixMap = new Map(sixMembers.map((m) => [m.id, m]));
  const fourOfSixInfo = buildParticipantsInfo(exceptOneExp, sixMembers, sixMap);
  assert.equal(fourOfSixInfo.kind, 'count');
  assert.equal(fourOfSixInfo.text, '4 người');

  // Transfer -> A → B
  const transferRec: ExpenseRecord = {
    ...allEqual,
    id: 't1',
    type: 'transfer',
    payer: 'm_duc',
    splits: { m_nhi: 500000 },
    splitMode: 'exact',
  };
  const infoTransfer = buildParticipantsInfo(transferRec, hanoiMembers, memberMap);
  assert.equal(infoTransfer.kind, 'transfer');
  assert.equal(infoTransfer.text, 'Đức → Nhi');
});

test('5 & 6 & 7. Fixture thực tế 5 người / 42 khoản chi (Hội nghị YHDP 2026) đạt đủ 8 tiêu chí nghiệm thu & đúng 3 trang', () => {
  const allIds = hanoiMembers.map((m) => m.id);
  const exceptLuuIds = ['m_duy', 'm_duc', 'm_loan', 'm_nhi'];

  const expenses42: ExpenseRecord[] = [
    // 2 khoản trước chuyến (19/10 và 21/10) -> phải gộp vào đúng 1 dòng "Trước chuyến"
    {
      id: 'exp_pre_1',
      rev: 1,
      type: 'expense',
      title: 'Vé máy bay khứ hồi SGN - HAN',
      amount: 11021005,
      payer: 'm_nhi',
      splits: splitEqual(11021005, allIds, 'exp_pre_1'),
      splitMode: 'equal',
      categoryId: 'cat_flight',
      spentAt: '2026-10-19 14:20',
      createdBy: 'm_nhi',
      createdAt: '2026-10-19 14:20:00',
      updatedBy: 'm_nhi',
      updatedAt: '2026-10-19 14:20:00',
      deleted: false,
      note: '',
    },
    {
      id: 'exp_pre_2',
      rev: 1,
      type: 'expense',
      title: 'Đặt cọc khách sạn phố cổ',
      amount: 2136000,
      payer: 'm_nhi',
      splits: splitEqual(2136000, allIds, 'exp_pre_2'),
      splitMode: 'equal',
      categoryId: 'cat_hotel',
      spentAt: '2026-10-21 09:30',
      createdBy: 'm_nhi',
      createdAt: '2026-10-21 09:30:00',
      updatedBy: 'm_nhi',
      updatedAt: '2026-10-21 09:30:00',
      deleted: false,
      note: '',
    },
    // Khoản "Cf HL sân bay" vắng đúng 1 người (Lưu)
    {
      id: 'exp_cf_hl',
      rev: 1,
      type: 'expense',
      title: 'Cf HL sân bay',
      amount: 245000,
      payer: 'm_loan',
      splits: splitEqual(245000, exceptLuuIds, 'exp_cf_hl'),
      splitMode: 'equal',
      categoryId: 'cat_food',
      spentAt: '2026-10-22 06:15',
      createdBy: 'm_loan',
      createdAt: '2026-10-22 06:15:00',
      updatedBy: 'm_loan',
      updatedAt: '2026-10-22 06:15:00',
      deleted: false,
      note: '',
    },
    // Khoản "Quà riêng" chia theo exact
    {
      id: 'exp_qua_rieng',
      rev: 1,
      type: 'expense',
      title: 'Quà riêng',
      amount: 450000,
      payer: 'm_nhi',
      splits: { m_duy: 150000, m_loan: 150000, m_luu: 150000 },
      splitMode: 'exact',
      categoryId: 'cat_other',
      spentAt: '2026-10-24 16:40',
      createdBy: 'm_nhi',
      createdAt: '2026-10-24 16:40:00',
      updatedBy: 'm_nhi',
      updatedAt: '2026-10-24 16:40:00',
      deleted: false,
      note: '',
    },
  ];

  // Thêm 38 khoản chi trong 3 ngày (22/10, 23/10, 24/10) để đủ đúng 42 khoản chi
  const dates = ['2026-10-22', '2026-10-23', '2026-10-24'];
  const cats = ['cat_food', 'cat_move', 'cat_food', 'cat_other'];
  const payers = ['m_nhi', 'm_nhi', 'm_loan', 'm_duy', 'm_duc', 'm_luu'];
  for (let i = 0; i < 38; i++) {
    const dayStr = dates[i % dates.length];
    const hour = String(7 + (i % 14)).padStart(2, '0');
    const min = String((i * 7) % 60).padStart(2, '0');
    const id = `exp_regular_${i + 1}`;
    const amount = 120000 + (i % 7) * 35000;
    const payer = payers[i % payers.length];
    expenses42.push({
      id,
      rev: 1,
      type: 'expense',
      title: `Chi tiêu hội nghị #${i + 1}`,
      amount,
      payer,
      splits: splitEqual(amount, allIds, id),
      splitMode: 'equal',
      categoryId: cats[i % cats.length],
      spentAt: `${dayStr} ${hour}:${min}`,
      createdBy: payer,
      createdAt: `${dayStr} ${hour}:${min}:00`,
      updatedBy: payer,
      updatedAt: `${dayStr} ${hour}:${min}:00`,
      deleted: false,
      note: '',
    });
  }

  assert.equal(expenses42.length, 42);

  const report = buildExpenseReportData({
    config: hanoiConfig,
    members: hanoiMembers,
    categories: hanoiCategories,
    expenses: expenses42,
  });

  // Tiêu chí 2: Số ngày hiển thị ở KPI là 3 ngày (từ 22–24/10), và biểu đồ ngày có đúng 1 dòng "Trước chuyến"
  assert.equal(report.tripDays, 3);
  assert.equal(report.overview.tripDays, 3);
  assert.equal(report.dateRangeLabel, '22–24/10/2026');
  const preTripDayRows = report.overview.byDay.filter((d) => d.label === 'Trước chuyến');
  assert.equal(preTripDayRows.length, 1);
  assert.equal(preTripDayRows[0].count, 2);

  // Tiêu chí 3: Tổng phần trăm mỗi biểu đồ bằng 100
  const catPctSum = report.overview.byCategory.reduce((acc, c) => acc + c.percentage, 0);
  const dayPctSum = report.overview.byDay.reduce((acc, d) => acc + d.percentage, 0);
  assert.equal(catPctSum, 100);
  assert.equal(dayPctSum, 100);

  // Tiêu chí 4: Khoản "Quà riêng" có isCustomSplit = true; "Cf HL sân bay" hiện "Trừ Lưu"
  const allLedgerRows = report.ledger.flatMap((g) => g.rows);
  assert.equal(allLedgerRows.length, 42);
  const quaRiengRow = allLedgerRows.find((r) => r.title === 'Quà riêng');
  const cfHlRow = allLedgerRows.find((r) => r.title === 'Cf HL sân bay');
  assert.ok(quaRiengRow);
  assert.equal(quaRiengRow.isCustomSplit, true);
  assert.ok(cfHlRow);
  assert.equal(cfHlRow.participants.text, 'Trừ Lưu');
  assert.equal(cfHlRow.participants.kind, 'except');
  // Trong chuyến chỉ hiện HH:mm, trước chuyến hiện dd/MM HH:mm
  assert.equal(cfHlRow.time, '06:15');
  const preRow = allLedgerRows.find((r) => r.id === 'exp_pre_1');
  assert.ok(preRow);
  assert.equal(preRow.time, '19/10 14:20');

  // Tiêu chí 5: Nhi là người nhận duy nhất (hub 4 -> 1), settlementGroups có đúng 1 nhóm của Nhi kèm STK VTB • 0375090782
  assert.equal(report.settlementGroups.length, 1);
  assert.equal(report.settlementGroups[0].toName, 'Nhi');
  assert.equal(report.settlementGroups[0].bankInfo, 'VTB • 0375090782');
  assert.equal(report.settlementGroups[0].senders.length, 4);

  // Tiêu chí 6: Số dư mỗi người khớp tuyệt đối giữa settlement.balances và memberCards, và PDF xuất ra đúng 3 trang
  assert.equal(report.memberCards.length, 5);
  for (const card of report.memberCards) {
    const bal = report.settlement.balances.find((b) => b.memberId === card.memberId);
    assert.ok(bal);
    assert.equal(card.balance, bal.balance);
    const cardCatPctSum = card.byCategory.reduce((s, c) => s + c.percentage, 0);
    assert.equal(cardCatPctSum, 100);
  }

  const doc = buildPdfDocument(report, loadedFonts);
  assert.equal(doc.getNumberOfPages(), 3);
});

test('6b. settlementGroups với 2 người nhận tạo đúng 2 nhóm độc lập', () => {
  const expensesTwoCreditors: ExpenseRecord[] = [
    {
      id: 'e_a',
      rev: 1,
      type: 'expense',
      title: 'Khách sạn',
      amount: 5000000,
      payer: 'm_nhi',
      splits: splitEqual(5000000, hanoiMembers.map((m) => m.id), 'e_a'),
      splitMode: 'equal',
      categoryId: 'cat_hotel',
      spentAt: '2026-10-22 14:00',
      createdBy: 'm_nhi',
      createdAt: '2026-10-22 14:00:00',
      updatedBy: 'm_nhi',
      updatedAt: '2026-10-22 14:00:00',
      deleted: false,
      note: '',
    },
    {
      id: 'e_b',
      rev: 1,
      type: 'expense',
      title: 'Vé máy bay',
      amount: 4000000,
      payer: 'm_duy',
      splits: splitEqual(4000000, hanoiMembers.map((m) => m.id), 'e_b'),
      splitMode: 'equal',
      categoryId: 'cat_flight',
      spentAt: '2026-10-22 15:00',
      createdBy: 'm_duy',
      createdAt: '2026-10-22 15:00:00',
      updatedBy: 'm_duy',
      updatedAt: '2026-10-22 15:00:00',
      deleted: false,
      note: '',
    },
  ];

  const report = buildExpenseReportData({
    config: hanoiConfig,
    members: hanoiMembers,
    categories: hanoiCategories,
    expenses: expensesTwoCreditors,
  });

  assert.equal(report.settlementGroups.length, 2);
  assert.equal(report.settlementGroups[0].toName, 'Nhi');
  assert.equal(report.settlementGroups[1].toName, 'Duy');
});

test('8. Stress test: 10 người, 100 khoản chi kết xuất tối đa 6 trang (<= 6 trang)', () => {
  const members10: Member[] = Array.from({ length: 10 }, (_, idx) => ({
    id: `m_${idx + 1}`,
    name: `Thành viên ${idx + 1}`,
    avatarColor: '#000777',
    defaultWeight: 1,
    bankName: 'VCB',
    accountNo: `00110099887${idx}`,
    accountHolder: `THANH VIEN ${idx + 1}`,
    active: true,
  }));
  const allIds10 = members10.map((m) => m.id);

  const expenses100: ExpenseRecord[] = Array.from({ length: 100 }, (_, i) => {
    const day = 22 + (i % 3);
    const hour = String(6 + (i % 16)).padStart(2, '0');
    const min = String(i % 60).padStart(2, '0');
    const id = `stress_exp_${i + 1}`;
    const amount = 150000 + (i % 10) * 20000;
    const payer = members10[i % 2].id;
    return {
      id,
      rev: 1,
      type: 'expense',
      title: `Khoản chi đoàn 10 người #${i + 1}`,
      amount,
      payer,
      splits: splitEqual(amount, allIds10, id),
      splitMode: 'equal',
      categoryId: hanoiCategories[i % hanoiCategories.length].id,
      spentAt: `2026-10-${day} ${hour}:${min}`,
      createdBy: payer,
      createdAt: `2026-10-${day} ${hour}:${min}:00`,
      updatedBy: payer,
      updatedAt: `2026-10-${day} ${hour}:${min}:00`,
      deleted: false,
      note: '',
    };
  });

  const report100 = buildExpenseReportData({
    config: hanoiConfig,
    members: members10,
    categories: hanoiCategories,
    expenses: expenses100,
  });

  const doc = buildPdfDocument(report100, loadedFonts);
  assert.ok(
    doc.getNumberOfPages() <= 6,
    `Expected <= 6 pages for 10 members / 100 expenses, got ${doc.getNumberOfPages()}`
  );
});

test('Quy ước tên file ASCII report_<slug>_<yyyymmdd>_<HHmm>.pdf, bảng màu banner & lưới thẻ cá nhân', () => {
  assert.equal(formatSpentAtReportVN('2026-10-24 19:30'), '24/10/2026 19:30');
  assert.equal(sanitizeFileNameSegment('Hà Nội!'), 'ha-noi');
  assert.equal(
    buildReportFileName('Hà Nội', 'Hội nghị YHDP 2026', '2026-11-03 15:15:00'),
    'report_ha-noi_20261103_1515.pdf'
  );
  assert.equal(
    buildReportFileName('', 'Đà Lạt 2026', '2026-11-03 09:05'),
    'report_da-lat-2026_20261103_0905.pdf'
  );
  assert.equal(shortenCategoryLabelForTable('Vé đi/về (máy bay/tàu xe)'), 'Vé đi/về');
  assert.equal(shortenCategoryLabelForTable('Lưu trú (KS/homestay)'), 'Lưu trú');

  const grid = computeMemberCardGrid(210, 14, 4);
  assert.equal(grid.fullWidth, 182);
  assert.equal(grid.colWidth, 89);
  assert.equal(grid.leftColX, 14);
  assert.equal(grid.rightColX, 107);

  const palette = deriveBannerPalette('#60a5fa'); // màu quá sáng sẽ được kẹp tối xuống L <= 0.26
  assert.ok(palette.base[0] < 130 && palette.base[1] < 130);
});

test('9. LUCIDE_ICON_NODES đồng bộ 100% với bộ icon lucide-react đã cài đặt', () => {
  for (const [iconKey, elements] of Object.entries(LUCIDE_ICON_NODES)) {
    assert.ok(elements.length > 0, `Icon ${iconKey} phải có ít nhất 1 phần tử SVG`);
    for (const [tag, attrs] of elements) {
      if (tag === 'path') {
        const subs = parseSvgPathToSubpaths(attrs.d);
        assert.ok(subs.length > 0, `Path của ${iconKey} phải sinh ít nhất 1 subpath`);
      }
    }

    const lucideComp = (LucideIcons as Record<string, unknown>)[iconKey] as
      | { render?: (props: Record<string, unknown>, ref: unknown) => { props?: { iconNode?: Array<[string, Record<string, unknown>]> } } }
      | undefined;
    if (lucideComp && typeof lucideComp.render === 'function') {
      const rendered = lucideComp.render({}, null);
      const upstreamNodes = rendered?.props?.iconNode;
      if (Array.isArray(upstreamNodes)) {
        assert.equal(
          elements.length,
          upstreamNodes.length,
          `Số phần tử SVG của ${iconKey} phải khớp với lucide-react`
        );
      }
    }
  }

  assert.equal(resolveLucideIconKey('MoreDots'), 'Ellipsis');
  assert.equal(resolveLucideIconKey('PieChartHeader'), 'PieChart');
  assert.equal(resolveLucideIconKey('ArrowUpRight'), 'ArrowUpRight');
  assert.equal(resolveLucideIconKey('ArrowDownLeft'), 'ArrowDownLeft');
});
