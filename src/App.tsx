import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cloud,
  CloudOff,
  RefreshCw,
  Share2,
  User,
} from 'lucide-react';
import { ConflictModal } from './components/ConflictModal';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ExpensesTab } from './components/ExpensesTab';
import { MemberAvatar } from './components/MemberAvatar';
import { type ActiveTab, Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { SettingsTab } from './components/SettingsTab';
import { SettlementTab } from './components/SettlementTab';
import { WhoAmIModal } from './components/WhoAmIModal';
import {
  changeAdminPin,
  enqueueExpenseUpsert,
  fetchAllFromGas,
  buildShareableTripUrl,
  getCurrentUserId,
  getGasUrl,
  getSimulateOffline,
  initializeSheetWithCurrentData,
  loadAppState,
  loadSyncQueue,
  processSyncQueue,
  resetToDemoData,
  saveAppState,
  saveSyncQueue,
  setCurrentUserId,
  setGasUrl,
  setSimulateOffline,
  syncAdminSettings,
  verifyAdminPin,
} from './services/syncService';
import type {
  AppStateData,
  Category,
  ExpenseRecord,
  Member,
  SyncQueueItem,
  TripConfig,
} from './types';
import {
  formatDateRangeVN,
  generateUUID,
  getNowGMT7,
  getTripDurationShort,
  copyToClipboard,
} from './utils/format';
import { calculateBalances } from './utils/math';

export default function App() {
  const [appState, setAppState] = useState<AppStateData>(() => loadAppState());
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() => loadSyncQueue());
  const [currentUserId, setCurrentUserState] = useState<string | null>(() => {
    const saved = getCurrentUserId();
    if (saved) return saved;
    if (typeof window !== 'undefined' && window.location.search.includes('autostart=1')) {
      setCurrentUserId('mem_duy');
      return 'mem_duy';
    }
    return null;
  });

  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'overview' || t === 'expenses' || t === 'settlement' || t === 'settings') {
        return t;
      }
    }
    return 'overview';
  });

  const setActiveTab = useCallback((nextTab: ActiveTab) => {
    setActiveTabState(nextTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (nextTab === 'overview') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', nextTab);
      }
      window.history.replaceState({}, '', url.toString());
    }
  }, []);
  const [isWhoAmIOpen, setIsWhoAmIOpen] = useState<boolean>(() => !currentUserId);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null);

  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminPin, setAdminPin] = useState<string>('');

  const [gasUrl, setGasUrlState] = useState<string>(() => getGasUrl());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [simulateOffline, setSimulateOfflineState] = useState<boolean>(() =>
    getSimulateOffline()
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [activeConflict, setActiveConflict] = useState<{
    item: SyncQueueItem;
    serverRecord: ExpenseRecord;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2800);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const currentMember = useMemo(
    () =>
      appState.members.find((m) => m.id === currentUserId) ||
      appState.members[0] ||
      null,
    [appState.members, currentUserId]
  );

  // Tự động đồng bộ currentUserId nếu danh sách thành viên từ Sheet có bộ ID mới (ví dụ m1..m5 thay vì mem_duy)
  useEffect(() => {
    if (
      currentUserId &&
      appState.members.length > 0 &&
      !appState.members.some((m) => m.id === currentUserId)
    ) {
      const fallbackId = appState.members[0].id;
      setCurrentUserId(fallbackId);
      setCurrentUserState(fallbackId);
    }
  }, [appState.members, currentUserId]);

  const balances = useMemo(
    () => calculateBalances(appState.members, appState.expenses),
    [appState.members, appState.expenses]
  );

  const effectiveOnline = isOnline && !simulateOffline;

  const triggerQueueSync = useCallback(
    async (stateOverride?: AppStateData) => {
      if (!effectiveOnline) return;
      const currentQ = loadSyncQueue();
      if (currentQ.length === 0) return;

      setIsSyncing(true);
      try {
        await processSyncQueue(
          stateOverride || appState,
          (nextState, nextQueue) => {
            setAppState(nextState);
            setSyncQueue(nextQueue);
          },
          (conflictItem, serverRecord) => {
            setActiveConflict({ item: conflictItem, serverRecord });
          }
        );
      } finally {
        setIsSyncing(false);
      }
    },
    [appState, effectiveOnline]
  );

  const handleRefreshSync = useCallback(
    async (silent = false) => {
      if (!effectiveOnline) {
        if (!silent) showToast('Đang Offline — Dữ liệu lưu trên máy');
        return;
      }

      setIsSyncing(true);
      try {
        await triggerQueueSync();
        if (gasUrl) {
          const res = await fetchAllFromGas(gasUrl);
          if (res.ok && res.data) {
            setAppState((prev) => {
              const merged: AppStateData = {
                ...prev,
                config: res.data?.config || prev.config,
                members: res.data?.members || prev.members,
                categories: res.data?.categories || prev.categories,
                expenses: res.data?.expenses || prev.expenses,
                lastSyncedAt: res.data?.lastSyncedAt || getNowGMT7(false),
              };
              saveAppState(merged);
              return merged;
            });
            if (!silent) showToast('Đã đồng bộ Google Sheet');
          } else if (res.error && !silent) {
            showToast(`Lỗi Sheet: ${res.error}`);
          }
        } else if (!silent) {
          setAppState((prev) => {
            const updated = { ...prev, lastSyncedAt: getNowGMT7(false) };
            saveAppState(updated);
            return updated;
          });
          showToast('Đã làm mới dữ liệu trên máy');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [effectiveOnline, triggerQueueSync, gasUrl, showToast]
  );

  // Tự động đồng bộ dữ liệu từ Google Sheet ngay khi mở ứng dụng (nếu đã có GAS URL)
  useEffect(() => {
    if (effectiveOnline && gasUrl) {
      handleRefreshSync(true);
    }
  }, [effectiveOnline, gasUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      triggerQueueSync();
    };
    const onOffline = () => setIsOnline(false);
    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        if (gasUrl) {
          handleRefreshSync(true);
        } else {
          triggerQueueSync();
        }
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [triggerQueueSync, gasUrl, handleRefreshSync]);

  useEffect(() => {
    if (!effectiveOnline || syncQueue.length === 0 || isSyncing) return;
    const actionable = syncQueue.filter((q) => q.status === 'pending' || q.status === 'error');
    if (actionable.length === 0) return;

    const maxRetry = Math.max(0, ...actionable.map((q) => q.retryCount || 0));
    const delayMs = Math.min(25000, 1200 * Math.pow(2, maxRetry));
    const timer = setTimeout(() => {
      triggerQueueSync();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [effectiveOnline, syncQueue, isSyncing, triggerQueueSync]);

  const handleSelectMember = (memberId: string) => {
    setCurrentUserId(memberId);
    setCurrentUserState(memberId);
    setIsWhoAmIOpen(false);
    const found = appState.members.find((m) => m.id === memberId);
    if (found) {
      showToast(`Đã chọn: ${found.name}`);
    }
  };

  const handleSaveExpenseRecord = async (record: ExpenseRecord, baseRev: number) => {
    if (appState.config.tripStatus === 'completed') {
      showToast('Chuyến đi đã khóa sổ!');
      return;
    }

    const recordWithPending: ExpenseRecord = {
      ...record,
      syncStatus: 'pending',
    };

    const existingIdx = appState.expenses.findIndex((e) => e.id === record.id);
    const nextExpenses = [...appState.expenses];
    if (existingIdx >= 0) {
      nextExpenses[existingIdx] = recordWithPending;
    } else {
      nextExpenses.unshift(recordWithPending);
    }

    const nextState: AppStateData = {
      ...appState,
      expenses: nextExpenses,
    };

    saveAppState(nextState);
    setAppState(nextState);

    const nextQueue = enqueueExpenseUpsert(
      recordWithPending,
      baseRev,
      isAdmin ? adminPin : undefined
    );
    setSyncQueue(nextQueue);
    setIsExpenseModalOpen(false);
    setEditingRecord(null);

    if (effectiveOnline) {
      await triggerQueueSync(nextState);
      showToast(baseRev === 0 ? `Đã thêm "${record.title}"` : `Đã sửa "${record.title}"`);
    } else {
      showToast('Đã lưu vào hàng đợi Offline');
    }
  };

  const handleSoftDeleteExpense = async (record: ExpenseRecord) => {
    if (appState.config.tripStatus === 'completed') return;
    const actor = currentUserId || record.payer;
    const canModify =
      isAdmin || record.createdBy === actor || record.payer === actor;
    if (!canModify) {
      showToast('Chỉ người tạo, người chi hoặc Admin được xóa.');
      return;
    }

    const softDeleted: ExpenseRecord = {
      ...record,
      deleted: true,
      updatedBy: actor,
      updatedAt: getNowGMT7(true),
      syncStatus: 'pending',
    };

    await handleSaveExpenseRecord(softDeleted, record.rev);
    showToast(`Đã xóa "${record.title}"`);
  };

  const handleAcceptServerVersion = (
    conflictItem: SyncQueueItem,
    serverRecord: ExpenseRecord
  ) => {
    const nextQueue = syncQueue.filter((q) => q.queueId !== conflictItem.queueId);
    saveSyncQueue(nextQueue);
    setSyncQueue(nextQueue);

    const nextExpenses = appState.expenses.map((e) =>
      e.id === serverRecord.id ? { ...serverRecord, syncStatus: 'synced' as const } : e
    );
    const nextState = { ...appState, expenses: nextExpenses };
    saveAppState(nextState);
    setAppState(nextState);
    setActiveConflict(null);
    showToast(`Đã lấy bản trên Sheet (rev #${serverRecord.rev})`);
  };

  const handleForceKeepClientVersion = async (
    conflictItem: SyncQueueItem,
    serverRecord: ExpenseRecord
  ) => {
    const updatedQueueItem: SyncQueueItem = {
      ...conflictItem,
      baseRev: serverRecord.rev,
      status: 'pending',
      retryCount: 0,
      errorMessage: undefined,
    };
    const nextQueue = syncQueue.map((q) =>
      q.queueId === conflictItem.queueId ? updatedQueueItem : q
    );
    saveSyncQueue(nextQueue);
    setSyncQueue(nextQueue);
    setActiveConflict(null);
    await triggerQueueSync();
    showToast(`Đã cập nhật lên rev #${serverRecord.rev + 1}`);
  };

  const handleTriggerDemoConflict = () => {
    const target = appState.expenses.find((e) => !e.deleted && e.type === 'expense');
    if (!target) {
      showToast('Cần ít nhất 1 khoản chi để test xung đột.');
      return;
    }

    const simulatedServerRecord: ExpenseRecord = {
      ...target,
      rev: target.rev + 1,
      amount: target.amount + 50000,
      title: `${target.title} (Bản Sheet)`,
      updatedBy: 'mem_lan',
      updatedAt: getNowGMT7(true),
      syncStatus: 'synced',
    };

    const clientAttempt: ExpenseRecord = {
      ...target,
      amount: target.amount + 20000,
      title: `${target.title} (Bản của bạn)`,
      updatedBy: currentUserId || 'mem_duy',
      updatedAt: getNowGMT7(true),
      syncStatus: 'conflict',
    };

    const conflictItem: SyncQueueItem = {
      queueId: generateUUID(),
      action: 'UPSERT_EXPENSE',
      record: clientAttempt,
      baseRev: target.rev,
      status: 'conflict',
      retryCount: 1,
      serverRecord: simulatedServerRecord,
      errorMessage: 'Xung đột rev',
    };

    const nextQueue = [...syncQueue.filter((q) => q.record.id !== target.id), conflictItem];
    saveSyncQueue(nextQueue);
    setSyncQueue(nextQueue);
    setActiveConflict({ item: conflictItem, serverRecord: simulatedServerRecord });
  };

  const headerDurationShort = useMemo(
    () => getTripDurationShort(appState.config.startDate, appState.config.endDate),
    [appState.config.startDate, appState.config.endDate]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-sm focus:bg-brand focus:text-white focus:text-xs focus:font-bold"
      >
        Chuyển đến nội dung chính
      </a>

      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-13 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate text-balance">
                {appState.config.tripName}
                {headerDurationShort &&
                !appState.config.tripName.toUpperCase().includes(headerDurationShort)
                  ? ` ${headerDurationShort}`
                  : ''}
              </h1>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 truncate">
              <span>
                {formatDateRangeVN(appState.config.startDate, appState.config.endDate)}
              </span>
              {!effectiveOnline && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-800 font-semibold">
                    <CloudOff aria-hidden="true" className="w-3 h-3 shrink-0" />
                    Offline
                  </span>
                </>
              )}
              {effectiveOnline && gasUrl && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-0.5 text-brand font-medium">
                    <Cloud aria-hidden="true" className="w-3 h-3 shrink-0" />
                    {appState.lastSyncedAt?.slice(11, 16) || 'Đã lưu'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleRefreshSync(false)}
              disabled={isSyncing}
              aria-label="Đồng bộ dữ liệu"
              title="Đồng bộ dữ liệu"
              className="w-9 h-9 rounded-sm hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
            >
              <RefreshCw
                aria-hidden="true"
                className={`w-4 h-4 ${isSyncing ? 'animate-spin text-brand' : ''}`}
              />
            </button>

            {gasUrl && (
              <button
                type="button"
                onClick={async () => {
                  const shareUrl = buildShareableTripUrl(gasUrl);
                  const ok = await copyToClipboard(shareUrl);
                  if (ok) showToast('Đã copy Link mời nhóm (kèm kết nối Sheet)!');
                }}
                aria-label="Chia sẻ link nhóm"
                title="Copy link mời nhóm (tự động kết nối Google Sheet)"
                className="w-9 h-9 rounded-sm hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-brand transition-colors"
              >
                <Share2 aria-hidden="true" className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsWhoAmIOpen(true)}
              aria-label="Đổi người dùng"
              title={currentMember ? `Đang chọn: ${currentMember.name}` : 'Chọn người dùng'}
              className="min-h-[38px] pl-2 pr-1 py-1 rounded-sm hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
            >
              {currentMember ? (
                <>
                  <span className="text-xs font-bold text-slate-900 max-w-[96px] truncate">
                    {currentMember.name}
                  </span>
                  <MemberAvatar member={currentMember} size="md" />
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-slate-700">Chọn tên</span>
                  <div
                    aria-hidden="true"
                    className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700"
                  >
                    <User aria-hidden="true" className="w-3.5 h-3.5" />
                  </div>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {appState.config.tripStatus === 'completed' && (
          <div className="p-3 rounded-md bg-slate-900 text-white flex items-center gap-2 text-xs">
            <Archive aria-hidden="true" className="w-4 h-4 text-blue-300 shrink-0" />
            <span>
              <strong>Chuyến đi đã kết thúc</strong> — Chế độ chỉ xem.
            </span>
          </div>
        )}

        {syncQueue.length > 0 && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
              <AlertTriangle aria-hidden="true" className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{syncQueue.length} khoản chờ đồng bộ</span>
            </div>

            <div className="flex items-center gap-1.5">
              {syncQueue.find((q) => q.status === 'conflict' && q.serverRecord) && (
                <button
                  type="button"
                  onClick={() => {
                    const c = syncQueue.find((q) => q.status === 'conflict' && q.serverRecord)!;
                    setActiveConflict({ item: c, serverRecord: c.serverRecord! });
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-sm bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
                >
                  Xử lý xung đột
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (simulateOffline) {
                    setSimulateOffline(false);
                    setSimulateOfflineState(false);
                  }
                  setTimeout(() => triggerQueueSync(), 50);
                }}
                disabled={isSyncing}
                className="min-h-[34px] px-3 py-1 rounded-sm bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors"
              >
                {isSyncing ? 'Đang gửi…' : 'Đồng bộ ngay'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewTab
            config={appState.config}
            members={appState.members}
            categories={appState.categories}
            expenses={appState.expenses}
            balances={balances}
            currentUserId={currentUserId}
            onNavigateTab={setActiveTab}
            onOpenAddModal={() => {
              setEditingRecord(null);
              setIsExpenseModalOpen(true);
            }}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesTab
            config={appState.config}
            members={appState.members}
            categories={appState.categories}
            expenses={appState.expenses}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onEditRecord={(rec) => {
              setEditingRecord(rec);
              setIsExpenseModalOpen(true);
            }}
            onSoftDeleteRecord={handleSoftDeleteExpense}
            onOpenAddModal={() => {
              setEditingRecord(null);
              setIsExpenseModalOpen(true);
            }}
          />
        )}

        {activeTab === 'settlement' && (
          <SettlementTab
            members={appState.members}
            expenses={appState.expenses}
            balances={balances}
            currentUserId={currentUserId}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            config={appState.config}
            members={appState.members}
            categories={appState.categories}
            expenses={appState.expenses}
            history={appState.history}
            isAdmin={isAdmin}
            adminPin={adminPin}
            gasUrl={gasUrl}
            simulateOffline={simulateOffline}
            onUnlockAdmin={async (pin) => {
              const res = await verifyAdminPin(pin);
              if (res.ok) {
                setIsAdmin(true);
                setAdminPin(pin.trim());
              }
              return res;
            }}
            onLockAdmin={() => {
              setIsAdmin(false);
              setAdminPin('');
              showToast('Đã khóa Admin');
            }}
            onChangeAdminPin={(oldPin, newPin) =>
              changeAdminPin(oldPin, newPin, currentUserId || 'admin')
            }
            onUpdateMembers={async (nextMembers: Member[]) => {
              const nextState = { ...appState, members: nextMembers };
              saveAppState(nextState);
              setAppState(nextState);
              await syncAdminSettings(adminPin, currentUserId || 'admin', {
                members: nextMembers,
              });
            }}
            onUpdateCategories={async (nextCategories: Category[]) => {
              const nextState = { ...appState, categories: nextCategories };
              saveAppState(nextState);
              setAppState(nextState);
              await syncAdminSettings(adminPin, currentUserId || 'admin', {
                categories: nextCategories,
              });
            }}
            onUpdateConfig={async (nextConfig: TripConfig) => {
              const nextState = { ...appState, config: nextConfig };
              saveAppState(nextState);
              setAppState(nextState);
              await syncAdminSettings(adminPin, currentUserId || 'admin', {
                config: nextConfig,
              });
            }}
            onSaveGasUrl={(url) => {
              setGasUrl(url);
              setGasUrlState(url.trim());
            }}
            onTestAndInitSheet={async (url) => {
              const clean = url.trim();
              if (!clean) return;
              const check = await fetchAllFromGas(clean);
              if (check.ok && check.data) {
                if ((check.data.expenses || []).length === 0) {
                  const seeded = await initializeSheetWithCurrentData(
                    clean,
                    appState,
                    adminPin
                  );
                  if (seeded.ok) {
                    showToast('Đã khởi tạo Google Sheet!');
                  } else {
                    showToast(`Lỗi: ${seeded.error}`);
                  }
                } else {
                  const merged: AppStateData = {
                    ...appState,
                    config: check.data.config || appState.config,
                    members: check.data.members || appState.members,
                    categories: check.data.categories || appState.categories,
                    expenses: check.data.expenses || appState.expenses,
                    lastSyncedAt: check.data.lastSyncedAt || getNowGMT7(false),
                  };
                  saveAppState(merged);
                  setAppState(merged);
                  showToast('Đã tải dữ liệu từ Sheet!');
                }
              } else {
                showToast(`Lỗi kết nối: ${check.error}`);
              }
            }}
            onToggleSimulateOffline={(val) => {
              setSimulateOffline(val);
              setSimulateOfflineState(val);
              if (!val) {
                setTimeout(() => triggerQueueSync(), 100);
                showToast('Đã Online — Đang đồng bộ');
              } else {
                showToast('Đang giả lập Offline');
              }
            }}
            onTriggerDemoConflict={handleTriggerDemoConflict}
            onReloadFromSheet={() => handleRefreshSync(false)}
            onResetDemoData={() => {
              const fresh = resetToDemoData();
              setAppState(fresh);
              setSyncQueue([]);
              showToast('Đã khôi phục dữ liệu mẫu (giữ nguyên kết nối Sheet)');
            }}
            onShowToast={showToast}
          />
        )}
      </main>

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] px-4 py-2.5 rounded-md bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2"
        >
          <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      <WhoAmIModal
        isOpen={isWhoAmIOpen}
        members={appState.members}
        currentUserId={currentUserId}
        tripName={appState.config.tripName}
        onSelectMember={handleSelectMember}
        onClose={currentUserId ? () => setIsWhoAmIOpen(false) : undefined}
      />

      <ExpenseFormModal
        isOpen={isExpenseModalOpen}
        editingRecord={editingRecord}
        config={appState.config}
        members={appState.members}
        categories={appState.categories}
        currentUserId={currentUserId || appState.members[0]?.id || 'mem_duy'}
        isAdmin={isAdmin}
        onSave={handleSaveExpenseRecord}
        onSoftDelete={(rec) => {
          setIsExpenseModalOpen(false);
          setEditingRecord(null);
          handleSoftDeleteExpense(rec);
        }}
        onClose={() => {
          setIsExpenseModalOpen(false);
          setEditingRecord(null);
        }}
      />

      <ConflictModal
        conflictItem={activeConflict?.item || null}
        serverRecord={activeConflict?.serverRecord || null}
        members={appState.members}
        onAcceptServer={handleAcceptServerVersion}
        onForceKeepClient={handleForceKeepClientVersion}
        onClose={() => setActiveConflict(null)}
      />

      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddModal={() => {
          setEditingRecord(null);
          setIsExpenseModalOpen(true);
        }}
        pendingSyncCount={syncQueue.length}
        isTripCompleted={appState.config.tripStatus === 'completed'}
      />
    </div>
  );
}
