import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalances,
  calculatePairwiseDebts,
  getExpenseParticipantHeadcount,
  getMemberGroupSize,
  getTotalHeadcount,
  parseMemberGroupSize,
  simplifyDebts,
  splitByShares,
  splitEqual,
  splitEqualWeighted,
  splitPerGroupMember,
  validateExactSplits,
} from './math';
import {
  findDuplicateExpenseOnSameDay,
  formatCompactVND,
  formatExpensesForChat,
  formatSettlementReportForChat,
  formatVND,
  normalizeSearchText,
  readVietnameseNumber,
} from './format';
import { mergeRemoteAndLocalExpenses } from '../services/syncService';
import type { ExpenseRecord, Member, SyncQueueItem } from '../types';

const mockMembers: Member[] = [
  {
    id: 'm1',
    name: 'Duy',
    avatarColor: '#000777',
    defaultWeight: 1,
    bankName: 'VCB',
    accountNo: '0011004567890',
    accountHolder: 'NGUYEN QUOC DUY',
    active: true,
  },
  {
    id: 'm2',
    name: 'Dương',
    avatarColor: '#065f46',
    defaultWeight: 1,
    bankName: 'MB',
    accountNo: '0987654321123',
    accountHolder: 'LE HAI DUONG',
    active: true,
  },
  {
    id: 'm3',
    name: 'Đức',
    avatarColor: '#1e40af',
    defaultWeight: 1,
    bankName: 'TCB',
    accountNo: '19036889922015',
    accountHolder: 'TRAN MINH DUC',
    active: true,
  },
];

test('splitEqual - bảo toàn 100% tổng số nguyên VND (Largest Remainder + xoay vòng)', () => {
  const splits = splitEqual(100000, ['m1', 'm2', 'm3'], 'exp_odd_100k');
  const sum = Object.values(splits).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100000);
  const values = Object.values(splits).sort((a, b) => a - b);
  assert.deepEqual(values, [33333, 33333, 33334]);
});

test('splitByShares - chia theo trọng số chuẩn số nguyên VND không thất thoát đồng lẻ', () => {
  const splits = splitByShares(100000, { m1: 2, m2: 1, m3: 0 }, 'exp_shares_1');
  const sum = Object.values(splits).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100000);
  assert.equal(splits.m1, 66667);
  assert.equal(splits.m2, 33333);
  assert.equal(splits.m3, undefined);
});

test('validateExactSplits - kiểm tra khớp tổng tiền chính xác từng đồng', () => {
  const validCase = validateExactSplits(500000, { m1: 200000, m2: 300000 });
  assert.equal(validCase.valid, true);
  assert.equal(validCase.diff, 0);

  const missingCase = validateExactSplits(500000, { m1: 200000, m2: 250000 });
  assert.equal(missingCase.valid, false);
  assert.equal(missingCase.diff, 50000);
});

test('calculateBalances, simplifyDebts & calculatePairwiseDebts - bảo toàn tổng số dư bằng 0', () => {
  const expenses: ExpenseRecord[] = [
    {
      id: 'e1',
      rev: 1,
      type: 'expense',
      title: 'Ăn tối',
      amount: 300000,
      payer: 'm1',
      splits: { m1: 100000, m2: 100000, m3: 100000 },
      splitMode: 'equal',
      categoryId: 'cat_food',
      spentAt: '2026-10-23 19:00',
      createdBy: 'm1',
      createdAt: '2026-10-23 19:00:00',
      updatedBy: 'm1',
      updatedAt: '2026-10-23 19:00:00',
      deleted: false,
      note: '',
    },
    {
      id: 'e2',
      rev: 1,
      type: 'transfer',
      title: 'Dương chuyển trước cho Duy',
      amount: 40000,
      payer: 'm2',
      splits: { m1: 40000 },
      splitMode: 'exact',
      categoryId: 'cat_other',
      spentAt: '2026-10-24 08:00',
      createdBy: 'm2',
      createdAt: '2026-10-24 08:00:00',
      updatedBy: 'm2',
      updatedAt: '2026-10-24 08:00:00',
      deleted: false,
      note: '',
    },
  ];

  const balances = calculateBalances(mockMembers, expenses);
  const totalBalance = balances.reduce((s, b) => s + b.balance, 0);
  assert.equal(totalBalance, 0);

  const m1 = balances.find((b) => b.memberId === 'm1')!;
  const m2 = balances.find((b) => b.memberId === 'm2')!;
  const m3 = balances.find((b) => b.memberId === 'm3')!;
  assert.equal(m1.balance, 160000); // +200k - 40k nhận chuyển
  assert.equal(m2.balance, -60000); // -100k + 40k đã chuyển
  assert.equal(m3.balance, -100000);

  const simplified = simplifyDebts(balances);
  assert.equal(simplified.length, 2);
  assert.equal(
    simplified.reduce((s, tx) => s + tx.amount, 0),
    160000
  );

  const pairwise = calculatePairwiseDebts(mockMembers, expenses);
  assert.equal(pairwise.length, 2);
  assert.equal(
    pairwise.reduce((s, tx) => s + tx.amount, 0),
    160000
  );
});

