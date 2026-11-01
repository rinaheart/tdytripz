import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CATEGORIES, DEFAULT_MEMBERS, DEFAULT_TRIP_CONFIG } from '../config';
import type { ExpenseRecord, SyncQueueItem } from '../types';
import { normalizeSearchText } from '../utils/format';
import { calculateBalances, calculatePairwiseDebts, simplifyDebts } from '../utils/math';
import { buildExpenseReportData, formatMemberBankInfo } from '../utils/pdfReportData';
import {
  canMemberModifyExpense,
  changeAdminPin,
  enqueueExpenseUpsert,
  getExpenseOwnerId,
  isEquivalentExpensePayload,
  isNonRetryableSyncError,
  isValidGasExecUrl,
  loadAppState,
  loadSyncQueue,
  mergeRemoteAndLocalExpenses,
  normalizeMembersList,
  processSyncQueue,
  pruneSatisfiedQueueItems,
  resetToDemoData,
  resolveExpenseOwnerMember,
  saveAppState,
  saveSyncQueue,
  setGasUrl,
  setSimulateOffline,
  verifyAdminPin,
} from './syncService';

function setupMockBrowserEnv() {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'window', {
    value: {
      location: {
        href: 'https://tdytrip.example.com/',
        search: '',
      },
      localStorage: mockLocalStorage,
    },
    configurable: true,
    writable: true,
  });

  return { store };
}

function makeExpense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: overrides.id || 'exp_test_1',
    rev: overrides.rev ?? 1,
    type: overrides.type || 'expense',
    title: overrides.title || 'Ăn tối hải sản',
    amount: overrides.amount ?? 500000,
    payer: overrides.payer || 'mem_duy',
    splits: overrides.splits || {
      mem_duy: 100000,
      mem_lan: 100000,
      mem_minh: 100000,
      mem_ha: 100000,
      mem_tuan: 100000,
    },
    splitMode: overrides.splitMode || 'equal',
    categoryId: overrides.categoryId || 'cat_food',
    spentAt: overrides.spentAt || '2026-10-16 19:30',
    createdBy: overrides.createdBy || 'mem_duy',
    createdAt: overrides.createdAt || '2026-10-16 19:31:00',
    updatedBy: overrides.updatedBy || 'mem_duy',
    updatedAt: overrides.updatedAt || '2026-10-16 19:31:00',
    deleted: overrides.deleted ?? false,
    note: overrides.note ?? '',
    syncStatus: overrides.syncStatus || 'synced',
  };
}

test('Phase 2 [Scenario 1 & 4]: Idempotent retry vs real concurrent edit conflict', async () => {
  setupMockBrowserEnv();
  const validGas = 'https://script.google.com/macros/s/AKfycbx1234567890_test/exec';
  setGasUrl(validGas);
  const state = resetToDemoData();

  const target = makeExpense({ id: 'exp_idem_1', rev: 2, amount: 650000, title: 'Vé cáp treo' });
  state.expenses = [target];
  saveAppState(state);

  // User edits target (baseRev = 2)
  const edited = makeExpense({
    ...target,
    amount: 700000,
    title: 'Vé cáp treo Bà Nà',
    updatedAt: '2026-10-16 20:00:00',
  });
  enqueueExpenseUpsert(edited, 2);

  // Case A: Server ALREADY committed this exact edit (rev = 3) before network timeout,
  // so on retry GAS returns CONFLICT with serverRecord having rev = 3 and identical payload.
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: false,
      error: 'CONFLICT',
      serverRecord: {
        ...edited,
        rev: 3,
        syncStatus: 'synced',
      },
    }),
  })) as any;

  let conflictTriggered = false;
  const resIdem = await processSyncQueue(
    state,
    () => {},
    () => {
      conflictTriggered = true;
    }
  );

  assert.equal(conflictTriggered, false, 'Idempotent retry must NOT trigger false conflict');
  assert.equal(resIdem.syncedCount, 1);
  assert.equal(resIdem.conflictCount, 0);
  assert.equal(loadSyncQueue().length, 0, 'Queue should be empty after idempotent retry');

  // Case B: Another device genuinely edited the same record to a DIFFERENT amount (850000, rev = 3)
  const clientAttempt2 = makeExpense({
    ...edited,
    rev: 3,
    amount: 750000,
    title: 'Vé cáp treo (Client B)',
  });
  enqueueExpenseUpsert(clientAttempt2, 3);

  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: false,
      error: 'CONFLICT',
      serverRecord: {
        ...edited,
        rev: 4,
        amount: 900000,
        title: 'Vé cáp treo (Server Device A)',
      },
    }),
  })) as any;

  let detectedServerAmt = 0;
  const resConflict = await processSyncQueue(
    loadAppState(),
    () => {},
    (_item, srv) => {
      conflictTriggered = true;
      detectedServerAmt = srv.amount;
    }
  );

  assert.equal(conflictTriggered, true, 'Genuine concurrent edit must trigger conflict');
  assert.equal(resConflict.conflictCount, 1);
  assert.equal(detectedServerAmt, 900000);
});

