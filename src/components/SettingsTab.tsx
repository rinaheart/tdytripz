import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Code2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileDown,
  FolderKanban,
  FolderPlus,
  KeyRound,
  Lock,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import {
  APP_NAME,
  APP_VERSION,
  AVATAR_COLORS,
  BANK_LIST,
  sortCategoriesTailOrder,
} from '../config';
import { normalizeTripCode } from '../services/syncService';
import type {
  ArchiveAndNewTripPayload,
  ArchivedTripSnapshot,
  ArchivedTripSummary,
  Category,
  ExpenseRecord,
  HistoryEntry,
  Member,
  SplitMode,
  TripConfig,
} from '../types';
import { copyToClipboard, formatDateRangeVN, formatVND, generateUUID, getNowGMT7 } from '../utils/format';
import { getMemberGroupSize, parseMemberGroupSize } from '../utils/math';
import { buildExpenseReportData } from '../utils/pdfReportData';
import { MemberAvatar } from './MemberAvatar';
import { CATEGORY_ICON_MAP } from './OverviewTab';

interface SettingsTabProps {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
  history: HistoryEntry[];
  viewingArchive?: ArchivedTripSnapshot | null;
  isAdmin: boolean;
  adminPin: string;
  gasUrl: string;
  simulateOffline: boolean;
  pendingSyncCount?: number;
  isSyncing?: boolean;
  onSyncNow?: () => Promise<void>;
  onUnlockAdmin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onLockAdmin: () => void;
  onChangeAdminPin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
  onArchiveAndStartNewTrip?: (
    payload: ArchiveAndNewTripPayload
  ) => Promise<{ ok: boolean; archiveSummary?: ArchivedTripSummary; error?: string }>;
  onListArchivedTrips?: () => Promise<{
    ok: boolean;
    archives?: ArchivedTripSummary[];
    error?: string;
  }>;
  onOpenArchiveByCode?: (tripCode: string) => Promise<{ ok: boolean; error?: string }>;
  onExitArchive?: () => void;
  onUpdateMembers: (nextMembers: Member[]) => Promise<void>;
  onUpdateCategories: (nextCategories: Category[]) => Promise<void>;
  onUpdateConfig: (nextConfig: TripConfig) => Promise<void>;
  onSaveGasUrl: (url: string) => void;
  onTestAndInitSheet: (url: string) => Promise<void>;
  onReloadFromSheet?: () => Promise<void>;
  onToggleSimulateOffline: (val: boolean) => void;
  onTriggerDemoConflict: () => void;
  onResetDemoData: () => void;
  onShowToast: (msg: string) => void;
}

type SettingsSection = 'members' | 'trip' | 'system';