test('format.ts - formatVND, formatCompactVND, readVietnameseNumber & normalizeSearchText', () => {
  assert.equal(formatVND(350000, false), '350.000');
  assert.equal(formatCompactVND(1250000), '1,25tr');
  assert.equal(readVietnameseNumber(125000), 'Một trăm hai mươi lăm nghìn đồng');
  assert.equal(normalizeSearchText('Phở Thìn Bờ Hồ & Đặng Văn Ngữ'), 'pho thin bo ho & dang van ngu');
});

test('mergeRemoteAndLocalExpenses - giữ nguyên bản ghi đang nằm trong hàng đợi Offline/Conflict khi tải lại từ Sheet', () => {
  const remote: ExpenseRecord[] = [
    {
      id: 'exp_remote_1',
      rev: 2,
      type: 'expense',
      title: 'Khoản trên Sheet',
      amount: 200000,
      payer: 'm1',
      splits: { m1: 200000 },
      splitMode: 'equal',
      categoryId: 'cat_food',
      spentAt: '2026-10-23 10:00',
      createdBy: 'm1',
      createdAt: '2026-10-23 10:00:00',
      updatedBy: 'm1',
      updatedAt: '2026-10-23 10:00:00',
      deleted: false,
      note: '',
      syncStatus: 'synced',
    },
  ];

  const pendingItem: SyncQueueItem = {
    queueId: 'q_1',
    action: 'UPSERT_EXPENSE',
    baseRev: 0,
    status: 'pending',
    retryCount: 0,
    record: {
      id: 'exp_offline_new',
      rev: 1,
      type: 'expense',
      title: 'Khoản tạo khi Offline',
      amount: 150000,
      payer: 'm2',
      splits: { m2: 150000 },
      splitMode: 'equal',
      categoryId: 'cat_food',
      spentAt: '2026-10-23 11:00',
      createdBy: 'm2',
      createdAt: '2026-10-23 11:00:00',
      updatedBy: 'm2',
      updatedAt: '2026-10-23 11:00:00',
      deleted: false,
      note: '',
      syncStatus: 'pending',
    },
  };

  const merged = mergeRemoteAndLocalExpenses(remote, [pendingItem]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'exp_offline_new');
  assert.equal(merged[0].syncStatus, 'pending');
  assert.equal(merged[1].id, 'exp_remote_1');
});