test('Phase 2 [Scenario 2 & Offline Create-Then-Delete]: Offline create then delete before sync removes queue item cleanly', () => {
  setupMockBrowserEnv();
  resetToDemoData();

  const freshOffline = makeExpense({ id: 'exp_offline_temp', rev: 1, title: 'Nhầm lẫn' });
  // Created offline -> baseRev = 0
  const q1 = enqueueExpenseUpsert(freshOffline, 0);
  assert.equal(q1.length, 1);
  assert.equal(q1[0].baseRev, 0);

  // Edited offline -> baseRev stays 0
  const editedOffline = { ...freshOffline, amount: 300000 };
  const q2 = enqueueExpenseUpsert(editedOffline, 1);
  assert.equal(q2.length, 1);
  assert.equal(q2[0].baseRev, 0, 'baseRev must remain 0 for offline-created record');

  // Deleted offline before ever syncing -> removed from queue
  const deletedOffline = { ...editedOffline, deleted: true };
  const q3 = enqueueExpenseUpsert(deletedOffline, 1);
  assert.equal(q3.length, 0, 'Offline-created record deleted before sync should be pruned from queue');
});

test('Phase 2 [Scenario 3]: Batch sync of 100 pending items in queue', async () => {
  setupMockBrowserEnv();
  const validGas = 'https://script.google.com/macros/s/AKfycbx_batch_100/exec';
  setGasUrl(validGas);
  const state = resetToDemoData();
  state.expenses = [];
  saveAppState(state);

  for (let i = 1; i <= 100; i++) {
    enqueueExpenseUpsert(
      makeExpense({
        id: `exp_batch_${i}`,
        title: `Khoản chi hàng đợi #${i}`,
        amount: i * 10000,
      }),
      0
    );
  }

  assert.equal(loadSyncQueue().length, 100);

  let batchCallCount = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body || '{}'));
    if (body.action === 'batchUpsertExpenses') {
      batchCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          serverTime: '2026-10-18 12:00:00',
          results: body.items.map((it: any) => ({
            queueId: it.queueId,
            recordId: it.record.id,
            result: {
              ok: true,
              id: it.record.id,
              rev: 1,
              createdAt: '2026-10-18 12:00:00',
              updatedAt: '2026-10-18 12:00:00',
            },
          })),
        }),
      };
    }
    throw new Error('Unexpected action');
  }) as any;

  const outcome = await processSyncQueue(
    state,
    () => {},
    () => {}
  );

  assert.equal(batchCallCount, 1, '100 items must sync in 1 single batch HTTP POST');
  assert.equal(outcome.syncedCount, 100);
  assert.equal(outcome.errorCount, 0);
  assert.equal(loadSyncQueue().length, 0);
  assert.equal(loadAppState().expenses.length, 100);
});

