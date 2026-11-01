import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  Download,
  KeyRound,
  Moon,
  RefreshCw,
  Sun,
  User,
  X,
} from 'lucide-react';
import { MemberAvatar } from './components/MemberAvatar';
import { type ActiveTab, Navbar } from './components/Navbar';
import { OverviewTab } from './components/OverviewTab';
import { WhoAmIModal } from './components/WhoAmIModal';
import { APP_VERSION } from './config';
import { useModalAccessibility } from './hooks/useModalAccessibility';
import { usePWAInstall } from './hooks/usePWAInstall';
import {
  canMemberModifyExpense,
  changeAdminPin,
  enqueueExpenseUpsert,
  fetchAllFromGas,
  getCurrentUserId,
  getExpenseOwnerId,
  getGasUrl,
  getSimulateOffline,
  initializeSheetWithCurrentData,
  loadAppState,
  loadSyncQueue,
  mergeRemoteAndLocalExpenses,
  processSyncQueue,
  pruneSatisfiedQueueItems,
  resetToDemoData,
  resolveExpenseOwnerMember,
  saveAppState,
  saveSyncQueue,
  setCurrentUserId,
  setGasUrl,
  setSimulateOffline,
  syncAdminSettings,
  verifyAdminPin,
} from './services/syncService';

function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // Thử tải lại module 1 lần sau 250ms nếu mạng chập chờn
      await new Promise((r) => setTimeout(r, 250));
      return await factory().catch(() => {
        throw err;
      });
    }
  });
}