test('findDuplicateExpenseOnSameDay - phát hiện khoản chi trùng Tiêu đề và Số tiền trong cùng ngày', () => {
  const existingExpenses: ExpenseRecord[] = [
    {
      id: 'exp_1',
      rev: 1,
      type: 'expense',
      title: 'Bánh mì Phượng Hội An',
      amount: 120000,
      payer: 'm1',
      splits: { m1: 60000, m2: 60000 },
      splitMode: 'equal',
      categoryId: 'cat_food',
      spentAt: '2026-11-03 08:30',
      createdBy: 'm1',
      createdAt: '2026-11-03 08:31:00',
      updatedBy: 'm1',
      updatedAt: '2026-11-03 08:31:00',
      deleted: false,
      note: '',
    },
    {
      id: 'exp_deleted',
      rev: 2,
      type: 'expense',
      title: 'Cà phê muối',
      amount: 90000,
      payer: 'm2',
      splits: { m1: 45000, m2: 45000 },
      splitMode: 'equal',
      categoryId: 'cat_food',
      spentAt: '2026-11-03 09:00',
      createdBy: 'm2',
      createdAt: '2026-11-03 09:00:00',
      updatedBy: 'm2',
      updatedAt: '2026-11-03 09:05:00',
      deleted: true,
      note: '',
    },
  ];

  // Trùng tiêu đề (không phân biệt hoa thường/khoảng trắng thừa) + cùng số tiền + cùng ngày -> phát hiện
  const dup = findDuplicateExpenseOnSameDay(existingExpenses, {
    title: '  bánh mì phượng hội an ',
    amount: 120000,
    spentAt: '2026-11-03 19:45',
  });
  assert.ok(dup);
  assert.equal(dup.id, 'exp_1');

  // Cùng tiêu đề + cùng số tiền nhưng khác ngày -> không trùng
  const diffDay = findDuplicateExpenseOnSameDay(existingExpenses, {
    title: 'Bánh mì Phượng Hội An',
    amount: 120000,
    spentAt: '2026-11-04 08:30',
  });
  assert.equal(diffDay, null);

  // Cùng tiêu đề + cùng ngày nhưng khác số tiền -> không trùng
  const diffAmount = findDuplicateExpenseOnSameDay(existingExpenses, {
    title: 'Bánh mì Phượng Hội An',
    amount: 150000,
    spentAt: '2026-11-03 10:00',
  });
  assert.equal(diffAmount, null);

  // Bản ghi đã xóa (deleted: true) -> bỏ qua
  const deletedMatch = findDuplicateExpenseOnSameDay(existingExpenses, {
    title: 'Cà phê muối',
    amount: 90000,
    spentAt: '2026-11-03 10:00',
  });
  assert.equal(deletedMatch, null);

  // Khi đang sửa chính bản ghi đó (id trùng) -> bỏ qua
  const selfEdit = findDuplicateExpenseOnSameDay(existingExpenses, {
    id: 'exp_1',
    title: 'Bánh mì Phượng Hội An',
    amount: 120000,
    spentAt: '2026-11-03 08:30',
  });
  assert.equal(selfEdit, null);
});