test('Phase 2 [Scenario 6 & 10]: In-flight queue mutation race condition protection', async () => {
  setupMockBrowserEnv();
  const validGas = 'https://script.google.com/macros/s/AKfycbx_inflight_race/exec';
  setGasUrl(validGas);
  const state = resetToDemoData();
  const recA = makeExpense({ id: 'exp_race_A', rev: 1, amount: 200000, title: 'Bữa trưa v1' });
  state.expenses = [recA];
  saveAppState(state);

  // User edits recA to v2 (baseRev = 1)
  const recAv2 = makeExpense({
    ...recA,
    amount: 250000,
    title: 'Bữa trưa v2',
    updatedAt: '2026-10-16 12:01:00',
  });
  enqueueExpenseUpsert(recAv2, 1);

  // While recAv2 is in-flight to GAS, user edits recA AGAIN to v3 AND adds a brand new recB!
  globalThis.fetch = (async () => {
    const recAv3 = makeExpense({
      ...recA,
      amount: 350000,
      title: 'Bữa trưa v3 (sửa lúc đang sync)',
      updatedAt: '2026-10-16 12:02:00',
    });
    enqueueExpenseUpsert(recAv3, 1);

    const recB = makeExpense({
      id: 'exp_race_B',
      rev: 1,
      amount: 120000,
      title: 'Cà phê mới thêm lúc đang sync',
      updatedAt: '2026-10-16 12:02:05',
    });
    const curState = loadAppState();
    curState.expenses = [recB, recAv3];
    saveAppState(curState);
    enqueueExpenseUpsert(recB, 0);

    // Server returns success for v2 (rev becomes 2)
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        id: 'exp_race_A',
        rev: 2,
        createdAt: recA.createdAt,
        updatedAt: '2026-10-16 12:01:05',
      }),
    };
  }) as any;

  await processSyncQueue(
    state,
    () => {},
    () => {}
  );

  const remainingQueue = loadSyncQueue();
  assert.equal(
    remainingQueue.length,
    2,
    'Both the mid-sync edit (v3) and new item (recB) must be preserved in syncQueue!'
  );
  const queuedA = remainingQueue.find((q) => q.record.id === 'exp_race_A');
  const queuedB = remainingQueue.find((q) => q.record.id === 'exp_race_B');
  assert.ok(queuedA, 'Edited record A v3 must remain in queue');
  assert.equal(queuedA.record.amount, 350000);
  assert.equal(queuedA.baseRev, 2, 'baseRev of v3 must be upgraded to the newly committed rev 2');
  assert.ok(queuedB, 'Newly added record B must remain in queue');
});

test('Phase 2 [Scenario 8 & 9]: Manual Sheet duplicate IDs & pruneSatisfiedQueueItems', () => {
  setupMockBrowserEnv();
  const dupLowRev = makeExpense({ id: 'exp_dup', rev: 1, amount: 100000, title: 'Bản cũ' });
  const dupHighRev = makeExpense({ id: 'exp_dup', rev: 3, amount: 250000, title: 'Bản mới trên Sheet' });
  const localPending = makeExpense({ id: 'exp_local', rev: 1, amount: 90000, title: 'Bản Offline' });

  const queue: SyncQueueItem[] = [
    {
      queueId: 'q_satisfied',
      action: 'UPSERT_EXPENSE',
      record: dupHighRev,
      baseRev: 2,
      status: 'pending',
      retryCount: 1,
    },
    {
      queueId: 'q_unsynced',
      action: 'UPSERT_EXPENSE',
      record: localPending,
      baseRev: 0,
      status: 'pending',
      retryCount: 0,
    },
  ];

  const pruned = pruneSatisfiedQueueItems([dupLowRev, dupHighRev], queue);
  assert.equal(pruned.length, 1, 'Already-committed queue item must be pruned');
  assert.equal(pruned[0].record.id, 'exp_local');

  const merged = mergeRemoteAndLocalExpenses([dupLowRev, dupHighRev], pruned);
  assert.equal(merged.length, 2, 'Duplicate IDs from manual Sheet edits must be deduplicated');
  assert.equal(merged.find((e) => e.id === 'exp_dup')?.amount, 250000);
  assert.equal(merged.find((e) => e.id === 'exp_local')?.syncStatus, 'pending');
});

test('Phase 6 [Security]: Admin PIN offline bypass prevention when connected to Google Sheet', async () => {
  setupMockBrowserEnv();
  // 1. In pure Local Demo mode (no GAS URL), default demo PIN '1234' works even offline
  setGasUrl('');
  setSimulateOffline(true);
  const demoRes = await verifyAdminPin('1234');
  assert.equal(demoRes.ok, true, 'Demo mode allows 1234');

  // 2. When connected to a Google Sheet, toggling Offline or SimulateOffline MUST NOT allow '1234' bypass!
  setGasUrl('https://script.google.com/macros/s/AKfycbx_prod_sheet/exec');
  setSimulateOffline(true);
  const bypassAttempt = await verifyAdminPin('1234');
  assert.equal(
    bypassAttempt.ok,
    false,
    'Connected Google Sheet MUST reject offline PIN verification to prevent local 1234 bypass'
  );
  const changePinAttempt = await changeAdminPin('1234', '9999', 'attacker');
  assert.equal(changePinAttempt.ok, false);

  // 3. URL validation blocks malicious/SSRF URLs
  assert.equal(isValidGasExecUrl('https://script.google.com/macros/s/AKfycb123/exec'), true);
  assert.equal(isValidGasExecUrl('http://script.google.com/macros/s/AKfycb123/exec'), false);
  assert.equal(isValidGasExecUrl('https://evil.example.com/macros/s/AKfycb123/exec'), false);
  assert.equal(isValidGasExecUrl('javascript:alert(1)'), false);
});

