import React, { useEffect, useMemo, useState } from 'react';
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
  KeyRound,
  Link2,
  Lock,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import {
  APP_NAME,
  APP_VERSION,
  AVATAR_COLORS,
  BANK_LIST,
  GOOGLE_APPS_SCRIPT_CODE,
  sortCategoriesTailOrder,
} from '../config';
import { buildShareableTripUrl } from '../services/syncService';
import type {
  Category,
  ExpenseRecord,
  HistoryEntry,
  Member,
  SplitMode,
  TripConfig,
} from '../types';
import { copyToClipboard, formatVND, generateUUID } from '../utils/format';
import { buildExpenseReportData, exportExpenseReportPdf } from '../utils/pdfReport';
import { MemberAvatar } from './MemberAvatar';
import { CATEGORY_ICON_MAP } from './OverviewTab';

interface SettingsTabProps {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
  history: HistoryEntry[];
  isAdmin: boolean;
  adminPin: string;
  gasUrl: string;
  simulateOffline: boolean;
  onUnlockAdmin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onLockAdmin: () => void;
  onChangeAdminPin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
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

export const SettingsTab: React.FC<SettingsTabProps> = ({
  config,
  members,
  categories,
  expenses,
  history,
  isAdmin,
  gasUrl,
  simulateOffline,
  onUnlockAdmin,
  onLockAdmin,
  onChangeAdminPin,
  onUpdateMembers,
  onUpdateCategories,
  onUpdateConfig,
  onSaveGasUrl,
  onTestAndInitSheet,
  onReloadFromSheet,
  onToggleSimulateOffline,
  onTriggerDemoConflict,
  onResetDemoData,
  onShowToast,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('members');

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

  const [gasUrlInput, setGasUrlInput] = useState<string>(gasUrl);
  const [testingSheet, setTestingSheet] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false);
  const [showRawCodeGs, setShowRawCodeGs] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [confirmResetDemo, setConfirmResetDemo] = useState<boolean>(false);

  const [reportFilterMemberId, setReportFilterMemberId] = useState<string>('all');
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);

  const reportPreview = useMemo(
    () =>
      buildExpenseReportData({
        config,
        members,
        categories,
        expenses,
        filterMemberId: reportFilterMemberId,
      }),
    [config, members, categories, expenses, reportFilterMemberId]
  );

  const handleExportPdfReport = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportExpenseReportPdf(reportPreview);
      onShowToast('Đã xuất báo cáo PDF');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tạo file PDF';
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

  useEffect(() => {
    if (!isAdmin) {
      setEditingMemberId(null);
      setMemForm(null);
      setShowChangePin(false);
      setConfirmResetDemo(false);
      setShowRawCodeGs(false);
    }
  }, [isAdmin]);

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
    const next = members
      .map((m) =>
        m.id === memForm.id
          ? {
              ...memForm,
              name: memForm.name.trim(),
              bankName: memForm.bankName.trim(),
              accountNo: memForm.accountNo.replace(/\s+/g, ''),
              accountHolder: memForm.accountHolder.trim().toUpperCase(),
            }
          : m
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    await onUpdateMembers(next);
    setEditingMemberId(null);
    setMemForm(null);
    onShowToast(`Đã lưu ${memForm.name}`);
  };