test('formatExpensesForChat - tạo chuỗi văn bản định dạng gọn đẹp để dán Zalo/Messenger', () => {
  const tripConfig = {
    tripName: 'Hội nghị YHDP 2026',
    startDate: '2026-10-23',
    endDate: '2026-10-25',
  };

  // Danh sách rỗng hoặc toàn bộ đã xóa -> trả về chuỗi rỗng
  assert.equal(
    formatExpensesForChat({
      config: tripConfig,
      expenses: [
        {
          id: 'del_1',
          type: 'expense',
          title: 'Khoản đã xóa',
          amount: 50000,
          payer: 'm1',
          splits: { m1: 50000 },
          spentAt: '2026-10-23 09:00',
          deleted: true,
        },
      ],
      members: mockMembers,
    }),
    ''
  );

  // Danh sách nhiều ngày gồm trước chuyến, ngày trong chuyến, chuyển khoản và bản ghi đã xóa
  const output = formatExpensesForChat({
    config: tripConfig,
    members: mockMembers,
    filterSummary: 'Người chi: Duy',
    expenses: [
      {
        id: 'e_trip_late',
        type: 'expense',
        title: 'Ăn tối Hải sản',
        amount: 450000,
        payer: 'm1',
        splits: { m1: 150000, m2: 150000, m3: 150000 },
        spentAt: '2026-10-23 19:30',
      },
      {
        id: 'e_pre',
        type: 'expense',
        title: 'Vé máy bay khứ hồi',
        amount: 2500000,
        payer: 'm1',
        splits: { m1: 2500000 },
        spentAt: '2026-10-15 10:00',
      },
      {
        id: 'e_transfer',
        type: 'transfer',
        title: 'Dương ứng trước cho Duy',
        amount: 500000,
        payer: 'm2',
        splits: { m1: 500000 },
        spentAt: '2026-10-23 20:00',
      },
      {
        id: 'e_deleted',
        type: 'expense',
        title: 'Khoản nhập nhầm',
        amount: 999000,
        payer: 'm3',
        splits: { m3: 999000 },
        spentAt: '2026-10-23 12:00',
        deleted: true,
      },
    ],
  });

  const lines = output.split('\n');
  assert.equal(lines[0], '📋 Hội nghị YHDP 2026 (23–25/10/2026)');
  assert.equal(lines[1], 'Bộ lọc: Người chi: Duy');
  assert.equal(
    lines[2],
    `Tổng chi: ${formatVND(2950000, true)} (2 khoản) • Chuyển tiền: ${formatVND(500000, true)} (1 giao dịch)`
  );
  assert.ok(output.includes(`▸ Trước chuyến đi (${formatVND(2500000, true)})`));
  assert.ok(output.includes(`• Vé máy bay khứ hồi - ${formatVND(2500000, true)} - Duy`));
  assert.ok(output.includes(`▸ Thứ Sáu, 23/10 · Ngày 1 (${formatVND(450000, true)})`));
  assert.ok(output.includes(`• Ăn tối Hải sản - ${formatVND(450000, true)} - Duy`));
  assert.ok(output.includes(`• Dương ứng trước cho Duy - ${formatVND(500000, true)} - Dương → Duy`));
  assert.ok(!output.includes('Khoản nhập nhầm'));

  // Đảm bảo nhóm Trước chuyến đi xuất hiện trước Ngày 1
  assert.ok(output.indexOf('Trước chuyến đi') < output.indexOf('Ngày 1'));
});

test('parseMemberGroupSize & headcount - nhận diện chuẩn quy tắc username gộp bắt đầu bằng số', () => {
  assert.equal(parseMemberGroupSize('10 thành viên'), 10);
  assert.equal(parseMemberGroupSize('5 mem'), 5);
  assert.equal(parseMemberGroupSize('03 bạn'), 3);
  assert.equal(parseMemberGroupSize('12-người'), 12);
  assert.equal(parseMemberGroupSize('  8   TV  '), 8);
  assert.equal(parseMemberGroupSize('1 thành viên'), 1);
  assert.equal(parseMemberGroupSize('0 mem'), 1);
  assert.equal(parseMemberGroupSize('2k5 Hùng'), 1);
  assert.equal(parseMemberGroupSize('Duy'), 1);
  assert.equal(parseMemberGroupSize('Duy 2'), 1);
  assert.equal(parseMemberGroupSize('2026 Team'), 1);

  const mixedMembers: Member[] = [
    ...mockMembers.slice(0, 2), // Duy (1), Dương (1)
    {
      id: 'm_group10',
      name: '10 thành viên',
      avatarColor: '#5b21b6',
      defaultWeight: 10,
      bankName: '',
      accountNo: '',
      accountHolder: '',
      active: true,
    },
    {
      id: 'm_inactive',
      name: '4 mem',
      avatarColor: '#155e75',
      defaultWeight: 4,
      bankName: '',
      accountNo: '',
      accountHolder: '',
      active: false,
    },
  ];

  assert.equal(getMemberGroupSize(mixedMembers[2]), 10);
  assert.equal(getTotalHeadcount(mixedMembers), 12); // 1 + 1 + 10 (bỏ qua inactive)
});

