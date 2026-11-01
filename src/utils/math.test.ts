import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalances,
  calculatePairwiseDebts,
  simplifyDebts,
  splitByShares,
  splitEqual,
  validateExactSplits,
} from './math';
import {
  formatCompactVND,
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