test('Phase 5 [Scalability Benchmark]: 100, 500, 1000, and 5000 expenses performance', () => {
  const sizes = [100, 500, 1000, 5000];
  const memberIds = DEFAULT_MEMBERS.map((m) => m.id);
  const catIds = DEFAULT_CATEGORIES.map((c) => c.id);

  for (const N of sizes) {
    const dataset: ExpenseRecord[] = [];
    for (let i = 0; i < N; i++) {
      const payer = memberIds[i % memberIds.length];
      const amount = ((i % 20) + 1) * 50000;
      const share = amount / 5;
      dataset.push({
        id: `exp_scale_${i}`,
        rev: 1,
        type: i % 15 === 0 ? 'transfer' : 'expense',
        title: `Khoản chi thử nghiệm hiệu năng số #${i} tại Đà Lạt`,
        amount,
        payer,
        splits:
          i % 15 === 0
            ? { [memberIds[(i + 1) % memberIds.length]]: amount }
            : {
                mem_duy: share,
                mem_duong: share,
                mem_duc: share,
                mem_lan: share,
                mem_minh: share,
              },
        splitMode: 'equal',
        categoryId: catIds[i % catIds.length],
        spentAt: `2026-10-${String(16 + (i % 4)).padStart(2, '0')} 14:20`,
        createdBy: payer,
        createdAt: '2026-10-16 14:20:00',
        updatedBy: payer,
        updatedAt: '2026-10-16 14:20:00',
        deleted: i % 25 === 0,
        note: i % 3 === 0 ? 'Ghi chú kiểm thử tìm kiếm tiếng Việt không dấu' : '',
        syncStatus: 'synced',
      });
    }

    const t0 = performance.now();
    const balances = calculateBalances(DEFAULT_MEMBERS, dataset);
    const simplified = simplifyDebts(balances);
    const pairwise = calculatePairwiseDebts(DEFAULT_MEMBERS, dataset);
    const tMath = performance.now() - t0;

    const t1 = performance.now();
    const qNorm = normalizeSearchText('da lat');
    const matched = dataset.filter(
      (e) => !e.deleted && normalizeSearchText(e.title).includes(qNorm)
    );
    const tSearch = performance.now() - t1;

    const t2 = performance.now();
    const report = buildExpenseReportData({
      config: DEFAULT_TRIP_CONFIG,
      members: DEFAULT_MEMBERS,
      categories: DEFAULT_CATEGORIES,
      expenses: dataset,
      filterMemberId: 'all',
    });
    const tReport = performance.now() - t2;

    assert.equal(balances.reduce((acc, b) => acc + b.balance, 0), 0);
    assert.ok(simplified.length <= DEFAULT_MEMBERS.length);
    assert.ok(pairwise.length >= 0);
    assert.ok(matched.length > 0);
    assert.ok(report.rows.length > 0);
    assert.ok(tMath < 150, `Math for ${N} items took ${tMath.toFixed(2)}ms (<150ms required)`);
    assert.ok(isEquivalentExpensePayload(dataset[0], dataset[0]));
  }
});

test('Round 3 [Item 1 & 2]: No deviceToken or creatorToken in expense records or sync payloads', async () => {
  setupMockBrowserEnv();
  const validGas = 'https://script.google.com/macros/s/AKfycbx_no_token/exec';
  setGasUrl(validGas);
  const state = resetToDemoData();
  saveAppState(state);

  const rec = makeExpense({
    id: 'exp_clean_member_model',
    createdBy: 'mem_duy',
    payer: 'mem_duy',
    updatedBy: 'mem_duy',
  });
  const q = enqueueExpenseUpsert(rec, 0);
  assert.equal(q.length, 1);
  assert.equal(
    (q[0].record.splitMeta as any)?.creatorToken,
    undefined,
    'creatorToken must not be injected into splitMeta'
  );

  let capturedBody: any = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(String(init.body || '{}'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        id: rec.id,
        rev: 1,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      }),
    };
  }) as any;

  await processSyncQueue(
    state,
    () => {},
    () => {}
  );
  assert.ok(capturedBody, 'Sync request body captured');
  assert.equal(capturedBody.deviceToken, undefined, 'deviceToken must not be sent in sync payload');
});