class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode; onReload: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onReload: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-center space-y-2.5">
          <div className="text-sm font-bold text-slate-800">
            Ứng dụng vừa có bản cập nhật mới
          </div>
          <div className="text-xs text-slate-600">
            Tải lại trang để đồng bộ các thành phần giao diện mới nhất.
          </div>
          <button
            type="button"
            onClick={this.props.onReload}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
            <span>Tải lại ngay</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ExpensesTab = lazyWithRetry(() =>
  import('./components/ExpensesTab').then((m) => ({ default: m.ExpensesTab }))
);
const SettlementTab = lazyWithRetry(() =>
  import('./components/SettlementTab').then((m) => ({ default: m.SettlementTab }))
);
const SettingsTab = lazyWithRetry(() =>
  import('./components/SettingsTab').then((m) => ({ default: m.SettingsTab }))
);
const ExpenseFormModal = lazyWithRetry(() =>
  import('./components/ExpenseFormModal').then((m) => ({ default: m.ExpenseFormModal }))
);
const ConflictModal = lazyWithRetry(() =>
  import('./components/ConflictModal').then((m) => ({ default: m.ConflictModal }))
);
const PWAInstallModal = lazyWithRetry(() =>
  import('./components/PWAInstallModal').then((m) => ({ default: m.PWAInstallModal }))
);
import type {
  AppStateData,
  Category,
  ExpenseRecord,
  Member,
  SyncQueueItem,
  TripConfig,
} from './types';
import {
  formatVND,
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
  const [detectedNewVersion, setDetectedNewVersion] = useState<string | null>(null);
  const [isUpdatingApp, setIsUpdatingApp] = useState<boolean>(false);
  const lastVersionCheckRef = useRef<number>(0);

  const [pendingAdminEditRecord, setPendingAdminEditRecord] = useState<ExpenseRecord | null>(null);
  const [quickPinInput, setQuickPinInput] = useState<string>('');
  const [quickPinError, setQuickPinError] = useState<string>('');
  const [verifyingQuickPin, setVerifyingQuickPin] = useState<boolean>(false);

  const appStateRef = useRef<AppStateData>(appState);
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);
  const syncLockRef = useRef<boolean>(false);

  const quickPinModalRef = useModalAccessibility<HTMLDivElement>(
    Boolean(pendingAdminEditRecord),
    () => setPendingAdminEditRecord(null)
  );

  /**
   * Kiểm tra phiên bản mới theo chuẩn quốc tế (PWA/SPA Lifecycle):
   * - force = true: Kiểm tra ngay lập tức (khi vừa mở app, khi bấm nút Đồng bộ, hoặc khi có mạng lại).
   * - force = false: Có throttle tối thiểu 5 phút khi chuyển tab (visibilitychange) và chu kỳ nền 30 phút.
   */
  const checkRemoteVersion = useCallback(async (force = false) => {
    if (typeof window === 'undefined' || !navigator.onLine) return;
    const now = Date.now();
    if (!force && now - lastVersionCheckRef.current < 5 * 60 * 1000) {
      return;
    }
    lastVersionCheckRef.current = now;

    try {
      const res = await fetch(`/version.json?t=${now}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: string };
      const remoteVer = String(data?.version || '').trim();
      if (!remoteVer) return;

      const parseVerIndex = (v: string) => Number(v.replace(/\D/g, '')) || 0;
      const remoteIdx = parseVerIndex(remoteVer);
      const localIdx = parseVerIndex(APP_VERSION);

      if ((remoteIdx > 0 && remoteIdx > localIdx) || (remoteVer !== APP_VERSION && remoteIdx >= localIdx)) {
        setDetectedNewVersion(remoteVer);
      }
    } catch {
      // Ignore network errors while checking version
    }
  }, []);

  const handleApplyNewVersion = useCallback(async () => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const lastReload = Number(sessionStorage.getItem('tdytrip_chunk_reload_ts') || '0');
        if (Date.now() - lastReload < 10000) {
          setToastMessage('Đã tải lại gần đây. Vui lòng kiểm tra kết nối mạng và thử lại.');
          return;
        }
        sessionStorage.setItem('tdytrip_chunk_reload_ts', String(Date.now()));
      }
    } catch {
      // Ignore storage errors
    }
    setIsUpdatingApp(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Ignore cleanup errors
    } finally {
      window.location.reload();
    }
  }, []);

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
    async (
      stateOverride?: AppStateData
    ): Promise<{
      syncedCount: number;
      conflictCount: number;
      errorCount: number;
      tripLocked?: boolean;
    }> => {
      if (!effectiveOnline || syncLockRef.current) {
        return { syncedCount: 0, conflictCount: 0, errorCount: 0, tripLocked: false };
      }
      const currentQ = loadSyncQueue();
      if (currentQ.length === 0) {
        return { syncedCount: 0, conflictCount: 0, errorCount: 0, tripLocked: false };
      }

      syncLockRef.current = true;
      setIsSyncing(true);
      try {
        return await processSyncQueue(
          stateOverride || appStateRef.current,
          (nextState, nextQueue) => {
            appStateRef.current = nextState;
            setAppState(nextState);
            setSyncQueue(nextQueue);
          },
          (conflictItem, serverRecord) => {
            setActiveConflict({ item: conflictItem, serverRecord });
          },
          isAdmin ? adminPin : undefined
        );
      } finally {
        syncLockRef.current = false;
        setIsSyncing(false);
      }
    },
    [effectiveOnline, isAdmin, adminPin]
  );

  const handleRefreshSync = useCallback(
    async (silent = false) => {
      // Mặc định khi bấm nút Đồng bộ (!silent) sẽ kiểm tra phiên bản mới ngay lập tức
      void checkRemoteVersion(!silent);
      if (!effectiveOnline) {
        if (!silent) showToast('Đang Offline — Dữ liệu lưu trên máy');
        return;
      }
      if (syncLockRef.current) return;

      try {
        const queueOutcome = await triggerQueueSync();
        if (gasUrl) {
          syncLockRef.current = true;
          setIsSyncing(true);
          try {
            const res = await fetchAllFromGas(gasUrl);
            if (res.ok && res.data) {
              const latestQueue = loadSyncQueue();
              const prunedQueue = pruneSatisfiedQueueItems(
                res.data?.expenses || [],
                latestQueue
              );
              setSyncQueue(prunedQueue);
              setAppState((prev) => {
                const remoteExpenses = res.data?.expenses || prev.expenses;
                const remoteConfig = res.data?.config || prev.config;
                const finalTripStatus =
                  queueOutcome.tripLocked || remoteConfig.tripStatus === 'completed'
                    ? 'completed'
                    : remoteConfig.tripStatus;
                const merged: AppStateData = {
                  ...prev,
                  config: { ...remoteConfig, tripStatus: finalTripStatus },
                  members: res.data?.members || prev.members,
                  categories: res.data?.categories || prev.categories,
                  expenses: mergeRemoteAndLocalExpenses(remoteExpenses, prunedQueue),
                  lastSyncedAt: res.data?.lastSyncedAt || getNowGMT7(false),
                };
                appStateRef.current = merged;
                saveAppState(merged);
                return merged;
              });

              if (queueOutcome.tripLocked) {
                showToast(
                  `Chuyến đi đã khóa sổ trên Sheet — ${prunedQueue.length} khoản chưa đồng bộ vẫn giữ an toàn trong máy`
                );
              } else if (!silent) {
                if (prunedQueue.length > 0) {
                  showToast(
                    `Đã tải Sheet — Còn ${prunedQueue.length} khoản chưa đồng bộ lên Sheet`
                  );
                } else {
                  showToast('Đã đồng bộ Google Sheet');
                }
              }
            } else if (res.error && !silent) {
              showToast(`Lỗi Sheet: ${res.error}`);
            }
          } finally {
            syncLockRef.current = false;
            setIsSyncing(false);
          }
        } else if (!silent) {
          setAppState((prev) => {
            const updated = { ...prev, lastSyncedAt: getNowGMT7(false) };
            appStateRef.current = updated;
            saveAppState(updated);
            return updated;
          });
          showToast('Đã làm mới dữ liệu trên máy');
        }
      } finally {
        setIsSyncing(false);
      }
    },
    [effectiveOnline, triggerQueueSync, gasUrl, showToast, checkRemoteVersion]
  );

  // Kiểm tra phiên bản khi mở ứng dụng và định kỳ mỗi 30 phút theo chuẩn quốc tế
  useEffect(() => {
    void checkRemoteVersion(true);
    const versionTimer = setInterval(() => {
      void checkRemoteVersion(true);
    }, 30 * 60 * 1000);
    return () => clearInterval(versionTimer);
  }, [checkRemoteVersion]);

  useEffect(() => {
    if (effectiveOnline && gasUrl) {
      handleRefreshSync(true);
    }
  }, [effectiveOnline, gasUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void checkRemoteVersion(true);
      void triggerQueueSync().then((outcome) => {
        if (outcome.tripLocked) {
          showToast(
            'Chuyến đi đã khóa sổ trên Sheet — Các khoản tạo khi Offline vẫn được giữ an toàn trong máy'
          );
        }
      });
    };
    const onOffline = () => setIsOnline(false);
    const onVisChange = () => {
      if (document.visibilityState === 'visible') {
        void checkRemoteVersion(false);
        if (gasUrl) {
          handleRefreshSync(true);
        } else {
          void triggerQueueSync();
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
  }, [triggerQueueSync, gasUrl, handleRefreshSync, checkRemoteVersion, showToast]);

  useEffect(() => {
    if (
      !effectiveOnline ||
      syncQueue.length === 0 ||
      isSyncing ||
      appState.config.tripStatus === 'completed'
    ) {
      return;
    }
    // Chỉ retry tự động với lỗi mạng tạm thời (không retry vô hạn với lỗi nghiệp vụ nonRetryable như TRIP_COMPLETED, PERMISSION_DENIED)
    const actionable = syncQueue.filter(
      (q) =>
        q.status === 'pending' ||
        (q.status === 'error' && !q.nonRetryable && (q.retryCount || 0) < 5)
    );
    if (actionable.length === 0) return;

    const maxRetry = Math.max(0, ...actionable.map((q) => q.retryCount || 0));
    const delayMs = Math.min(25000, 1200 * Math.pow(2, maxRetry));
    const timer = setTimeout(() => {
      void triggerQueueSync();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [effectiveOnline, syncQueue, isSyncing, appState.config.tripStatus, triggerQueueSync]);

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
      showToast('Chuyến đi đã khóa sổ! Mở khóa trong Cài đặt nếu cần chỉnh sửa.');
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
      const outcome = await triggerQueueSync(nextState);
      if (outcome.tripLocked || appStateRef.current.config.tripStatus === 'completed') {
        showToast(
          'Chuyến đi đã khóa sổ trên Sheet — Đã giữ khoản chi trong máy (chưa đồng bộ lên Sheet)'
        );
      } else if (outcome.errorCount > 0 || outcome.conflictCount > 0) {
        showToast('Chưa đồng bộ được lên Sheet — Đã giữ an toàn trong hàng đợi trên máy');
      } else {
        showToast(
          record.deleted
            ? `Đã xóa "${record.title}"`
            : baseRev === 0
            ? `Đã thêm "${record.title}"`
            : `Đã sửa "${record.title}"`
        );
      }
    } else {
      showToast('Đã lưu vào hàng đợi Offline');
    }
  };

  const handleSoftDeleteExpense = async (record: ExpenseRecord) => {
    if (appState.config.tripStatus === 'completed') {
      showToast('Chuyến đi đã khóa sổ! Mở khóa trong Cài đặt nếu cần xóa.');
      return;
    }
    const actor = currentUserId || getExpenseOwnerId(record);
    const canModify = canMemberModifyExpense(
      record,
      actor,
      appState.members,
      isAdmin,
      appState.config.tripStatus
    );
    if (!canModify) {
      showToast('Chỉ người tạo khoản chi hoặc Admin được xóa.');
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
      errorCode: undefined,
      nonRetryable: false,
      retryCount: 0,
      errorMessage: undefined,
    };
    const nextQueue = syncQueue.map((q) =>
      q.queueId === conflictItem.queueId ? updatedQueueItem : q
    );
    saveSyncQueue(nextQueue);
    setSyncQueue(nextQueue);
    setActiveConflict(null);
    const outcome = await triggerQueueSync();
    if (outcome.tripLocked || appStateRef.current.config.tripStatus === 'completed') {
      showToast('Chuyến đi đã khóa sổ trên Sheet — Chưa thể ghi đè phiên bản');
    } else if (outcome.errorCount > 0) {
      showToast('Chưa thể đồng bộ lên Sheet — Đã giữ trong hàng đợi');
    } else {
      showToast(`Đã cập nhật lên rev #${serverRecord.rev + 1}`);
    }
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
            className="min-h-[40px] px-2.5 py-1 -ml-1.5 rounded-xl hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer group"
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
              className="relative w-10 h-10 rounded-xl hover:bg-brand-soft flex items-center justify-center text-slate-500 hover:text-brand transition-colors cursor-pointer"
            >
              <RefreshCw
                aria-hidden="true"
                className={`w-[17px] h-[17px] ${isSyncing ? 'animate-spin text-brand' : ''}`}
              />
              <span
                aria-hidden="true"
                className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
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
                className="w-10 h-10 rounded-xl hover:bg-brand-soft flex items-center justify-center text-slate-500 hover:text-brand transition-colors cursor-pointer"
              >
                <Download aria-hidden="true" className="w-[17px] h-[17px]" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              aria-label={isDarkMode ? 'Chuyển sang chế độ Sáng' : 'Chuyển sang chế độ Tối'}
              title={isDarkMode ? 'Chế độ Sáng (Light Mode)' : 'Chế độ Tối (Dark Mode)'}
              className="w-10 h-10 rounded-xl hover:bg-brand-soft flex items-center justify-center text-slate-500 hover:text-brand transition-colors cursor-pointer"
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
        {detectedNewVersion && (
          <button
            type="button"
            onClick={handleApplyNewVersion}
            disabled={isUpdatingApp}
            className="w-full p-3 rounded-2xl bg-brand hover:bg-brand-hover text-white shadow-md shadow-brand/20 flex items-center justify-between gap-2 text-xs font-bold transition-all cursor-pointer active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw
                aria-hidden="true"
                className={`w-4 h-4 shrink-0 ${isUpdatingApp ? 'animate-spin' : ''}`}
              />
              <span className="truncate">Có phiên bản mới. Bấm để cập nhật.</span>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-white/20 font-mono text-[11px] shrink-0">
              {detectedNewVersion}
            </span>
          </button>
        )}

        {appState.config.tripStatus === 'completed' && (
          <div
            role="status"
            className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center justify-center gap-2 text-xs text-center shadow-sm"
          >
            <Archive aria-hidden="true" className="w-4 h-4 text-blue-300 shrink-0" />
            <span>
              <strong>Chuyến đi đã kết thúc</strong> — Chế độ chỉ xem.
            </span>
          </div>
        )}

        {syncQueue.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-950">
                  <AlertTriangle aria-hidden="true" className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {appState.config.tripStatus === 'completed'
                      ? `${syncQueue.length} khoản chưa đồng bộ lên Google Sheet (Chuyến đi đã khóa sổ)`
                      : `${syncQueue.length} khoản đang chờ / lỗi đồng bộ (Chưa có trên Google Sheet)`}
                  </span>
                </div>
                <div className="text-[11px] text-amber-900">
                  {appState.config.tripStatus === 'completed'
                    ? 'Các khoản dưới đây được giữ an toàn trong máy nhưng chưa ghi lên Google Sheet vì chuyến đi đã khóa sổ (TRIP_COMPLETED). Admin có thể mở khóa trong Cài đặt nếu muốn đồng bộ.'
                    : 'Dữ liệu bên dưới đang lưu an toàn trên thiết bị và sẽ đồng bộ lên Google Sheet khi sẵn sàng.'}
                </div>
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
                    if (appState.config.tripStatus === 'completed') {
                      showToast('Chuyến đi đã khóa sổ — Hãy mở khóa trong Cài đặt trước khi đồng bộ.');
                      return;
                    }
                    if (simulateOffline) {
                      setSimulateOffline(false);
                      setSimulateOfflineState(false);
                    }
                    setTimeout(() => {
                      void triggerQueueSync();
                    }, 50);
                  }}
                  disabled={isSyncing || appState.config.tripStatus === 'completed'}
                  className="min-h-[34px] px-3.5 py-1 rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                >
                  {appState.config.tripStatus === 'completed'
                    ? 'Đã khóa sổ'
                    : isSyncing
                    ? 'Đang gửi…'
                    : 'Đồng bộ ngay'}
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200/80 space-y-1.5 max-h-40 overflow-y-auto">
              {syncQueue.slice(0, 8).map((q) => (
                <div
                  key={q.queueId}
                  className="px-2.5 py-1.5 rounded-xl bg-white/90 border border-amber-200/70 flex items-center justify-between gap-2 text-[11px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900 truncate">
                      {q.record.deleted ? '[Xóa] ' : ''}
                      {q.record.title}
                    </div>
                    <div className="text-[10px] text-rose-700 truncate">
                      {q.status === 'conflict'
                        ? 'Lý do: Xung đột phiên bản (rev) trên Google Sheet'
                        : q.errorCode === 'TRIP_COMPLETED' ||
                          appState.config.tripStatus === 'completed'
                        ? 'Lý do: Chuyến đi đã khóa sổ (TRIP_COMPLETED) — Chưa ghi lên Sheet'
                        : q.errorMessage
                        ? `Lý do: ${q.errorMessage}`
                        : !effectiveOnline
                        ? 'Trạng thái: Đang Offline — Chờ kết nối mạng'
                        : 'Trạng thái: Đang chờ đồng bộ lên Google Sheet'}
                    </div>
                  </div>
                  <span className="font-mono font-bold text-slate-800 shrink-0 tabular-nums">
                    {formatVND(q.record.amount)}
                  </span>
                </div>
              ))}
              {syncQueue.length > 8 && (
                <div className="text-[10px] font-semibold text-amber-900 px-1">
                  … và {syncQueue.length - 8} khoản khác trong hàng đợi cục bộ.
                </div>
              )}
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
              if (appState.config.tripStatus === 'completed') {
                showToast('Chuyến đi đã khóa sổ — Chế độ chỉ xem.');
                return;
              }
              setEditingRecord(null);
              setIsExpenseModalOpen(true);
            }}
          />
        )}

        <ChunkErrorBoundary onReload={handleApplyNewVersion}>
          <Suspense
            fallback={
              <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-2xs text-center text-xs font-medium text-slate-500">
                Đang tải…
              </div>
            }
          >
          {activeTab === 'expenses' && (
            <ExpensesTab
              config={appState.config}
              members={appState.members}
              categories={appState.categories}
              expenses={appState.expenses}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onEditRecord={(rec) => {
                if (appState.config.tripStatus === 'completed') {
                  showToast('Chuyến đi đã khóa sổ — Chế độ chỉ xem.');
                  return;
                }
                setEditingRecord(rec);
                setIsExpenseModalOpen(true);
              }}
              onRequestAdminUnlock={(rec) => {
                if (appState.config.tripStatus === 'completed') {
                  showToast('Chuyến đi đã khóa sổ (Chế độ chỉ xem). Mở khóa trong Cài đặt nếu cần sửa.');
                  return;
                }
                setPendingAdminEditRecord(rec);
                setQuickPinInput('');
                setQuickPinError('');
              }}
              onSoftDeleteRecord={handleSoftDeleteExpense}
              onOpenAddModal={() => {
                if (appState.config.tripStatus === 'completed') {
                  showToast('Chuyến đi đã khóa sổ — Chế độ chỉ xem.');
                  return;
                }
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
              pendingSyncCount={syncQueue.length}
              isSyncing={isSyncing}
              onSyncNow={async () => {
                await triggerQueueSync();
              }}
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
                    const latestQueue = loadSyncQueue();
                    const merged: AppStateData = {
                      ...appState,
                      config: check.data.config || appState.config,
                      members: check.data.members || appState.members,
                      categories: check.data.categories || appState.categories,
                      expenses: mergeRemoteAndLocalExpenses(
                        check.data.expenses || appState.expenses,
                        latestQueue
                      ),
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
                  setTimeout(() => {
                    void triggerQueueSync().then((outcome) => {
                      if (outcome.tripLocked || appStateRef.current.config.tripStatus === 'completed') {
                        showToast(
                          'Chuyến đi đã khóa sổ trên Sheet — Các khoản Offline vẫn giữ an toàn trong máy'
                        );
                      } else if (outcome.errorCount > 0) {
                        showToast('Đã Online — Có khoản chưa đồng bộ được lên Sheet');
                      } else {
                        showToast('Đã Online — Đang đồng bộ');
                      }
                    });
                  }, 100);
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
          </Suspense>
        </ChunkErrorBoundary>
      </main>

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-22 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-medium shadow-2xl flex items-center justify-center gap-2 text-center"
        >
          <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="leading-snug">{toastMessage}</span>
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

      <ChunkErrorBoundary onReload={handleApplyNewVersion}>
        <Suspense fallback={null}>
          {isExpenseModalOpen && (
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
          )}

          {activeConflict && (
            <ConflictModal
              conflictItem={activeConflict.item}
              serverRecord={activeConflict.serverRecord}
              members={appState.members}
              onAcceptServer={handleAcceptServerVersion}
              onForceKeepClient={handleForceKeepClientVersion}
              onClose={() => setActiveConflict(null)}
            />
          )}

          {isPWAInstallOpen && (
            <PWAInstallModal
              isOpen={isPWAInstallOpen}
              isIOS={isIOS}
              isInstallable={isInstallable}
              onInstallNative={installPWA}
              onClose={() => setIsPWAInstallOpen(false)}
            />
          )}
        </Suspense>
      </ChunkErrorBoundary>

      {pendingAdminEditRecord && (
        <div
          ref={quickPinModalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-admin-pin-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-xs bg-white rounded-2xl border border-slate-200 shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
                  <KeyRound aria-hidden="true" className="w-4 h-4" />
                </div>
                <h2 id="quick-admin-pin-title" className="text-sm font-bold text-slate-900 truncate">
                  Chỉnh sửa khoản chi
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPendingAdminEditRecord(null)}
                aria-label="Đóng"
                className="w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const ownerMember = resolveExpenseOwnerMember(
                pendingAdminEditRecord,
                appState.members
              );
              return (
                <>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Khoản <strong className="text-slate-900">&ldquo;{pendingAdminEditRecord.title}&rdquo;</strong> do{' '}
                    <strong className="text-slate-900">{ownerMember?.name || 'thành viên khác'}</strong> tạo. Để hạn chế sửa nhầm, bạn có thể chuyển sang tên thành viên này hoặc mở quyền Admin:
                  </p>

                  {ownerMember && !pendingAdminEditRecord.deleted && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetRec = pendingAdminEditRecord;
                        handleSelectMember(ownerMember.id);
                        setPendingAdminEditRecord(null);
                        setEditingRecord(targetRec);
                        setIsExpenseModalOpen(true);
                      }}
                      className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-brand-soft hover:bg-brand-border/60 text-brand text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <User aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                      <span>Chuyển sang {ownerMember.name} &amp; Sửa ngay</span>
                    </button>
                  )}
                </>
              );
            })()}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickPinInput.trim() || verifyingQuickPin) return;
                setVerifyingQuickPin(true);
                setQuickPinError('');
                try {
                  const res = await verifyAdminPin(quickPinInput);
                  if (res.ok) {
                    const targetRec = pendingAdminEditRecord;
                    setIsAdmin(true);
                    setAdminPin(quickPinInput.trim());
                    setPendingAdminEditRecord(null);
                    setQuickPinInput('');
                    showToast('Đã mở quyền Admin');
                    setEditingRecord(targetRec);
                    setIsExpenseModalOpen(true);
                  } else {
                    setQuickPinError(res.error || 'Mã PIN không đúng');
                  }
                } finally {
                  setVerifyingQuickPin(false);
                }
              }}
              className="space-y-2.5 pt-2 border-t border-slate-100"
            >
              <input
                type="password"
                name="quickAdminPin"
                inputMode="numeric"
                autoComplete="off"
                value={quickPinInput}
                onChange={(e) => {
                  setQuickPinInput(e.target.value);
                  setQuickPinError('');
                }}
                placeholder="Hoặc nhập mã PIN Admin…"
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 focus:border-brand text-sm font-mono text-slate-900"
              />

              {quickPinError && (
                <div className="text-[11px] font-semibold text-rose-600">{quickPinError}</div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingAdminEditRecord(null)}
                  className="min-h-[36px] px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!quickPinInput.trim() || verifyingQuickPin}
                  className="min-h-[36px] px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold disabled:opacity-50"
                >
                  {verifyingQuickPin ? 'Đang mở…' : 'Mở Admin & Sửa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAddModal={() => {
          if (appState.config.tripStatus === 'completed') {
            showToast('Chuyến đi đã khóa sổ — Chế độ chỉ xem.');
            return;
          }
          setEditingRecord(null);
          setIsExpenseModalOpen(true);
        }}
        pendingSyncCount={syncQueue.length}
        isTripCompleted={appState.config.tripStatus === 'completed'}
      />
    </div>
  );
}