test('splitEqualWeighted & splitPerGroupMember - case n1 người chi + n2 người gộp 1 username ("10 thành viên")', () => {
  const members12: Member[] = [
    mockMembers[0], // Duy (1)
    mockMembers[1], // Dương (1)
    {
      id: 'm_group10',
      name: '10 thành viên',
      avatarColor: '#5b21b6',
      defaultWeight: 10,
      bankName: '',
      accountNo: '',
      accountHolder: '',
      active: true,
    },
  ];
  const weights: Record<string, number> = {
    m1: getMemberGroupSize(members12[0]),
    m2: getMemberGroupSize(members12[1]),
    m_group10: getMemberGroupSize(members12[2]),
  };

  // Khoản chi 1.200.000 ₫ do Duy trả, chia đều cả đoàn 12 người (1 + 1 + 10)
  const splits = splitEqualWeighted(1200000, ['m1', 'm2', 'm_group10'], weights, 'exp_group_1');
  assert.equal(splits.m1, 100000);
  assert.equal(splits.m2, 100000);
  assert.equal(splits.m_group10, 1000000);
  assert.equal(
    Object.values(splits).reduce((a, b) => a + b, 0),
    1200000
  );

  // Số người tham gia thực tế là 12
  const memberMap = new Map(members12.map((m) => [m.id, m]));
  assert.equal(getExpenseParticipantHeadcount(splits, memberMap), 12);

  // Khoản chi lẻ 1.000.000 ₫ chia 12 suất -> vẫn bảo toàn 100% tổng 1.000.000 ₫
  const oddSplits = splitEqualWeighted(1000000, ['m1', 'm2', 'm_group10'], weights, 'exp_group_odd');
  assert.equal(
    Object.values(oddSplits).reduce((a, b) => a + b, 0),
    1000000
  );
  assert.ok(oddSplits.m1 === 83333 || oddSplits.m1 === 83334);
  assert.ok(oddSplits.m2 === 83333 || oddSplits.m2 === 83334);
  assert.ok(oddSplits.m_group10 === 833333 || oddSplits.m_group10 === 833334);

  // Quyết toán cuối: tổng 2 khoản chi (Duy trả 1.200.000 + Dương trả 600.000 = 1.800.000 => 150.000/người)
  const splits2 = splitEqualWeighted(600000, ['m1', 'm2', 'm_group10'], weights, 'exp_group_2');
  const expenses: ExpenseRecord[] = [
    {
      id: 'exp_group_1',
      rev: 1,
      type: 'expense',
      title: 'Tiệc tối',
      amount: 1200000,
      payer: 'm1',
      splits,
      splitMode: 'equal',
      categoryId: 'cat_food',
      spentAt: '2026-10-23 19:00',
      createdBy: 'm1',
      createdAt: '2026-10-23 19:00:00',
      updatedBy: 'm1',
      updatedAt: '2026-10-23 19:00:00',
      deleted: false,
      note: '',
    },
    {
      id: 'exp_group_2',
      rev: 1,
      type: 'expense',
      title: 'Xe đưa đón',
      amount: 600000,
      payer: 'm2',
      splits: splits2,
      splitMode: 'equal',
      categoryId: 'cat_move',
      spentAt: '2026-10-23 20:00',
      createdBy: 'm2',
      createdAt: '2026-10-23 20:00:00',
      updatedBy: 'm2',
      updatedAt: '2026-10-23 20:00:00',
      deleted: false,
      note: '',
    },
  ];

  const balances = calculateBalances(members12, expenses);
  assert.equal(
    balances.reduce((s, b) => s + b.balance, 0),
    0
  );
  const groupBal = balances.find((b) => b.memberId === 'm_group10')!;
  assert.equal(groupBal.owedExpense, 1500000);
  assert.equal(groupBal.balance, -1500000);

  // Chia đều cho 10 người trong nhóm: mỗi người chịu 150.000 ₫
  const perPersonBal = splitPerGroupMember(groupBal.balance, 10);
  assert.equal(perPersonBal.perPerson, -150000);
  assert.equal(perPersonBal.isExact, true);

  // Tối giản công nợ: "10 thành viên" chuyển cho Duy (1.050.000 => 105.000/người) và Dương (450.000 => 45.000/người)
  const debts = simplifyDebts(balances);
  assert.equal(debts.length, 2);
  const toDuy = debts.find((d) => d.toMemberId === 'm1')!;
  const toDuong = debts.find((d) => d.toMemberId === 'm2')!;
  assert.equal(toDuy.amount, 1050000);
  assert.equal(splitPerGroupMember(toDuy.amount, 10).perPerson, 105000);
  assert.equal(toDuong.amount, 450000);
  assert.equal(splitPerGroupMember(toDuong.amount, 10).perPerson, 45000);
  // Tổng mỗi người trong nhóm "10 thành viên" chuyển = 105k + 45k = 150k (khớp tuyệt đối!)
  assert.equal(
    splitPerGroupMember(toDuy.amount, 10).perPerson +
      splitPerGroupMember(toDuong.amount, 10).perPerson,
    150000
  );
});