test('Round 3 [Item 6]: Admin Trip Lock blocks new sync writes and preserves pending queue without data loss', async () => {
  setupMockBrowserEnv();
  const validGas = 'https://script.google.com/macros/s/AKfycbx_trip_lock/exec';
  setGasUrl(validGas);
  const state = resetToDemoData();

  // Enqueue 2 offline changes while trip is active
  const offlineRec1 = makeExpense({ id: 'exp_locked_1', title: 'Khoản offline 1', amount: 150000 });
  const offlineRec2 = makeExpense({ id: 'exp_locked_2', title: 'Khoản offline 2', amount: 250000 });
  state.expenses = [offlineRec1, offlineRec2];
  saveAppState(state);
  enqueueExpenseUpsert(offlineRec1, 0);
  enqueueExpenseUpsert(offlineRec2, 0);

  // Case A: Local state already knows tripStatus === 'completed'
  state.config.tripStatus = 'completed';
  saveAppState(state);

  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error('Should not call fetch when local tripStatus is completed');
  }) as any;

  const resLockedLocal = await processSyncQueue(
    state,
    () => {},
    () => {}
  );
  assert.equal(fetchCalled, false, 'Must not send HTTP writes when trip is already locked locally');
  assert.equal(resLockedLocal.syncedCount, 0);
  assert.equal(resLockedLocal.errorCount, 2);

  const preservedQueueA = loadSyncQueue();
  assert.equal(preservedQueueA.length, 2, 'Pending queue items MUST NOT be deleted when trip is locked');
  assert.equal(preservedQueueA[0].status, 'error');
  assert.ok(preservedQueueA[0].errorMessage?.includes('khóa'));

  // Case B: Long-offline device still has local tripStatus === 'active', reconnects, and GAS returns TRIP_COMPLETED
  state.config.tripStatus = 'active';
  saveAppState(state);
  saveSyncQueue(preservedQueueA.map((item) => ({ ...item, status: 'pending' })));

  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: false,
      error: 'TRIP_COMPLETED',
      message: 'Chuyến đi đã khóa sổ quyết toán. Không thể ghi thêm hoặc chỉnh sửa khoản chi.',
    }),
  })) as any;

  const resLockedRemote = await processSyncQueue(
    state,
    () => {},
    () => {}
  );
  assert.equal(resLockedRemote.syncedCount, 0);
  assert.equal(resLockedRemote.errorCount, 2);
  const preservedQueueB = loadSyncQueue();
  assert.equal(
    preservedQueueB.length,
    2,
    'Long-offline device queue items MUST be preserved when server rejects with TRIP_COMPLETED'
  );
  assert.equal(preservedQueueB[0].status, 'error');
  assert.equal(preservedQueueB[1].status, 'error');
});

