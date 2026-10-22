import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  Download,
  Moon,
  RefreshCw,
  Sun,
  User,
} from 'lucide-react';
import { ConflictModal } from './components/ConflictModal';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { ExpensesTab } from './components/ExpensesTab';
import { MemberAvatar } from './components/MemberAvatar';
import { type ActiveTab, Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { PWAInstallModal } from './components/PWAInstallModal';
import { SettingsTab } from './components/SettingsTab';
import { SettlementTab } from './components/SettlementTab';
import { WhoAmIModal } from './components/WhoAmIModal';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  changeAdminPin,
  enqueueExpenseUpsert,
  fetchAllFromGas,
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
  generateUUID,
  getNowGMT7,
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
  const [isPWAInstallOpen, setIsPWAInstallOpen] = useState<boolean>(false);
  const { isInstallable, isInstalled, isIOS, install: installPWA } = usePWAInstall();

  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminPin, setAdminPin] = useState<string>('');

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('tdytime_theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return false;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      window.localStorage.setItem('tdytime_theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('tdytime_theme', 'light');
    }
  }, [isDarkMode]);

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

  return (
    <div className="min-h-dvh bg-slate-50/80 text-slate-900 pb-24">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-xl focus:bg-brand focus:text-white focus:text-xs focus:font-bold"
      >
        Chuyển đến nội dung chính
      </a>

      {/* Top Header tinh gọn: Trái là User đang chọn, Phải là Đồng bộ + Cài App + Dark Mode */}
      <header className="sticky top-0 z-30 h-12 sm:h-13 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-2xs">
        <div className="max-w-2xl mx-auto px-3 md:px-6 h-full flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIsWhoAmIOpen(true)}
            aria-label="Đổi người dùng"
            title={currentMember ? `Đang chọn: ${currentMember.name}` : 'Chọn người dùng'}
            className="min-h-[38px] px-2 py-1 -ml-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer group"
          >
            {currentMember ? (
              <>
                <MemberAvatar member={currentMember} size="sm" />
                <span className="text-xs sm:text-sm font-bold text-slate-800 truncate max-w-[180px]">
                  {currentMember.name}
                </span>
                <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" />
              </>
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className="w-6 h-6 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700"
                >
                  <User aria-hidden="true" className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-slate-700">Chọn tên</span>
                <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </>
            )}
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleRefreshSync(false)}
              disabled={isSyncing}
              aria-label="Đồng bộ dữ liệu"
              title={
                !effectiveOnline
                  ? 'Đang Offline'
                  : gasUrl
                  ? `Đồng bộ Sheet (${appState.lastSyncedAt?.slice(11, 16) || 'Sẵn sàng'})`
                  : 'Làm mới dữ liệu'
              }
              className="relative w-9 h-9 rounded-xl hover:bg-brand-soft flex items-center justify-center text-slate-500 hover:text-brand transition-colors cursor-pointer"
            >
              <RefreshCw
                aria-hidden="true"
                className={`w-[17px] h-[17px] ${isSyncing ? 'animate-spin text-brand' : ''}`}
              />
              <span
                aria-hidden="true"
                className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                  !effectiveOnline
                    ? 'bg-amber-500'
                    : gasUrl
                    ? 'bg-emerald-500'
                    : 'bg-slate-300'
                }`}
              />
            </button>

            {!isInstalled && (
              <button
                type="button"
                onClick={async () => {
                  if (isInstallable) {
                    const ok = await installPWA();
                    if (ok) showToast('Đã cài đặt ứng dụng!');
                  } else {
                    setIsPWAInstallOpen(true);
                  }
                }}
                aria-label="Cài ứng dụng vào điện thoại"
                title="Cài ứng dụng vào màn hình chính (PWA)"
                className="w-9 h-9 rounded-xl hover:bg-brand-soft flex items-center justify-center text-slate-500 hover:text-brand transition-colors cursor-pointer"
              >
                <Download aria-hidden="true" className="w-[17px] h-[17px]" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              aria-label={isDarkMode ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
              title={isDarkMode ? 'Chế độ Sáng (Light Mode)' : 'Chế độ Tối (Dark Mode)'}
              className="w-9 h-9 rounded-xl hover:bg-brand-soft flex items-center justify-center text-slate-500 hover:text-brand transition-colors cursor-pointer"
            >
              {isDarkMode ? (
                <Sun aria-hidden="true" className="w-[17px] h-[17px] text-amber-400" />
              ) : (
                <Moon aria-hidden="true" className="w-[17px] h-[17px]" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-2xl mx-auto px-3 md:px-6 pt-3 space-y-3.5">
        {appState.config.tripStatus === 'completed' && (
          <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center gap-2.5 text-xs shadow-sm">
            <Archive aria-hidden="true" className="w-4 h-4 text-blue-300 shrink-0" />
            <span>
              <strong>Chuyến đi đã kết thúc</strong> — Chế độ chỉ xem.
            </span>
          </div>
        )}

        {syncQueue.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
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
                  className="min-h-[34px] px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
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
                className="min-h-[34px] px-3.5 py-1 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors"
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
            onChangeAdminPin={async (oldPin, newPin) => {
              const res = await changeAdminPin(
                oldPin,
                newPin,
                currentUserId || 'admin'
              );
              if (res.ok) {
                setAdminPin(newPin.trim());
              }
              return res;
            }}
            onUpdateMembers={async (nextMembers: Member[]) => {
              if (!isAdmin) return;
              const nextState = { ...appState, members: nextMembers };
              saveAppState(nextState);
              setAppState(nextState);
              if (
                currentUserId &&
                !nextMembers.some((m) => m.id === currentUserId)
              ) {
                const fallbackId = nextMembers[0]?.id || '';
                setCurrentUserState(fallbackId);
                setCurrentUserId(fallbackId);
              }
              await syncAdminSettings(adminPin, currentUserId || 'admin', {
                members: nextMembers,
              });
            }}
            onUpdateCategories={async (nextCategories: Category[]) => {
              if (!isAdmin) return;
              const nextState = { ...appState, categories: nextCategories };
              saveAppState(nextState);
              setAppState(nextState);
              await syncAdminSettings(adminPin, currentUserId || 'admin', {
                categories: nextCategories,
              });
            }}
            onUpdateConfig={async (nextConfig: TripConfig) => {
              if (!isAdmin) return;
              const nextState = { ...appState, config: nextConfig };
              saveAppState(nextState);
              setAppState(nextState);
              await syncAdminSettings(adminPin, currentUserId || 'admin', {
                config: nextConfig,
              });
            }}
            onSaveGasUrl={(url) => {
              if (!isAdmin) return;
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
          className="fixed bottom-22 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-medium shadow-2xl flex items-center gap-2.5"
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

      <PWAInstallModal
        isOpen={isPWAInstallOpen}
        isIOS={isIOS}
        isInstallable={isInstallable}
        onInstallNative={installPWA}
        onClose={() => setIsPWAInstallOpen(false)}
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