test('formatSettlementReportForChat - xuất báo cáo nhanh gọn nhẹ cho Zalo/Messenger hỗ trợ nhóm gộp', () => {
  const membersWithGroup: Member[] = [
    { ...mockMembers[0], id: 'm1', name: 'Duy', accountNo: '00123456', bankName: 'MB', accountHolder: 'NGUYEN DUY' },
    { ...mockMembers[1], id: 'm2', name: 'Dương', accountNo: '654321', bankName: 'VCB', accountHolder: '' },
    {
      id: 'm_g10',
      name: '10 thành viên',
      avatarColor: '#92400e',
      bankName: '',
      accountNo: '',
      accountHolder: '',
      active: true,
      defaultWeight: 10,
    },
  ];
  const expenses: ExpenseRecord[] = [
    {
      id: 'exp-quick-1',
      type: 'expense',
      title: 'Tiệc tổng kết',
      amount: 1200000,
      payer: 'm1',
      categoryId: 'cat_food',
      spentAt: '2026-11-20 19:00',
      splitMode: 'equal',
      splits: { m1: 100000, m2: 100000, m_g10: 1000000 },
      splitMeta: { selectedMembers: ['m1', 'm2', 'm_g10'] },
      createdBy: 'm1',
      createdAt: '2026-11-20 19:00:00',
      updatedBy: 'm1',
      updatedAt: '2026-11-20 19:00:00',
      rev: 1,
      deleted: false,
      note: '',
    },
  ];

  const balances = calculateBalances(membersWithGroup, expenses);
  const transactions = simplifyDebts(balances);

  const report = formatSettlementReportForChat({
    config: {
      tripName: 'Team Building',
      location: 'Đà Lạt',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
    },
    members: membersWithGroup,
    expenses,
    balances,
    transactions,
    viewMode: 'simplified',
  });

  assert.match(report, /📊 QUYẾT TOÁN: Team Building - Đà Lạt \(20–22\/11\/2026\)/);
  assert.match(report, /Tổng chi: 1\.200\.000\u00A0₫ \(1 khoản\) • 12 người/);
  assert.match(report, /Bình quân: ~100\.000\u00A0₫\/người/);
  assert.match(report, /💸 CẦN CHUYỂN \(Tối giản - 2 khoản\):/);
  assert.match(report, /10 thành viên → Duy: 100\.000\u00A0₫\/người \(Tổng 10 người: 1\.000\.000\u00A0₫\)/);
  assert.match(report, /STK: 00123456 \(MB\) - NGUYEN DUY/);
  assert.match(report, /• 10 thành viên \(÷10\): Chi 0 \| Chịu 1\.000\.000 \(100\.000\/ng\) \| -1\.000\.000 \(-100\.000\/ng\)/);

  // Trường hợp không có khoản nợ nào (cân bằng)
  const emptyReport = formatSettlementReportForChat({
    config: { tripName: 'Chuyến đi cân bằng' },
    members: membersWithGroup.slice(0, 2),
    expenses: [],
    balances: calculateBalances(membersWithGroup.slice(0, 2), []),
    transactions: [],
    viewMode: 'pairwise',
  });
  assert.match(emptyReport, /✅ CẦN CHUYỂN: Không có khoản nợ nào/);
});