test('Round 3 [Item 5]: Bank accountNo leading-zero string preservation & settlement exactness invariants', () => {
  const rawMembers = [
    {
      id: 'm_lead_zero',
      name: 'Duy',
      avatarColor: '#000777',
      defaultWeight: 1,
      bankName: '',
      accountNo: " '0011 0045 67890 ",
      accountHolder: 'NGUYEN QUOC DUY',
      active: true,
    },
    {
      id: 'm_bank_with_zero',
      name: 'Lan',
      avatarColor: '#be123c',
      defaultWeight: 1,
      bankName: 'Vietcombank',
      accountNo: '0071000888999',
      accountHolder: '',
      active: true,
    },
  ];

  const normalized = normalizeMembersList(rawMembers);
  assert.equal(typeof normalized[0].accountNo, 'string');
  assert.equal(
    normalized[0].accountNo,
    '0011004567890',
    'Leading zeros must be preserved and spaces/leading apostrophes stripped'
  );
  assert.equal(
    formatMemberBankInfo(normalized[0]),
    'STK: 0011004567890',
    'STK must be displayed even when bankName is empty'
  );
  assert.equal(
    formatMemberBankInfo(normalized[1]),
    'Vietcombank • 0071000888999',
    'Bank name and leading-zero STK formatted cleanly'
  );

  // Verify totalReceive === totalPay and no 0đ/negative transfers across prime/odd splits
  const oddExpenses: ExpenseRecord[] = [
    makeExpense({
      id: 'exp_odd_1',
      amount: 100001,
      payer: 'mem_duy',
      splits: { mem_duy: 33334, mem_lan: 33334, mem_minh: 33333 },
    }),
    makeExpense({
      id: 'exp_odd_2',
      amount: 77777,
      payer: 'mem_lan',
      splits: { mem_duy: 19445, mem_lan: 19444, mem_minh: 19444, mem_ha: 19444 },
    }),
  ];

  const balances = calculateBalances(DEFAULT_MEMBERS, oddExpenses);
  const totalReceive = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const totalPay = balances.filter((b) => b.balance < 0).reduce((s, b) => s + Math.abs(b.balance), 0);
  assert.equal(totalReceive, totalPay, 'totalReceive must strictly equal totalPay to the single VND');

  const transfers = simplifyDebts(balances);
  const sumTransfers = transfers.reduce((s, t) => s + t.amount, 0);
  assert.equal(sumTransfers, totalReceive, 'Sum of simplified transfers must equal totalReceive');
  for (const t of transfers) {
    assert.ok(t.amount > 0, 'Transfer amount must be strictly positive (> 0 VND)');
    assert.equal(Number.isInteger(t.amount), true, 'Transfer amount must be an integer');
  }
});

test('Final Review [Section 2]: Expense ownership strictly distinguishes createdBy from payer', () => {
  // Record created by Duy (mem_duy), but Lan (mem_lan) paid the bill
  const recCreatedByDuyPaidByLan = makeExpense({
    id: 'exp_duy_creator_lan_payer',
    createdBy: 'mem_duy',
    payer: 'mem_lan',
    amount: 450000,
  });

  assert.equal(
    getExpenseOwnerId(recCreatedByDuyPaidByLan),
    'mem_duy',
    'Owner must be createdBy (mem_duy), NOT payer (mem_lan)'
  );
  assert.equal(
    canMemberModifyExpense(recCreatedByDuyPaidByLan, 'mem_duy', DEFAULT_MEMBERS, false, 'active'),
    true,
    'Creator (mem_duy) can modify their own record'
  );
  assert.equal(
    canMemberModifyExpense(recCreatedByDuyPaidByLan, 'mem_lan', DEFAULT_MEMBERS, false, 'active'),
    false,
    'Payer (mem_lan) is NOT automatically treated as owner when createdBy is mem_duy'
  );
  assert.equal(
    canMemberModifyExpense(recCreatedByDuyPaidByLan, 'mem_lan', DEFAULT_MEMBERS, true, 'active'),
    true,
    'Admin can modify any record while tripStatus === active'
  );
  assert.equal(
    canMemberModifyExpense(recCreatedByDuyPaidByLan, 'mem_duy', DEFAULT_MEMBERS, true, 'completed'),
    false,
    'Nobody (not even Admin or creator) can modify records when tripStatus === completed'
  );

  // Quick-switch owner resolution must resolve to Duy (createdBy), not Lan (payer)
  const resolvedOwner = resolveExpenseOwnerMember(recCreatedByDuyPaidByLan, DEFAULT_MEMBERS);
  assert.ok(resolvedOwner);
  assert.equal(resolvedOwner.id, 'mem_duy');

  // Legacy fallback: only when createdBy is empty/blank does ownership fall back to payer
  const legacyRecWithoutCreatedBy = makeExpense({
    id: 'exp_legacy_empty_creator',
    createdBy: '   ',
    payer: 'mem_lan',
  });
  assert.equal(getExpenseOwnerId(legacyRecWithoutCreatedBy), 'mem_lan');
  assert.equal(
    canMemberModifyExpense(legacyRecWithoutCreatedBy, 'mem_lan', DEFAULT_MEMBERS, false, 'active'),
    true
  );
});