export const SettingsTab: React.FC<SettingsTabProps> = React.memo(({
  config,
  members,
  categories,
  expenses,
  history,
  viewingArchive = null,
  isAdmin,
  gasUrl,
  simulateOffline,
  pendingSyncCount = 0,
  isSyncing = false,
  onSyncNow,
  onUnlockAdmin,
  onLockAdmin,
  onChangeAdminPin,
  onArchiveAndStartNewTrip,
  onListArchivedTrips,
  onOpenArchiveByCode,
  onExitArchive,
  onUpdateMembers,
  onUpdateCategories,
  onUpdateConfig,
  onSaveGasUrl,
  onTestAndInitSheet,
  onReloadFromSheet,
  onToggleSimulateOffline,
  onResetDemoData,
  onShowToast,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('members');

  const [showAdminLogin, setShowAdminLogin] = useState<boolean>(false);
  const [copiedMemberId, setCopiedMemberId] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState<string>('');
  const [showPinText, setShowPinText] = useState<boolean>(false);
  const [verifyingPin, setVerifyingPin] = useState<boolean>(false);
  const [showChangePin, setShowChangePin] = useState<boolean>(false);
  const [oldPinInput, setOldPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memForm, setMemForm] = useState<Member | null>(null);
  const [newMemberName, setNewMemberName] = useState<string>('');

  const [newCatName, setNewCatName] = useState<string>('');
  const [newCatIcon, setNewCatIcon] = useState<string>('Package');

  const [cfgForm, setCfgForm] = useState<TripConfig>(config);
  const [confirmLockWithPending, setConfirmLockWithPending] = useState<boolean>(false);

  // Quản lý Lưu trữ chuyến cũ & Tạo chuyến đi mới (Admin)
  const [showNewTripForm, setShowNewTripForm] = useState<boolean>(false);
  const [archiveCodeInput, setArchiveCodeInput] = useState<string>('');
  const [newTripName, setNewTripName] = useState<string>('');
  const [newTripId, setNewTripId] = useState<string>('');
  const [newTripIdTouched, setNewTripIdTouched] = useState<boolean>(false);
  const [newLocation, setNewLocation] = useState<string>('');
  const [newStartDate, setNewStartDate] = useState<string>('');
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [keepMembers, setKeepMembers] = useState<boolean>(true);
  const [keepCategories, setKeepCategories] = useState<boolean>(true);
  const [creatingNewTrip, setCreatingNewTrip] = useState<boolean>(false);
  const [newTripError, setNewTripError] = useState<string>('');

  // Tra cứu chuyến đi cũ theo mã trip (Admin)
  const [archiveSearchCode, setArchiveSearchCode] = useState<string>('');
  const [archivedTrips, setArchivedTrips] = useState<ArchivedTripSummary[]>([]);
  const [loadingArchives, setLoadingArchives] = useState<boolean>(false);
  const [openingArchiveCode, setOpeningArchiveCode] = useState<string | null>(null);
  const [archiveLookupError, setArchiveLookupError] = useState<string>('');

  const [gasUrlInput, setGasUrlInput] = useState<string>(gasUrl);
  const [testingSheet, setTestingSheet] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [showRawCodeGs, setShowRawCodeGs] = useState<boolean>(false);
  const [loadedCodeGs, setLoadedCodeGs] = useState<string>('');
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [confirmResetDemo, setConfirmResetDemo] = useState<boolean>(false);

  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [pdfExportError, setPdfExportError] = useState<string>('');

  const reportSourceConfig = viewingArchive ? viewingArchive.config : config;
  const reportSourceMembers = viewingArchive ? viewingArchive.members : members;
  const reportSourceCategories = viewingArchive ? viewingArchive.categories : categories;
  const reportSourceExpenses = viewingArchive ? viewingArchive.expenses : expenses;

  const reportPreview = useMemo(
    () =>
      buildExpenseReportData({
        config: reportSourceConfig,
        members: reportSourceMembers,
        categories: reportSourceCategories,
        expenses: reportSourceExpenses,
      }),
    [reportSourceConfig, reportSourceMembers, reportSourceCategories, reportSourceExpenses]
  );

  const activeExpenseCount = useMemo(
    () => expenses.filter((e) => !e.deleted && e.type !== 'transfer').length,
    [expenses]
  );

  const handleExportPdfReport = async () => {
    if (exportingPdf) return;
    const isOfflineNow =
      (typeof navigator !== 'undefined' && !navigator.onLine) || simulateOffline;
    if (isOfflineNow) {
      const offlineMsg = 'Cần Internet để xuất PDF';
      setPdfExportError(offlineMsg);
      onShowToast(offlineMsg);
      return;
    }

    setPdfExportError('');
    setExportingPdf(true);
    try {
      const { exportExpenseReportPdf } = await import('../utils/pdfReport');
      await exportExpenseReportPdf(reportPreview);
      onShowToast('Đã xuất báo cáo PDF');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tạo file PDF';
      setPdfExportError(msg);
      onShowToast(msg);
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => {
    setGasUrlInput(gasUrl);
  }, [gasUrl]);

  useEffect(() => {
    setCfgForm(config);
  }, [config]);

  const loadArchivesList = useCallback(async () => {
    if (!isAdmin || !onListArchivedTrips) return;
    setLoadingArchives(true);
    setArchiveLookupError('');
    try {
      const res = await onListArchivedTrips();
      if (res.ok) {
        setArchivedTrips(res.archives || []);
      } else if (res.error) {
        setArchiveLookupError(res.error);
      }
    } finally {
      setLoadingArchives(false);
    }
  }, [isAdmin, onListArchivedTrips]);

  useEffect(() => {
    if (isAdmin && activeSection === 'trip') {
      void loadArchivesList();
    }
  }, [isAdmin, activeSection, loadArchivesList]);

  useEffect(() => {
    if (!isAdmin) {
      setShowAdminLogin(false);
      setEditingMemberId(null);
      setMemForm(null);
      setShowChangePin(false);
      setConfirmResetDemo(false);
      setShowRawCodeGs(false);
      setShowNewTripForm(false);
      setArchivedTrips([]);
      setArchiveLookupError('');
      setNewTripError('');
    }
  }, [isAdmin]);

  const openNewTripForm = () => {
    if (!isAdmin) return;
    const today = getNowGMT7(false).slice(0, 10);
    setArchiveCodeInput(normalizeTripCode(config.tripId || config.tripName || 'TRIP'));
    setNewTripName('');
    setNewTripId('');
    setNewTripIdTouched(false);
    setNewLocation('');
    setNewStartDate(today);
    setNewEndDate(today);
    setKeepMembers(true);
    setKeepCategories(true);
    setNewTripError('');
    setShowNewTripForm(true);
  };

  const handleConfirmArchiveAndNewTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !onArchiveAndStartNewTrip) return;
    if (pendingSyncCount > 0) {
      setNewTripError(
        `Còn ${pendingSyncCount} khoản chi chưa đồng bộ. Vui lòng đồng bộ hết trước khi lưu trữ.`
      );
      return;
    }
    if (!newTripName.trim()) {
      setNewTripError('Vui lòng nhập tên chuyến đi mới.');
      return;
    }

    setCreatingNewTrip(true);
    setNewTripError('');
    try {
      const res = await onArchiveAndStartNewTrip({
        archiveCode: normalizeTripCode(archiveCodeInput || config.tripId || config.tripName),
        newTripId: normalizeTripCode(newTripId || newTripName),
        newTripName: newTripName.trim(),
        newLocation: newLocation.trim(),
        newStartDate,
        newEndDate,
        keepMembers,
        keepCategories,
      });
      if (res.ok) {
        setShowNewTripForm(false);
        await loadArchivesList();
      } else {
        setNewTripError(res.error || 'Không thể lưu trữ và tạo chuyến đi mới.');
      }
    } finally {
      setCreatingNewTrip(false);
    }
  };

  const handleOpenArchiveCode = async (rawCode: string) => {
    if (!isAdmin || !onOpenArchiveByCode) return;
    const clean = rawCode.trim();
    if (!clean) {
      setArchiveLookupError('Vui lòng nhập mã chuyến đi cần tra cứu.');
      return;
    }
    setOpeningArchiveCode(clean);
    setArchiveLookupError('');
    try {
      const res = await onOpenArchiveByCode(clean);
      if (!res.ok) {
        setArchiveLookupError(res.error || `Không tìm thấy chuyến đi với mã "${clean}".`);
      }
    } finally {
      setOpeningArchiveCode(null);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setVerifyingPin(true);
    try {
      const res = await onUnlockAdmin(pinInput);
      if (!res.ok) {
        onShowToast(res.error || 'Sai PIN');
      } else {
        setPinInput('');
        setShowAdminLogin(false);
        onShowToast('Đã mở khóa Admin');
      }
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const res = await onChangeAdminPin(oldPinInput, newPinInput);
    if (res.ok) {
      setShowChangePin(false);
      setOldPinInput('');
      setNewPinInput('');
      onShowToast('Đã đổi PIN');
    } else {
      onShowToast(res.error || 'Lỗi đổi PIN');
    }
  };

  const isMemberUsed = (memberId: string) =>
    expenses.some(
      (e) =>
        !e.deleted &&
        (e.payer === memberId || Math.round(e.splits?.[memberId] || 0) > 0)
    );

  const startEditMember = (m: Member) => {
    if (!isAdmin) return;
    setEditingMemberId(m.id);
    setMemForm({ ...m });
  };

  const handleSaveMember = async () => {
    if (!isAdmin || !memForm || !memForm.name.trim()) return;
    const cleanName = memForm.name.trim();
    const detectedGroupSize = parseMemberGroupSize(cleanName);
    const prevMember = members.find((m) => m.id === memForm.id);
    const prevGroupSize = prevMember ? getMemberGroupSize(prevMember) : 1;
    const nextDefaultWeight =
      detectedGroupSize > 1
        ? detectedGroupSize
        : prevGroupSize > 1
        ? 1
        : Math.max(1, Math.round(memForm.defaultWeight || 1));

    const cleanAccountNo = String(memForm.accountNo || '')
      .replace(/\s+/g, '')
      .replace(/^'+/, '');
    const next = members
      .map((m) =>
        m.id === memForm.id
          ? {
              ...memForm,
              name: cleanName,
              defaultWeight: nextDefaultWeight,
              bankName: (memForm.bankName || '').trim(),
              accountNo: cleanAccountNo,
              accountHolder: (memForm.accountHolder || '').trim().toUpperCase(),
            }
          : m
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    await onUpdateMembers(next);
    setEditingMemberId(null);
    setMemForm(null);
    onShowToast(`Đã lưu ${cleanName}`);
  };

  const handleAddMember = async () => {
    if (!isAdmin) return;
    const cleanName = newMemberName.trim();
    if (!cleanName) return;
    const groupSize = parseMemberGroupSize(cleanName);
    const nextColor = AVATAR_COLORS[members.length % AVATAR_COLORS.length];
    const newMem: Member = {
      id: `mem_${generateUUID().slice(0, 8)}`,
      name: cleanName,
      avatarColor: nextColor,
      defaultWeight: groupSize,
      bankName: '',
      accountNo: '',
      accountHolder: '',
      active: true,
    };
    const next = [...members, newMem].sort((a, b) =>
      a.name.localeCompare(b.name, 'vi')
    );
    await onUpdateMembers(next);
    setNewMemberName('');
    onShowToast(
      groupSize > 1 ? `+${cleanName} (nhóm ${groupSize} suất)` : `+${cleanName}`
    );
  };

  const handleDeleteMember = async (m: Member) => {
    if (!isAdmin) return;
    if (members.length <= 1) {
      onShowToast('Cần tối thiểu 1 thành viên');
      return;
    }
    if (isMemberUsed(m.id)) {
      onShowToast(`${m.name} đã có chi tiêu, không thể xóa`);
      return;
    }
    const next = members.filter((item) => item.id !== m.id);
    if (editingMemberId === m.id) {
      setEditingMemberId(null);
      setMemForm(null);
    }
    await onUpdateMembers(next);
    onShowToast(`Đã xóa ${m.name}`);
  };

  const isCategoryUsed = (catId: string) =>
    expenses.some((e) => e.categoryId === catId);

  const handleToggleCategoryHidden = async (cat: Category) => {
    if (!isAdmin) return;
    const next = categories.map((c) =>
      c.id === cat.id ? { ...c, hidden: !c.hidden } : c
    );
    await onUpdateCategories(next);
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (!isAdmin || isCategoryUsed(cat.id)) return;
    const next = categories.filter((c) => c.id !== cat.id);
    await onUpdateCategories(next);
  };

  const handleAddCategory = async () => {
    if (!isAdmin) return;
    const clean = newCatName.trim();
    if (!clean) return;
    const newCat: Category = {
      id: `cat_${generateUUID().slice(0, 6)}`,
      name: clean,
      icon: newCatIcon,
      order: categories.length + 1,
      hidden: false,
    };
    await onUpdateCategories(sortCategoriesTailOrder([...categories, newCat]));
    setNewCatName('');
  };

  const handleToggleSplitMode = (mode: SplitMode) => {
    if (!isAdmin) return;
    const current = cfgForm.enabledSplitModes || ['equal'];
    const exists = current.includes(mode);
    if (exists && current.length <= 1) return;
    const nextModes = exists
      ? current.filter((m) => m !== mode)
      : [...current, mode];
    setCfgForm({
      ...cfgForm,
      enabledSplitModes: nextModes,
      defaultSplitMode: nextModes.includes(cfgForm.defaultSplitMode)
        ? cfgForm.defaultSplitMode
        : nextModes[0],
    });
  };

  const handleSaveTripConfig = async (forceLockEvenWithPending = false) => {
    if (!isAdmin) return;
    const isLockingTrip =
      cfgForm.tripStatus === 'completed' && config.tripStatus !== 'completed';
    if (
      isLockingTrip &&
      (pendingSyncCount > 0 || isSyncing) &&
      !forceLockEvenWithPending
    ) {
      setConfirmLockWithPending(true);
      onShowToast(`Còn ${pendingSyncCount} khoản chờ đồng bộ! Vui lòng kiểm tra trước khi khóa sổ.`);
      return;
    }
    setConfirmLockWithPending(false);
    await onUpdateConfig(cfgForm);
    onShowToast(
      cfgForm.tripStatus === 'completed' ? 'Đã khóa sổ chuyến đi' : 'Đã lưu cài đặt chuyến đi'
    );
  };

  const ensureGasCodeLoaded = async (): Promise<string> => {
    if (loadedCodeGs) return loadedCodeGs;
    const mod = await import('../assets/gasCode');
    setLoadedCodeGs(mod.GOOGLE_APPS_SCRIPT_CODE);
    return mod.GOOGLE_APPS_SCRIPT_CODE;
  };

  const handleCopyCodeGs = async () => {
    if (!isAdmin) return;
    const code = await ensureGasCodeLoaded();
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopiedCode(true);
      onShowToast('Đã copy Code.gs');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const isConnectedSheet = Boolean(gasUrl.trim());
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [members]
  );
  const tripDateLabel = useMemo(
    () =>
      reportSourceConfig.startDate && reportSourceConfig.endDate
        ? formatDateRangeVN(reportSourceConfig.startDate, reportSourceConfig.endDate)
        : '',
    [reportSourceConfig.startDate, reportSourceConfig.endDate]
  );
  const canExportPdf =
    !exportingPdf &&
    (reportPreview.overview.expenseCount > 0 || reportPreview.overview.transferCount > 0);

  const handleCopyMemberAccount = async (m: Member) => {
    const cleanNo = String(m.accountNo || '')
      .replace(/\s+/g, '')
      .replace(/^'+/, '');
    if (!cleanNo) return;
    const ok = await copyToClipboard(cleanNo);
    if (ok) {
      setCopiedMemberId(m.id);
      onShowToast(`Đã copy STK: ${cleanNo}`);
      setTimeout(() => {
        setCopiedMemberId((prev) => (prev === m.id ? null : prev));
      }, 1600);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* ====================================================================
          CHẾ ĐỘ USER THÔNG THƯỜNG (!isAdmin): GỌN SẠCH, 0 NÚT CHẾT, 1 TRANG CUỘN
          ==================================================================== */}
      {!isAdmin ? (
        <>
          {/* Card 1: Tóm tắt chuyến đi & Tác vụ nhanh (Xuất PDF, Đồng bộ) */}
          <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3.5">
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight leading-snug">
                  {reportSourceConfig.tripName}
                </h2>
                <span
                  className={`text-[11px] font-bold shrink-0 inline-flex items-center gap-1 ${
                    reportSourceConfig.tripStatus === 'completed'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {reportSourceConfig.tripStatus === 'completed' ? (
                    <>
                      <Archive aria-hidden="true" className="w-3.5 h-3.5" />
                      <span>Đã khóa sổ</span>
                    </>
                  ) : (
                    <span>Đang mở</span>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                {reportSourceConfig.location && <span>{reportSourceConfig.location}</span>}
                {reportSourceConfig.location && tripDateLabel && <span aria-hidden="true">·</span>}
                {tripDateLabel && <span className="tabular-nums">{tripDateLabel}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-600 pt-0.5">
                <span className="tabular-nums">
                  <strong className="text-slate-900">{reportPreview.overview.expenseCount}</strong> khoản chi
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="tabular-nums">
                  <strong className="text-slate-900">{reportPreview.overview.memberCount}</strong> người
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-mono tabular-nums font-bold text-slate-900">
                  {formatVND(reportPreview.overview.totalExpenseAmount)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canExportPdf}
                onClick={handleExportPdfReport}
                className="flex-1 min-w-[140px] min-h-[44px] px-4 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
              >
                <FileDown
                  aria-hidden="true"
                  className={`w-4 h-4 shrink-0 ${exportingPdf ? 'animate-bounce' : ''}`}
                />
                <span>{exportingPdf ? 'Đang tạo PDF…' : 'Xuất PDF'}</span>
              </button>

              {isConnectedSheet && onReloadFromSheet && (
                <button
                  type="button"
                  onClick={onReloadFromSheet}
                  aria-label="Đồng bộ dữ liệu từ Google Sheet"
                  className="min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <RefreshCw aria-hidden="true" className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>Đồng bộ</span>
                </button>
              )}
            </div>

            {pdfExportError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="flex-1 min-w-[180px] font-medium">{pdfExportError}</span>
                <button
                  type="button"
                  onClick={handleExportPdfReport}
                  disabled={exportingPdf}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
                >
                  Thử lại
                </button>
              </div>
            )}
          </section>

          {/* Card 2: Danh bạ thành viên & Số tài khoản (hiển thị đầy đủ số, 1 chạm copy) */}
          <section className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Users aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
                <h3 className="text-xs font-bold text-slate-900 truncate">
                  Danh bạ &amp; Số tài khoản
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">
                {sortedMembers.length} thành viên
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {sortedMembers.map((m) => {
                const groupSize = getMemberGroupSize(m);
                const isCopied = copiedMemberId === m.id;
                return (
                  <div
                    key={m.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <MemberAvatar member={m} size="md" />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900">
                            {m.name}
                          </span>
                          {groupSize > 1 && (
                            <span className="text-[11px] font-semibold text-brand">
                              · Nhóm {groupSize} suất
                            </span>
                          )}
                        </div>
                        {m.accountNo ? (
                          <div className="text-xs text-slate-600 leading-snug break-all">
                            <strong className="font-mono tabular-nums font-bold text-slate-900 select-all">
                              {m.accountNo}
                            </strong>
                            {m.bankName && (
                              <span className="text-slate-500"> · {m.bankName}</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">
                            {groupSize > 1
                              ? `Tự động tính ${groupSize} phần · Quyết toán ÷${groupSize}`
                              : 'Chưa cập nhật STK'}
                          </div>
                        )}
                      </div>
                    </div>

                    {m.accountNo && (
                      <button
                        type="button"
                        onClick={() => void handleCopyMemberAccount(m)}
                        aria-label={`Copy STK ${m.name}`}
                        className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isCopied
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        {isCopied ? (
                          <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <Copy aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{isCopied ? 'Đã copy' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Card 3: Quản trị chuyến đi (Admin) — thu gọn 1 dòng, bấm mới xổ ô PIN full-width */}
          <section className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Lock aria-hidden="true" className="w-4 h-4 text-slate-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    Quản trị chuyến đi (Admin)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Thành viên, khóa sổ &amp; tạo chuyến mới
                  </div>
                </div>
              </div>

              <button
                type="button"
                aria-expanded={showAdminLogin}
                onClick={() => setShowAdminLogin((prev) => !prev)}
                className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <span>{showAdminLogin ? 'Đóng' : 'Mở khóa'}</span>
                {showAdminLogin ? (
                  <ChevronUp aria-hidden="true" className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>
            </div>

            {showAdminLogin && (
              <form
                onSubmit={handleVerifyPin}
                autoComplete="off"
                className="px-4 pb-4 pt-3 border-t border-slate-100 flex items-center gap-2"
              >
                <div className="relative flex-1 min-w-0 flex items-center">
                  <input
                    type={showPinText ? 'text' : 'password'}
                    name="trip_admin_pin_code"
                    maxLength={20}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    spellCheck={false}
                    autoFocus
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder={isConnectedSheet ? 'Nhập mã PIN Admin…' : 'Nhập PIN Demo (1234)…'}
                    aria-label="PIN Admin"
                    className="w-full min-h-[44px] pl-3.5 pr-10 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono text-slate-900 focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinText((prev) => !prev)}
                    aria-label={showPinText ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
                    title={showPinText ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
                    className="absolute right-1 w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    {showPinText ? (
                      <EyeOff aria-hidden="true" className="w-4 h-4" />
                    ) : (
                      <Eye aria-hidden="true" className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={verifyingPin || !pinInput.trim()}
                  className="min-h-[44px] px-4 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {verifyingPin ? 'Đang mở…' : 'Xác nhận'}
                </button>
              </form>
            )}
          </section>
        </>
      ) : (
        /* ====================================================================
           CHẾ ĐỘ QUẢN TRỊ (isAdmin): THANH ADMIN TRÊN CÙNG + 3 SUB-TAB ĐẦY ĐỦ
           ==================================================================== */
        <>
          {/* Thanh trạng thái Admin cố định trên cùng: Đổi PIN & Khóa từ mọi sub-tab */}
          <section className="p-3.5 rounded-2xl bg-white border-2 border-brand shadow-md shadow-brand/5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Unlock aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-900">Chế độ Admin</span>
                  <span className="text-xs text-slate-400"> · </span>
                  <span className="text-xs text-slate-600 font-medium truncate">
                    {config.tripName}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowChangePin(!showChangePin)}
                  aria-expanded={showChangePin}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <KeyRound aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>Đổi PIN</span>
                </button>
                <button
                  type="button"
                  onClick={onLockAdmin}
                  className="min-h-[38px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Lock aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>Khóa Admin</span>
                </button>
              </div>
            </div>

            {showChangePin && (
              <form
                onSubmit={handleSaveNewPin}
                className="pt-2.5 border-t border-slate-100 flex items-center gap-2"
              >
                <input
                  type="password"
                  name="oldPin"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="PIN cũ"
                  value={oldPinInput}
                  onChange={(e) => setOldPinInput(e.target.value)}
                  placeholder="PIN cũ…"
                  className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
                />
                <input
                  type="password"
                  name="newPin"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="PIN mới"
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="PIN mới…"
                  className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
                >
                  Lưu
                </button>
              </form>
            )}
          </section>

          {/* Sub-nav 3 mục quản trị */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-xl">
            {(
              [
                { id: 'members', label: 'Thành viên', icon: Users },
                { id: 'trip', label: 'Chuyến đi', icon: FolderKanban },
                { id: 'system', label: 'Hệ thống', icon: Cloud },
              ] as const
            ).map((sec) => {
              const Icon = sec.icon;
              const active = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveSection(sec.id)}
                  className={`min-h-[40px] px-2.5 py-1 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-brand shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{sec.label}</span>
                </button>
              );
            })}
          </div>

          {/* ADMIN TAB 1: THÀNH VIÊN & STK */}
          {activeSection === 'members' && (
            <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    name="newMemberName"
                    maxLength={50}
                    autoComplete="off"
                    aria-label="Tên thành viên mới"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMember();
                      }
                    }}
                    placeholder='Thêm tên hoặc gộp nhóm (VD: "10 thành viên", "5 mem")…'
                    className="flex-1 min-w-0 min-h-[42px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleAddMember}
                    className="min-h-[42px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    <Plus aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Thêm</span>
                  </button>
                </div>
                {parseMemberGroupSize(newMemberName) > 1 ? (
                  <div className="px-1 text-[11px] font-semibold text-brand">
                    Nhận diện nhóm gộp: tự động chia{' '}
                    <strong>{parseMemberGroupSize(newMemberName)} suất/phần</strong> và chia đều khi
                    quyết toán.
                  </div>
                ) : (
                  <div className="px-1 text-[11px] text-slate-500">
                    Mẹo gộp nhóm: đặt tên bắt đầu bằng số (VD: &ldquo;10 thành viên&rdquo;, &ldquo;5
                    mem&rdquo;) để tự động gán số suất &amp; chia đều khi chốt tiền.
                  </div>
                )}
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden">
                {sortedMembers.map((m) => {
                  const isEditingThis = editingMemberId === m.id && memForm;
                  const usedInExpenses = isMemberUsed(m.id);
                  const groupSize = getMemberGroupSize(m);
                  return (
                    <div key={m.id} className="p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <MemberAvatar member={m} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {m.name}
                              </span>
                              {groupSize > 1 && (
                                <span className="text-[11px] font-semibold text-brand shrink-0">
                                  · Nhóm {groupSize} suất
                                </span>
                              )}
                            </div>
                            {m.accountNo ? (
                              <div className="text-[11px] text-slate-600 font-mono tabular-nums break-all">
                                <strong className="text-slate-900 select-all">{m.accountNo}</strong>
                                {m.bankName ? ` · ${m.bankName}` : ''}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400">
                                {groupSize > 1
                                  ? `Tự động tính ${groupSize} phần · Quyết toán ÷${groupSize}`
                                  : 'Chưa có STK'}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {m.accountNo && (
                            <button
                              type="button"
                              onClick={() => void handleCopyMemberAccount(m)}
                              aria-label={`Copy STK ${m.name}`}
                              title="Copy STK"
                              className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              {copiedMemberId === m.id ? (
                                <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              isEditingThis ? setEditingMemberId(null) : startEditMember(m)
                            }
                            title="Sửa tên & STK"
                            className="min-h-[36px] px-2.5 rounded-xl bg-brand-soft hover:bg-brand-border/50 text-brand text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <CreditCard aria-hidden="true" className="w-3.5 h-3.5" />
                            <span>{isEditingThis ? 'Đóng' : 'STK'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteMember(m)}
                            aria-label={`Xóa ${m.name}`}
                            title={usedInExpenses ? 'Thành viên đã có chi tiêu' : `Xóa ${m.name}`}
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                              usedInExpenses
                                ? 'border-slate-200 text-slate-300 hover:bg-slate-50'
                                : 'border-rose-200 hover:bg-rose-50 text-rose-600'
                            }`}
                          >
                            <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isEditingThis && memForm && (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input
                            type="text"
                            name="memberName"
                            maxLength={50}
                            autoComplete="off"
                            aria-label="Tên thành viên"
                            value={memForm.name}
                            onChange={(e) => setMemForm({ ...memForm, name: e.target.value })}
                            placeholder="Tên thành viên…"
                            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold"
                          />
                          <input
                            type="text"
                            name="accountNo"
                            maxLength={30}
                            inputMode="text"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Số tài khoản"
                            value={memForm.accountNo}
                            onChange={(e) =>
                              setMemForm({
                                ...memForm,
                                accountNo: e.target.value.replace(/\s+/g, '').replace(/^'+/, ''),
                              })
                            }
                            placeholder="Số tài khoản (giữ số 0 đầu)…"
                            className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold"
                          />
                          <div>
                            <input
                              type="text"
                              name="bankName"
                              maxLength={40}
                              autoComplete="off"
                              spellCheck={false}
                              aria-label="Ngân hàng (tùy chọn)"
                              list="vn-banks-datalist"
                              value={memForm.bankName}
                              onChange={(e) =>
                                setMemForm({ ...memForm, bankName: e.target.value })
                              }
                              placeholder="Ngân hàng (tùy chọn)…"
                              className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white text-xs"
                            />
                            <datalist id="vn-banks-datalist">
                              {BANK_LIST.map((b) => (
                                <option key={b} value={b} />
                              ))}
                            </datalist>
                          </div>
                          <div className="sm:col-span-3 flex justify-end gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setEditingMemberId(null)}
                              className="min-h-[36px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveMember}
                              className="min-h-[36px] px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Save aria-hidden="true" className="w-3.5 h-3.5" />
                              <span>Lưu</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ADMIN TAB 2: CHUYẾN ĐI, LƯU TRỮ, TRA CỨU, DANH MỤC & XUẤT PDF */}
          {activeSection === 'trip' && (
            <div className="space-y-4">
              {/* Thông tin chuyến đi & khóa sổ */}
              <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    name="tripName"
                    maxLength={80}
                    autoComplete="off"
                    aria-label="Tên chuyến đi"
                    value={cfgForm.tripName}
                    onChange={(e) => setCfgForm({ ...cfgForm, tripName: e.target.value })}
                    placeholder="Tên chuyến đi…"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold"
                  />
                  <input
                    type="text"
                    name="tripId"
                    maxLength={32}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Mã chuyến đi"
                    value={cfgForm.tripId}
                    onChange={(e) => setCfgForm({ ...cfgForm, tripId: e.target.value.toUpperCase() })}
                    placeholder="Mã trip (VD: HN-2026)…"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono font-bold text-slate-800"
                  />
                  <input
                    type="text"
                    name="location"
                    maxLength={80}
                    autoComplete="off"
                    aria-label="Địa điểm"
                    value={cfgForm.location}
                    onChange={(e) => setCfgForm({ ...cfgForm, location: e.target.value })}
                    placeholder="Địa điểm…"
                    className="w-full sm:col-span-2 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold"
                  />
                  <input
                    type="date"
                    name="startDate"
                    aria-label="Ngày bắt đầu"
                    value={cfgForm.startDate}
                    onChange={(e) => setCfgForm({ ...cfgForm, startDate: e.target.value })}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
                  />
                  <input
                    type="date"
                    name="endDate"
                    aria-label="Ngày kết thúc"
                    value={cfgForm.endDate}
                    onChange={(e) => setCfgForm({ ...cfgForm, endDate: e.target.value })}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'equal', label: 'Chia đều' },
                        { id: 'shares', label: 'Theo suất' },
                        { id: 'exact', label: 'Nhập số' },
                      ] as const
                    ).map((m) => {
                      const enabled = cfgForm.enabledSplitModes?.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={enabled}
                          onClick={() => handleToggleSplitMode(m.id)}
                          className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                            enabled
                              ? 'bg-brand-soft border-brand text-brand'
                              : 'bg-white border-slate-200 text-slate-500'
                          }`}
                        >
                          {enabled && <Check aria-hidden="true" className="w-3 h-3" />}
                          <span>{m.label}</span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      aria-pressed={cfgForm.tripStatus === 'completed'}
                      onClick={() => {
                        const nextStatus =
                          cfgForm.tripStatus === 'completed' ? 'active' : 'completed';
                        setCfgForm({
                          ...cfgForm,
                          tripStatus: nextStatus,
                        });
                        if (nextStatus === 'active') {
                          setConfirmLockWithPending(false);
                        }
                      }}
                      className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                        cfgForm.tripStatus === 'completed'
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <Archive aria-hidden="true" className="w-3 h-3" />
                      <span>{cfgForm.tripStatus === 'completed' ? 'Đã khóa sổ' : 'Đang mở'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSaveTripConfig(false)}
                    className="min-h-[38px] px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Save aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Lưu</span>
                  </button>
                </div>

                {confirmLockWithPending && pendingSyncCount > 0 && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2"
                  >
                    <div className="font-bold">
                      Cảnh báo: Còn {pendingSyncCount} khoản chi chưa đồng bộ lên Google Sheet!
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      Khi chuyến đi đã khóa sổ, mọi thao tác ghi mới sẽ bị chặn. Bạn nên đồng bộ hết các giao dịch đang chờ trước khi khóa sổ. Dữ liệu trong hàng đợi sẽ được giữ nguyên, không bị xóa.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {onSyncNow && (
                        <button
                          type="button"
                          disabled={isSyncing}
                          onClick={async () => {
                            await onSyncNow();
                            setConfirmLockWithPending(false);
                          }}
                          className="min-h-[36px] px-3 py-1 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold transition-colors cursor-pointer"
                        >
                          {isSyncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay trước khi khóa'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSaveTripConfig(true)}
                        className="min-h-[36px] px-3 py-1 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold transition-colors cursor-pointer"
                      >
                        Vẫn khóa sổ (giữ hàng đợi)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmLockWithPending(false);
                          setCfgForm({ ...cfgForm, tripStatus: 'active' });
                        }}
                        className="min-h-[36px] px-3 py-1 rounded-xl border border-amber-300 bg-white text-amber-900 font-semibold cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Lưu trữ chuyến hiện tại & Tạo chuyến đi mới */}
              <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderPlus aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        Lưu trữ &amp; Tạo chuyến đi mới
                      </h3>
                      <p className="text-[11px] text-slate-500 truncate tabular-nums">
                        Chuyến hiện tại: <strong className="font-mono text-slate-700">{config.tripId || 'TRIP'}</strong> · {activeExpenseCount} khoản chi
                      </p>
                    </div>
                  </div>

                  {!showNewTripForm && (
                    <button
                      type="button"
                      onClick={openNewTripForm}
                      className="min-h-[38px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <Archive aria-hidden="true" className="w-3.5 h-3.5" />
                      <span>Lưu trữ &amp; Tạo mới</span>
                    </button>
                  )}
                </div>

                {!showNewTripForm && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Sao lưu 100% khoản chi chuyến cũ sang tab <span className="font-mono font-semibold text-slate-700">Archive_*</span> + mục lục <span className="font-mono font-semibold text-slate-700">Archives</span> trên cùng Google Sheet, rồi mở chuyến đi mới sạch sẽ (giữ lại được thành viên &amp; STK cũ).
                  </p>
                )}

                {showNewTripForm && (
                  <form
                    onSubmit={handleConfirmArchiveAndNewTrip}
                    className="pt-3 border-t border-slate-100 space-y-3"
                  >
                    {pendingSyncCount > 0 && (
                      <div
                        role="alert"
                        className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2"
                      >
                        <div className="font-bold">
                          Còn {pendingSyncCount} khoản chi chưa đồng bộ lên Google Sheet.
                        </div>
                        <p className="text-[11px] text-amber-900">
                          Hãy đồng bộ hết lên Google Sheet trước khi lưu trữ để đảm bảo không bỏ sót khoản chi nào.
                        </p>
                        {onSyncNow && (
                          <button
                            type="button"
                            disabled={isSyncing}
                            onClick={() => onSyncNow()}
                            className="min-h-[34px] px-3 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold cursor-pointer"
                          >
                            {isSyncing ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Mã lưu trữ chuyến cũ (dùng để tra cứu lại sau này)
                      </label>
                      <input
                        type="text"
                        name="archiveCode"
                        maxLength={32}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Mã lưu trữ chuyến cũ"
                        value={archiveCodeInput}
                        onChange={(e) => setArchiveCodeInput(e.target.value.toUpperCase())}
                        placeholder="VD: HN-2026"
                        className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white font-mono text-xs font-bold text-brand"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        name="newTripName"
                        maxLength={80}
                        autoComplete="off"
                        required
                        aria-label="Tên chuyến đi mới"
                        value={newTripName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewTripName(val);
                          if (!newTripIdTouched) {
                            setNewTripId(val.trim() ? normalizeTripCode(val) : '');
                          }
                        }}
                        placeholder="Tên chuyến đi mới (VD: Đà Lạt 2026)…"
                        className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold"
                      />
                      <input
                        type="text"
                        name="newTripId"
                        maxLength={32}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Mã chuyến đi mới"
                        value={newTripId}
                        onChange={(e) => {
                          setNewTripIdTouched(true);
                          setNewTripId(e.target.value.toUpperCase());
                        }}
                        placeholder="Mã chuyến mới (VD: DA-LAT-2026)…"
                        className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white font-mono text-xs font-bold"
                      />
                      <input
                        type="text"
                        name="newLocation"
                        maxLength={80}
                        autoComplete="off"
                        aria-label="Địa điểm chuyến đi mới"
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder="Địa điểm mới (tùy chọn)…"
                        className="w-full sm:col-span-2 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs"
                      />
                      <input
                        type="date"
                        name="newStartDate"
                        aria-label="Ngày bắt đầu chuyến mới"
                        value={newStartDate}
                        onChange={(e) => setNewStartDate(e.target.value)}
                        className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
                      />
                      <input
                        type="date"
                        name="newEndDate"
                        aria-label="Ngày kết thúc chuyến mới"
                        value={newEndDate}
                        onChange={(e) => setNewEndDate(e.target.value)}
                        className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-2 pt-0.5">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={keepMembers}
                          onChange={(e) => setKeepMembers(e.target.checked)}
                          className="w-4 h-4 rounded accent-brand"
                        />
                        <span>Giữ nguyên danh sách thành viên &amp; STK hiện tại ({members.length} mục)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={keepCategories}
                          onChange={(e) => setKeepCategories(e.target.checked)}
                          className="w-4 h-4 rounded accent-brand"
                        />
                        <span>Giữ nguyên danh mục chi tiêu hiện tại</span>
                      </label>
                    </div>

                    {newTripError && (
                      <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                        {newTripError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={creatingNewTrip}
                        onClick={() => {
                          setShowNewTripForm(false);
                          setNewTripError('');
                        }}
                        className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={creatingNewTrip || pendingSyncCount > 0 || !newTripName.trim()}
                        className="min-h-[38px] px-4 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Archive aria-hidden="true" className="w-3.5 h-3.5" />
                        <span>{creatingNewTrip ? 'Đang lưu trữ…' : 'Xác nhận lưu trữ & tạo mới'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </section>

              {/* Tra cứu chuyến đi đã lưu trữ theo mã trip */}
              <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Search aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
                    <h3 className="text-xs font-bold text-slate-900 truncate">
                      Tra cứu chuyến đi đã lưu trữ
                    </h3>
                  </div>
                  <button
                    type="button"
                    disabled={loadingArchives}
                    onClick={() => void loadArchivesList()}
                    aria-label="Tải lại danh sách chuyến lưu trữ"
                    title="Tải lại danh sách"
                    className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={`w-3.5 h-3.5 ${loadingArchives ? 'animate-spin' : ''}`}
                    />
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleOpenArchiveCode(archiveSearchCode);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    name="archiveSearchCode"
                    maxLength={40}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Nhập mã chuyến đi cũ"
                    value={archiveSearchCode}
                    onChange={(e) => {
                      setArchiveSearchCode(e.target.value);
                      setArchiveLookupError('');
                    }}
                    placeholder="Nhập mã chuyến đi (VD: HN-2026)…"
                    className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white font-mono text-xs font-semibold"
                  />
                  <button
                    type="submit"
                    disabled={!archiveSearchCode.trim() || Boolean(openingArchiveCode)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    {openingArchiveCode === archiveSearchCode.trim() ? 'Đang mở…' : 'Xem chuyến cũ'}
                  </button>
                </form>

                {archiveLookupError && (
                  <div role="alert" className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium leading-relaxed">
                    {archiveLookupError}
                  </div>
                )}

                {archivedTrips.length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden">
                    {archivedTrips.map((item) => {
                      const isViewingThis = viewingArchive?.summary.archiveCode === item.archiveCode;
                      const dateLabel =
                        item.startDate && item.endDate
                          ? formatDateRangeVN(item.startDate, item.endDate)
                          : item.archivedAt.slice(0, 10);
                      return (
                        <div
                          key={`${item.archiveCode}_${item.expenseSheetName}`}
                          className={`p-3 flex items-center justify-between gap-2 text-xs ${
                            isViewingThis ? 'bg-brand-soft/60' : 'bg-white'
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span className="font-mono text-[11px] font-bold text-brand">
                                {item.archiveCode}
                              </span>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="font-bold text-slate-900 truncate">
                                {item.tripName}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-1.5 tabular-nums">
                              {dateLabel && <span>{dateLabel}</span>}
                              {dateLabel && <span aria-hidden="true">·</span>}
                              <span>{item.expenseCount} khoản</span>
                              {item.totalExpense > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono font-semibold text-slate-700">
                                    {formatVND(item.totalExpense)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await copyToClipboard(item.archiveCode);
                                if (ok) onShowToast(`Đã copy mã trip: ${item.archiveCode}`);
                              }}
                              aria-label={`Copy mã ${item.archiveCode}`}
                              title="Copy mã trip"
                              className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                            </button>

                            {isViewingThis && onExitArchive ? (
                              <button
                                type="button"
                                onClick={onExitArchive}
                                className="min-h-[36px] px-3 rounded-xl bg-slate-900 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                              >
                                Thoát xem
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(openingArchiveCode)}
                                onClick={() => void handleOpenArchiveCode(item.archiveCode)}
                                className="min-h-[36px] px-3 rounded-xl bg-brand-soft hover:bg-brand-border/50 text-brand text-xs font-bold whitespace-nowrap transition-colors cursor-pointer"
                              >
                                {openingArchiveCode === item.archiveCode ? 'Mở…' : 'Xem'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 px-1">
                    {loadingArchives
                      ? 'Đang tải danh sách chuyến đi đã lưu trữ…'
                      : 'Chưa có chuyến đi nào được lưu trữ.'}
                  </div>
                )}
              </section>

              {/* Danh mục chi tiêu (đồng bộ bo góc rounded-xl) */}
              <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    name="newCategoryName"
                    autoComplete="off"
                    aria-label="Tên danh mục mới"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Thêm danh mục…"
                    className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs"
                  />
                  <div className="relative flex items-center">
                    <select
                      name="newCategoryIcon"
                      aria-label="Biểu tượng danh mục"
                      value={newCatIcon}
                      onChange={(e) => setNewCatIcon(e.target.value)}
                      className="min-h-[40px] pl-3 pr-7 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-medium appearance-none"
                    >
                      <option value="Plane">Vé</option>
                      <option value="Car">Xe</option>
                      <option value="Utensils">Ăn</option>
                      <option value="Hotel">Ở</option>
                      <option value="Ticket">Vé chơi</option>
                      <option value="Package">Khác</option>
                    </select>
                    <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2" />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="min-h-[40px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    <Plus aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Thêm</span>
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden">
                  {sortCategoriesTailOrder(categories).map((cat) => {
                    const used = isCategoryUsed(cat.id);
                    const IconComp = CATEGORY_ICON_MAP[cat.icon] || Package;
                    return (
                      <div
                        key={cat.id}
                        className="p-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span aria-hidden="true" className="shrink-0">
                            <IconComp className="w-3.5 h-3.5 text-brand" />
                          </span>
                          <span
                            className={`font-semibold truncate ${
                              cat.hidden ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {cat.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleCategoryHidden(cat)}
                            aria-label={cat.hidden ? `Hiện ${cat.name}` : `Ẩn ${cat.name}`}
                            className="w-9 h-9 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                            title={cat.hidden ? 'Hiện' : 'Ẩn'}
                          >
                            {cat.hidden ? (
                              <Eye aria-hidden="true" className="w-3.5 h-3.5" />
                            ) : (
                              <EyeOff aria-hidden="true" className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {!used && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCategory(cat)}
                              aria-label={`Xóa ${cat.name}`}
                              className="w-9 h-9 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                              title="Xóa"
                            >
                              <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Xuất PDF (1 chỗ duy nhất trong tab Chuyến đi khi là Admin) */}
              <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileDown aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
                    <h3 className="text-xs font-bold text-slate-900 truncate">
                      {viewingArchive
                        ? `Xuất PDF (Lưu trữ: ${viewingArchive.summary.archiveCode})`
                        : 'Xuất báo cáo chi tiêu'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    disabled={!canExportPdf}
                    onClick={handleExportPdfReport}
                    className="min-h-[38px] px-4 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                  >
                    <FileDown
                      aria-hidden="true"
                      className={`w-3.5 h-3.5 ${exportingPdf ? 'animate-bounce' : ''}`}
                    />
                    <span>{exportingPdf ? 'Đang tải & tạo PDF…' : 'Xuất PDF'}</span>
                  </button>
                </div>

                {pdfExportError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="flex-1 min-w-[200px] font-medium">{pdfExportError}</span>
                    <button
                      type="button"
                      onClick={handleExportPdfReport}
                      disabled={exportingPdf}
                      className="min-h-[34px] px-3 py-1 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
                    >
                      Thử lại
                    </button>
                  </div>
                )}

                <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-600 tabular-nums">
                  <span>
                    Khoản chi: <strong className="font-mono text-slate-900">{reportPreview.overview.expenseCount}</strong> khoản ({reportPreview.overview.memberCount} người)
                  </span>
                  <span className="font-mono">
                    Tổng chi tiêu: <strong className="text-slate-900">{formatVND(reportPreview.overview.totalExpenseAmount)}</strong>
                  </span>
                </div>
              </section>
            </div>
          )}

          {/* ADMIN TAB 3: HỆ THỐNG (GOOGLE SHEET, CODE.GS, RESET, LỊCH SỬ) */}
          {activeSection === 'system' && (
            <div className="space-y-4">
              <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isConnectedSheet ? (
                      <Cloud aria-hidden="true" className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <CloudOff aria-hidden="true" className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-slate-900">
                      {isConnectedSheet ? 'Google Sheet: Đã kết nối' : 'Google Sheet: Chưa kết nối'}
                    </span>
                  </div>

                  {isConnectedSheet && onReloadFromSheet && (
                    <button
                      type="button"
                      onClick={onReloadFromSheet}
                      title="Tải lại từ Sheet"
                      className="min-h-[38px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
                      <span>Đồng bộ</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 pt-2.5 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      name="gasUrl"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Google Apps Script Web App URL"
                      value={gasUrlInput}
                      onChange={(e) => setGasUrlInput(e.target.value)}
                      placeholder="https://script.google.com/macros/s/…/exec"
                      className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white font-mono text-xs text-slate-900"
                    />
                    <button
                      type="button"
                      disabled={!gasUrlInput.trim() || testingSheet}
                      onClick={async () => {
                        setTestingSheet(true);
                        try {
                          onSaveGasUrl(gasUrlInput);
                          await onTestAndInitSheet(gasUrlInput);
                        } finally {
                          setTestingSheet(false);
                        }
                      }}
                      className="min-h-[40px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${testingSheet ? 'animate-spin' : ''}`} />
                      <span>Lưu URL</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyCodeGs}
                      className="min-h-[36px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedCode ? (
                        <Check aria-hidden="true" className="w-3.5 h-3.5" />
                      ) : (
                        <Code2 aria-hidden="true" className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedCode ? 'Đã copy' : 'Copy Code.gs'}</span>
                    </button>

                    <button
                      type="button"
                      aria-expanded={showRawCodeGs}
                      onClick={async () => {
                        if (!showRawCodeGs) {
                          await ensureGasCodeLoaded();
                        }
                        setShowRawCodeGs((prev) => !prev);
                      }}
                      className="min-h-[36px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                    >
                      {showRawCodeGs ? 'Ẩn Code.gs' : 'Xem Code.gs'}
                    </button>

                    {!confirmResetDemo ? (
                      <button
                        type="button"
                        onClick={() => setConfirmResetDemo(true)}
                        className="min-h-[36px] px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
                        <span>Reset mẫu</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmResetDemo(false);
                            onResetDemoData();
                          }}
                          className="min-h-[36px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          Xác nhận
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetDemo(false)}
                          className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs transition-colors cursor-pointer"
                        >
                          Hủy
                        </button>
                      </div>
                    )}
                  </div>

                  {showRawCodeGs && (
                    <pre className="p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-60 border border-slate-800 select-all">
                      <code>{loadedCodeGs}</code>
                    </pre>
                  )}
                </div>
              </section>

              {/* Lịch sử thay đổi thu gọn (Chỉ Admin) */}
              <section className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
                <button
                  type="button"
                  aria-expanded={showHistory}
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span>Lịch sử thay đổi ({history.length})</span>
                  {showHistory ? (
                    <ChevronUp aria-hidden="true" className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown aria-hidden="true" className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showHistory && (
                  <div className="px-3.5 pb-3.5 border-t border-slate-100 divide-y divide-slate-100 text-xs max-h-60 overflow-y-auto overscroll-contain">
                    {history.length === 0 ? (
                      <div className="text-slate-500 py-2">Chưa có lịch sử ghi nhận.</div>
                    ) : (
                      history.slice(0, 20).map((h, idx) => (
                        <div
                          key={`${h.timestamp}_${idx}`}
                          className="py-1.5 flex items-center justify-between gap-2"
                        >
                          <div className="truncate">
                            <span className="font-bold text-slate-900">{h.action}</span>
                            <span className="text-slate-500"> · {h.entityType} </span>
                            <span className="font-mono font-semibold text-brand">#{h.rev}</span>
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                            {h.timestamp.slice(5, 16)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {/* Footer thương hiệu tinh gọn (1 nơi duy nhất ở cuối trang) */}
      <footer className="px-2 pt-1 pb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <img
            src="/icon.svg"
            alt={APP_NAME}
            className="w-4 h-4 rounded-sm opacity-90 shrink-0"
          />
          <span className="font-semibold text-slate-500">{APP_NAME}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono select-all">{APP_VERSION}</span>
        </div>
        <span>
          {isConnectedSheet ? 'Đã kết nối Google Sheet' : 'Chế độ dùng thử cục bộ'}
        </span>
      </footer>
    </div>
  );
});