  const handleAddMember = async () => {
    if (!isAdmin) return;
    const cleanName = newMemberName.trim();
    if (!cleanName) return;
    const nextColor = AVATAR_COLORS[members.length % AVATAR_COLORS.length];
    const newMem: Member = {
      id: `mem_${generateUUID().slice(0, 8)}`,
      name: cleanName,
      avatarColor: nextColor,
      defaultWeight: 1,
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
    onShowToast(`+${cleanName}`);
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

  const handleSaveTripConfig = async () => {
    if (!isAdmin) return;
    await onUpdateConfig(cfgForm);
    onShowToast('Đã lưu');
  };

  const handleCopyCodeGs = async () => {
    if (!isAdmin) return;
    const ok = await copyToClipboard(GOOGLE_APPS_SCRIPT_CODE);
    if (ok) {
      setCopiedCode(true);
      onShowToast('Đã copy Code.gs');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyInviteLink = async () => {
    const activeUrl = gasUrlInput.trim() || gasUrl.trim();
    const shareUrl = buildShareableTripUrl(activeUrl);
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopiedShareLink(true);
      onShowToast('Đã copy link mời!');
      setTimeout(() => setCopiedShareLink(false), 2000);
    }
  };

  const isConnectedSheet = Boolean(gasUrl.trim());

  return (
    <div className="space-y-3.5">
      {/* Header thương hiệu tại thẻ Cài đặt: Logo Pin-T + Tên app + Phiên bản (1 nơi duy nhất) */}
      <div className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/icon.svg"
            alt={APP_NAME}
            className="w-8 h-8 rounded-lg shrink-0 shadow-2xs"
          />
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-extrabold text-slate-900 tracking-tight">
              {APP_NAME}
            </span>
            <span className="text-[11px] text-slate-400 font-medium truncate">
              {config.tripName}
            </span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-brand-soft border border-brand-border/60 font-mono text-[11px] font-bold text-brand select-all shrink-0">
          {APP_VERSION}
        </span>
      </div>

      {/* Top Bar: Sub-nav 3 mục (Mã PIN chỉ hiện trong mục Hệ thống) */}
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
              className={`min-h-[38px] px-2.5 py-1 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-white text-brand shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{sec.label}</span>
              {sec.id === 'system' && (
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isConnectedSheet ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: THÀNH VIÊN & STK */}
      {activeSection === 'members' && (
        <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
          {/* Thêm thành viên (Cần mở PIN ở mục Hệ thống) */}
          <div
            className={`flex items-center gap-2 ${
              !isAdmin ? 'opacity-40 pointer-events-none select-none' : ''
            }`}
          >
            <input
              type="text"
              name="newMemberName"
              autoComplete="off"
              aria-label="Tên thành viên mới"
              disabled={!isAdmin}
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddMember();
                }
              }}
              placeholder="Thêm thành viên…"
              className="flex-1 min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-medium"
            />
            <button
              type="button"
              disabled={!isAdmin}
              onClick={handleAddMember}
              className="min-h-[38px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
            >
              <Plus aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Thêm</span>
            </button>
          </div>

          {/* Danh sách thành viên */}
          <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden">
            {[...members]
              .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
              .map((m) => {
                const isEditingThis = isAdmin && editingMemberId === m.id && memForm;
                const usedInExpenses = isMemberUsed(m.id);
                return (
                  <div key={m.id} className="p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <MemberAvatar member={m} size="md" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {m.name}
                          </div>
                          {m.bankName && m.accountNo ? (
                            <div className="text-[11px] text-slate-600 font-mono truncate">
                              {m.bankName} · <strong className="text-slate-800">{m.accountNo}</strong>
                              {m.accountHolder ? ` · ${m.accountHolder}` : ''}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500">—</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Nút Copy STK cho user bình thường */}
                        {m.accountNo && (
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyToClipboard(m.accountNo);
                              if (ok) onShowToast(`Đã copy: ${m.accountNo}`);
                            }}
                            aria-label={`Copy STK ${m.name}`}
                            title="Copy STK"
                            className="w-8 h-8 rounded-sm border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors"
                          >
                            <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Nút sửa thông tin & STK thành viên (Chỉ Admin) */}
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() =>
                            isEditingThis ? setEditingMemberId(null) : startEditMember(m)
                          }
                          title={isAdmin ? 'Sửa tên & STK' : 'Cần mở PIN ở mục Hệ thống'}
                          className={`min-h-[32px] px-2.5 rounded-sm bg-brand-soft hover:bg-brand-border/50 text-brand text-xs font-bold flex items-center gap-1 transition-colors ${
                            !isAdmin ? 'opacity-40 pointer-events-none select-none' : ''
                          }`}
                        >
                          <CreditCard aria-hidden="true" className="w-3.5 h-3.5" />
                          <span>{isEditingThis ? 'Đóng' : 'STK'}</span>
                        </button>

                        {/* Nút xóa thành viên (Chỉ Admin) */}
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => handleDeleteMember(m)}
                          aria-label={`Xóa ${m.name}`}
                          title={
                            !isAdmin
                              ? 'Cần mở PIN ở mục Hệ thống'
                              : usedInExpenses
                              ? 'Thành viên đã có chi tiêu'
                              : `Xóa ${m.name}`
                          }
                          className={`w-8 h-8 rounded-sm border flex items-center justify-center transition-colors ${
                            !isAdmin
                              ? 'border-slate-200 text-slate-400 opacity-40 pointer-events-none select-none'
                              : usedInExpenses
                              ? 'border-slate-200 text-slate-300 hover:bg-slate-50'
                              : 'border-rose-200 hover:bg-rose-50 text-rose-600'
                          }`}
                        >
                          <Trash2 aria-hidden="true" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isEditingThis && memForm && (
                      <div className="p-2.5 rounded-sm bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          name="memberName"
                          autoComplete="off"
                          aria-label="Tên thành viên"
                          value={memForm.name}
                          onChange={(e) => setMemForm({ ...memForm, name: e.target.value })}
                          placeholder="Tên…"
                          className="w-full min-h-[36px] px-2.5 rounded-sm border border-slate-300 bg-white text-xs font-semibold"
                        />
                        <div>
                          <input
                            type="text"
                            name="bankName"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Ngân hàng"
                            list="vn-banks-datalist"
                            value={memForm.bankName}
                            onChange={(e) =>
                              setMemForm({ ...memForm, bankName: e.target.value })
                            }
                            placeholder="Ngân hàng (VCB, MB, TCB…)"
                            className="w-full min-h-[36px] px-2.5 rounded-sm border border-slate-300 bg-white text-xs"
                          />
                          <datalist id="vn-banks-datalist">
                            {BANK_LIST.map((b) => (
                              <option key={b} value={b} />
                            ))}
                          </datalist>
                        </div>
                        <input
                          type="text"
                          name="accountNo"
                          inputMode="numeric"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="Số tài khoản"
                          value={memForm.accountNo}
                          onChange={(e) =>
                            setMemForm({ ...memForm, accountNo: e.target.value })
                          }
                          placeholder="Số tài khoản…"
                          className="w-full min-h-[36px] px-2.5 rounded-sm border border-slate-300 bg-white text-xs font-mono font-bold"
                        />
                        <input
                          type="text"
                          name="accountHolder"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="Chủ tài khoản"
                          value={memForm.accountHolder}
                          onChange={(e) =>
                            setMemForm({
                              ...memForm,
                              accountHolder: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="CHỦ TÀI KHOẢN…"
                          className="w-full min-h-[36px] px-2.5 rounded-sm border border-slate-300 bg-white text-xs font-mono uppercase"
                        />
                        <div className="sm:col-span-2 flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingMemberId(null)}
                            className="min-h-[32px] px-3 rounded-sm border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium transition-colors"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveMember}
                            className="min-h-[32px] px-3.5 rounded-sm bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors"
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

      {/* TAB 2: CHUYẾN ĐI & DANH MỤC (Mờ khi chưa mở Admin) */}
      {activeSection === 'trip' && (
        <div
          className={`space-y-4 ${
            !isAdmin ? 'opacity-45 pointer-events-none select-none' : ''
          }`}
        >
          {/* Thông tin chuyến đi */}
          <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                name="tripName"
                autoComplete="off"
                aria-label="Tên chuyến đi"
                disabled={!isAdmin}
                value={cfgForm.tripName}
                onChange={(e) => setCfgForm({ ...cfgForm, tripName: e.target.value })}
                placeholder="Tên chuyến đi…"
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold"
              />
              <input
                type="text"
                name="location"
                autoComplete="off"
                aria-label="Địa điểm"
                disabled={!isAdmin}
                value={cfgForm.location}
                onChange={(e) => setCfgForm({ ...cfgForm, location: e.target.value })}
                placeholder="Địa điểm…"
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold"
              />
              <input
                type="date"
                name="startDate"
                aria-label="Ngày bắt đầu"
                disabled={!isAdmin}
                value={cfgForm.startDate}
                onChange={(e) => setCfgForm({ ...cfgForm, startDate: e.target.value })}
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
              />
              <input
                type="date"
                name="endDate"
                aria-label="Ngày kết thúc"
                disabled={!isAdmin}
                value={cfgForm.endDate}
                onChange={(e) => setCfgForm({ ...cfgForm, endDate: e.target.value })}
                className="w-full min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono"
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
                      disabled={!isAdmin}
                      onClick={() => handleToggleSplitMode(m.id)}
                      className={`min-h-[34px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors ${
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
                  disabled={!isAdmin}
                  onClick={() =>
                    setCfgForm({
                      ...cfgForm,
                      tripStatus:
                        cfgForm.tripStatus === 'completed' ? 'active' : 'completed',
                    })
                  }
                  className={`min-h-[34px] px-3 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors ${
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
                disabled={!isAdmin}
                onClick={handleSaveTripConfig}
                className="min-h-[36px] px-4 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Save aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Lưu</span>
              </button>
            </div>
          </section>

          {/* Danh mục */}
          <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                name="newCategoryName"
                autoComplete="off"
                aria-label="Tên danh mục mới"
                disabled={!isAdmin}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Thêm danh mục…"
                className="flex-1 min-w-0 min-h-[36px] px-3 rounded-sm border border-slate-300 text-xs"
              />
              <div className="relative flex items-center">
                <select
                  name="newCategoryIcon"
                  aria-label="Biểu tượng danh mục"
                  disabled={!isAdmin}
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  className="min-h-[36px] pl-2.5 pr-6 rounded-sm border border-slate-300 bg-white text-slate-900 text-xs font-medium appearance-none"
                >
                  <option value="Plane">Vé</option>
                  <option value="Car">Xe</option>
                  <option value="Utensils">Ăn</option>
                  <option value="Hotel">Ở</option>
                  <option value="Ticket">Vé chơi</option>
                  <option value="Package">Khác</option>
                </select>
                <ChevronDown aria-hidden="true" className="w-3 h-3 text-slate-400 pointer-events-none absolute right-2" />
              </div>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={handleAddCategory}
                className="min-h-[36px] px-3 rounded-sm bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
              >
                <Plus aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-sm overflow-hidden">
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

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => handleToggleCategoryHidden(cat)}
                        aria-label={cat.hidden ? `Hiện ${cat.name}` : `Ẩn ${cat.name}`}
                        className="w-8 h-8 rounded-sm border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-colors"
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
                          disabled={!isAdmin}
                          onClick={() => handleDeleteCategory(cat)}
                          aria-label={`Xóa ${cat.name}`}
                          className="w-8 h-8 rounded-sm border border-rose-200 hover:bg-rose-50 text-rose-600 flex items-center justify-center transition-colors"
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
        </div>
      )}

      {/* TAB 3: HỆ THỐNG (MÃ PIN ADMIN, GOOGLE SHEET, SHARE LINK, ADMIN TOOLS, HISTORY) */}
      {activeSection === 'system' && (
        <div className="space-y-4">
          {/* Mã PIN Admin (Chỉ hiển thị ở mục Hệ thống) */}
          <section
            className={`p-4 rounded-2xl bg-white transition-all space-y-3 ${
              isAdmin
                ? 'border-2 border-brand shadow-md shadow-brand/5'
                : 'border border-slate-200/90 shadow-2xs'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <Unlock aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
                ) : (
                  <Lock aria-hidden="true" className="w-4 h-4 text-slate-600 shrink-0" />
                )}
                <span className="text-xs font-bold text-slate-900">
                  {isAdmin ? 'Admin: Đã mở khóa' : 'Mã PIN Admin'}
                </span>
              </div>

              {!isAdmin ? (
                <form
                  onSubmit={handleVerifyPin}
                  className="flex items-center gap-1.5"
                  autoComplete="off"
                >
                  <div className="relative flex items-center">
                    <input
                      type={showPinText ? 'text' : 'password'}
                      name="trip_admin_pin_code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      spellCheck={false}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="PIN (1234)…"
                      aria-label="PIN Admin"
                      className="w-32 sm:w-36 min-h-[36px] pl-3 pr-7 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-mono text-slate-900 focus:border-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPinText((prev) => !prev)}
                      aria-label={showPinText ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
                      title={showPinText ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
                      className="absolute right-1.5 p-1 text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      {showPinText ? (
                        <EyeOff aria-hidden="true" className="w-3.5 h-3.5" />
                      ) : (
                        <Eye aria-hidden="true" className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={verifyingPin || !pinInput.trim()}
                    className="min-h-[36px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold transition-colors shrink-0"
                  >
                    {verifyingPin ? 'Đang mở…' : 'Mở khóa'}
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowChangePin(!showChangePin)}
                    aria-expanded={showChangePin}
                    className="min-h-[36px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors"
                  >
                    <KeyRound aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Đổi PIN</span>
                  </button>
                  <button
                    type="button"
                    onClick={onLockAdmin}
                    className="min-h-[36px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Lock aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Khóa</span>
                  </button>
                </div>
              )}
            </div>

            {isAdmin && showChangePin && (
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
                  className="flex-1 min-w-0 min-h-[36px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-mono"
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
                  className="flex-1 min-w-0 min-h-[36px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="min-h-[36px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold shrink-0 transition-colors"
                >
                  Lưu
                </button>
              </form>
            )}
          </section>

          {/* Kết nối Sheet & Share Link */}
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

              {isConnectedSheet && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="min-h-[36px] px-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    {copiedShareLink ? (
                      <Check aria-hidden="true" className="w-3.5 h-3.5" />
                    ) : (
                      <Link2 aria-hidden="true" className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedShareLink ? 'Đã copy' : 'Copy link mời'}</span>
                  </button>

                  {onReloadFromSheet && (
                    <button
                      type="button"
                      onClick={onReloadFromSheet}
                      title="Tải lại từ Sheet"
                      className="min-h-[36px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" />
                      <span>Đồng bộ</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* URL GAS & Công cụ Admin (Mờ khi chưa mở Admin) */}
            <div
              className={`space-y-2.5 pt-2 border-t border-slate-100 ${
                !isAdmin ? 'opacity-40 pointer-events-none select-none' : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  name="gasUrl"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Google Apps Script Web App URL"
                  disabled={!isAdmin}
                  value={gasUrlInput}
                  onChange={(e) => setGasUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/…/exec"
                  className="flex-1 min-w-0 min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white font-mono text-xs text-slate-900"
                />
                <button
                  type="button"
                  disabled={!isAdmin || !gasUrlInput.trim() || testingSheet}
                  onClick={async () => {
                    if (!isAdmin) return;
                    setTestingSheet(true);
                    try {
                      onSaveGasUrl(gasUrlInput);
                      await onTestAndInitSheet(gasUrlInput);
                    } finally {
                      setTestingSheet(false);
                    }
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
                >
                  <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${testingSheet ? 'animate-spin' : ''}`} />
                  <span>Lưu URL</span>
                </button>
              </div>

              {/* Hàng nút kỹ thuật Admin */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={handleCopyCodeGs}
                  className="min-h-[34px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors"
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
                  disabled={!isAdmin}
                  onClick={() => {
                    if (!isAdmin) return;
                    setShowRawCodeGs((prev) => !prev);
                  }}
                  className="min-h-[34px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
                >
                  {showRawCodeGs ? 'Ẩn Code.gs' : 'Xem Code.gs'}
                </button>

                {!confirmResetDemo ? (
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => {
                      if (!isAdmin) return;
                      setConfirmResetDemo(true);
                    }}
                    className="min-h-[34px] px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Reset mẫu</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isAdmin) return;
                        setConfirmResetDemo(false);
                        onResetDemoData();
                      }}
                      className="min-h-[34px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
                    >
                      Xác nhận
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetDemo(false)}
                      className="min-h-[34px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs transition-colors"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>

              {showRawCodeGs && isAdmin && (
                <pre className="p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-60 border border-slate-800 select-all">
                  <code>{GOOGLE_APPS_SCRIPT_CODE}</code>
                </pre>
              )}
            </div>
          </section>

          {/* Lịch sử thu gọn */}
          <section className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((prev) => !prev)}
              className="w-full p-3 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              <span>Lịch sử ({history.length})</span>
              {showHistory ? (
                <ChevronUp aria-hidden="true" className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown aria-hidden="true" className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {showHistory && (
              <div className="px-3 pb-3 border-t border-slate-100 divide-y divide-slate-100 text-xs max-h-60 overflow-y-auto overscroll-contain">
                {history.length === 0 ? (
                  <div className="text-slate-600 py-2">—</div>
                ) : (
                  history.slice(0, 20).map((h, idx) => (
                    <div
                      key={`${h.timestamp}_${idx}`}
                      className="py-1.5 flex items-center justify-between gap-2"
                    >
                      <div className="truncate">
                        <span className="font-bold text-slate-900">{h.action}</span>
                        <span className="text-slate-600"> · {h.entityType} </span>
                        <span className="font-mono font-semibold text-brand">#{h.rev}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 shrink-0">
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

      {/* MỤC PHỤ: XUẤT BÁO CÁO CHI TIÊU (PDF QUA CDN, KHÔNG BUNDLE VÀO PWA) */}
      <section className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileDown aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
            <h3 className="text-xs font-bold text-slate-900 truncate">
              Xuất báo cáo chi tiêu
            </h3>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-600 shrink-0">
            PDF • On-demand
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            aria-label="Phạm vi xuất báo cáo chi tiêu"
            value={reportFilterMemberId}
            onChange={(e) => setReportFilterMemberId(e.target.value)}
            className="flex-1 min-w-0 min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs font-semibold text-slate-800 focus:border-brand"
          >
            <option value="all">Toàn bộ chuyến đi ({members.length} thành viên)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                Theo thành viên: {m.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={exportingPdf || reportPreview.rows.length === 0}
            onClick={handleExportPdfReport}
            className="min-h-[38px] px-4 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            <FileDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${exportingPdf ? 'animate-bounce' : ''}`}
            />
            <span>{exportingPdf ? 'Đang tải & tạo PDF…' : 'Xuất báo cáo PDF'}</span>
          </button>
        </div>

        <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-600">
          <span>
            Bản ghi: <strong className="font-mono text-slate-900">{reportPreview.rows.length}</strong> mục
          </span>
          {reportPreview.memberSummary ? (
            <span className="font-mono">
              Đã chi: <strong className="text-slate-900">{formatVND(reportPreview.memberSummary.paidExpense)}</strong>
              {' · '}
              Phải chịu: <strong className="text-slate-900">{formatVND(reportPreview.memberSummary.owedExpense)}</strong>
            </span>
          ) : (
            <span className="font-mono">
              Tổng chi tiêu: <strong className="text-slate-900">{formatVND(reportPreview.totalExpenseAmount)}</strong>
            </span>
          )}
        </div>
      </section>
    </div>
  );
};