test('Final Review [Section 3 & 5]: 8-step TRIP_COMPLETED lock safety, nonRetryable guard, and operationId idempotency', async () => {
  setupMockBrowserEnv();
  const state = resetToDemoData();
  const validUrl = 'https://script.google.com/macros/s/AKfycbz_final_review_test/exec';
  setGasUrl(validUrl);
  state.config.tripStatus = 'active';
  saveAppState(state);

  // Step 1: Device A is offline and creates 2 expenses -> saved locally and queued in syncQueue
  const offlineRec1 = makeExpense({
    id: 'exp_final_lock_1',
    title: 'An sang Da Lat',
    amount: 180000,
    createdBy: 'mem_duy',
    payer: 'mem_duy',
    rev: 1,
    syncStatus: 'pending',
  });
  const offlineRec2 = makeExpense({
    id: 'exp_final_lock_2',
    title: 'Ca phe Tung',
    amount: 120000,
    createdBy: 'mem_duy',
    payer: 'mem_duy',
    rev: 1,
    syncStatus: 'pending',
  });

  state.expenses.unshift(offlineRec1, offlineRec2);
  saveAppState(state);
  enqueueExpenseUpsert(offlineRec1, 0);
  enqueueExpenseUpsert(offlineRec2, 0);

  const initialQueue = loadSyncQueue();
  assert.equal(initialQueue.length, 2);
  assert.ok(initialQueue[0].operationId, 'Queue item must have a stable operationId');
  assert.equal(
    initialQueue[0].record.splitMeta?.lastOperationId,
    initialQueue[0].operationId,
    'Record splitMeta.lastOperationId must match queue operationId'
  );

  // Verify operationId idempotency even if timestamps/rev differ on server after timeout
  const serverEchoAfterTimeout = makeExpense({
    ...offlineRec1,
    rev: 2,
    updatedAt: '2026-12-31T23:59:59.000Z',
    splitMeta: { lastOperationId: initialQueue[0].operationId },
  });
  assert.equal(
    isEquivalentExpensePayload(initialQueue[0].record, serverEchoAfterTimeout),
    true,
    'operationId match must deterministically confirm idempotency after timeout retry'
  );

  // Steps 2, 3, 4: Admin on Device B locks trip (completed). Device A reconnects and GAS returns TRIP_COMPLETED.
  let httpCalls = 0;
  (globalThis as unknown as { fetch: typeof fetch }).fetch = async () => {
    httpCalls += 1;
    return {
      ok: true,
      json: async () => ({
        ok: false,
        error: 'TRIP_COMPLETED',
      }),
    } as Response;
  };

  let latestState = loadAppState();
  const syncResult = await processSyncQueue(
    latestState,
    (next) => {
      latestState = next;
    },
    () => {}
  );

  // Step 5, 6, 7, 8 verification:
  assert.equal(httpCalls, 1, 'Should make 1 batch call and stop immediately on TRIP_COMPLETED');
  assert.equal(syncResult.syncedCount, 0, 'Must NOT report any synced items when server rejected with TRIP_COMPLETED');
  assert.equal(syncResult.errorCount, 2, 'Both queued items must be marked as error');
  assert.equal(syncResult.tripLocked, true, 'syncResult must explicitly flag tripLocked = true');
  assert.equal(
    latestState.config.tripStatus,
    'completed',
    'Client state must transition to completed and never overwrite server lock'
  );

  const queueAfterLock = loadSyncQueue();
  assert.equal(queueAfterLock.length, 2, 'syncQueue must be 100% preserved (never silently deleted)');
  for (const item of queueAfterLock) {
    assert.equal(item.status, 'error');
    assert.equal(item.errorCode, 'TRIP_COMPLETED');
    assert.equal(item.nonRetryable, true, 'TRIP_COMPLETED must be marked nonRetryable to prevent infinite retry loops');
    assert.equal(isNonRetryableSyncError(item.errorCode), true);
  }

  // Local expenses must still exist with syncStatus === 'error' so user can inspect them
  const local1 = latestState.expenses.find((e) => e.id === 'exp_final_lock_1');
  const local2 = latestState.expenses.find((e) => e.id === 'exp_final_lock_2');
  assert.ok(local1 && local2, 'Local expense records must be preserved');
  assert.equal(local1.syncStatus, 'error');
  assert.equal(local2.syncStatus, 'error');

  // Subsequent processSyncQueue calls while tripStatus === 'completed' must NOT send network writes
  await processSyncQueue(
    latestState,
    (next) => {
      latestState = next;
    },
    () => {}
  );
  assert.equal(httpCalls, 1, 'No further network write requests should be sent once trip is completed');
});


