import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Minus,
  Plus,
  Receipt,
  Trash2,
  X,
} from 'lucide-react';
import { sortCategoriesTailOrder } from '../config';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import { canMemberModifyExpense } from '../services/syncService';
import type {
  Category,
  ExpenseRecord,
  Member,
  RecordType,
  SplitMode,
  TripConfig,
} from '../types';
import {
  checkSpentAtRange,
  formatVND,
  fromDatetimeLocalValue,
  generateUUID,
  getNowGMT7,
  getYesterdayGMT7,
  readVietnameseNumber,
  toDatetimeLocalValue,
} from '../utils/format';
import { splitByShares, splitEqual, validateExactSplits } from '../utils/math';

const EXPENSE_DRAFT_STORAGE_KEY = 'tdytrip_expense_draft_v1';

interface ExpenseFormModalProps {
  isOpen: boolean;
  editingRecord: ExpenseRecord | null;
  config: TripConfig;
  members: Member[];
  categories: Category[];
  currentUserId: string;
  isAdmin: boolean;
  onSave: (record: ExpenseRecord, baseRev: number) => void;
  onSoftDelete?: (record: ExpenseRecord) => void;
  onClose: () => void;
}

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  editingRecord,
  config,
  members,
  categories,
  currentUserId,
  isAdmin,
  onSave,
  onSoftDelete,
  onClose,
}) => {
  const activeMembers = useMemo(
    () =>
      [...members]
        .filter((m) => m.active)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [members]
  );
  const visibleCategories = useMemo(
    () =>
      sortCategoriesTailOrder(
        categories.filter((c) => !c.hidden || c.id === editingRecord?.categoryId)
      ),
    [categories, editingRecord]
  );

  const [recordId, setRecordId] = useState<string>('');
  const [recordType, setRecordType] = useState<RecordType>('expense');
  const [title, setTitle] = useState<string>('');
  const [rawDigits, setRawDigits] = useState<string>('');
  const [selectedMultiplier, setSelectedMultiplier] = useState<number>(1000);
  const [payer, setPayer] = useState<string>(currentUserId);
  const [recipientId, setRecipientId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('cat_food');
  const [spentAt, setSpentAt] = useState<string>(getNowGMT7(false));
  const [note, setNote] = useState<string>('');
  const [splitMode, setSplitMode] = useState<SplitMode>(config.defaultSplitMode || 'equal');

  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [sharesMap, setSharesMap] = useState<Record<string, number>>({});
  const [exactMap, setExactMap] = useState<Record<string, number>>({});

  const [pendingRangeConfirm, setPendingRangeConfirm] = useState<boolean>(false);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  const clearSavedDraft = () => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(EXPENSE_DRAFT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setPendingRangeConfirm(false);
    setConfirmDeleteStep(false);
    setIsSubmitting(false);

    const defaultMemberIds = activeMembers.map((m) => m.id);
    const defaultShares: Record<string, number> = {};
    for (const m of activeMembers) {
      defaultShares[m.id] = m.defaultWeight || 1;
    }

    const resolveMemberId = (idOrName: string): string => {
      const clean = String(idOrName || '').trim();
      if (!clean) return '';
      const byId = activeMembers.find((m) => m.id === clean);
      if (byId) return byId.id;
      const byName = activeMembers.find(
        (m) => m.name.trim().toLowerCase() === clean.toLowerCase()
      );
      return byName ? byName.id : clean;
    };

    if (editingRecord) {
      setRecordId(editingRecord.id);
      setRecordType(editingRecord.type);
      setTitle(editingRecord.title);
      setRawDigits(String(editingRecord.amount));
      setSelectedMultiplier(1);
      const resolvedPayer =
        resolveMemberId(editingRecord.payer) || activeMembers[0]?.id || currentUserId;
      setPayer(resolvedPayer);
      setCategoryId(editingRecord.categoryId || 'cat_other');
      setSpentAt(editingRecord.spentAt || getNowGMT7(false));
      setNote(editingRecord.note || '');
      setSplitMode(editingRecord.splitMode || 'equal');

      if (editingRecord.type === 'transfer') {
        const rawRecKey = Object.keys(editingRecord.splits || {})[0] || '';
        const recKey =
          resolveMemberId(rawRecKey) ||
          activeMembers.find((m) => m.id !== resolvedPayer)?.id ||
          '';
        setRecipientId(recKey);
        setSelectedMembers(defaultMemberIds);
        setSharesMap(defaultShares);
        setExactMap({});
      } else {
        const splitKeys = Object.keys(editingRecord.splits || {})
          .filter((k) => (editingRecord.splits[k] || 0) > 0)
          .map(resolveMemberId)
          .filter((id) => defaultMemberIds.includes(id));

        const metaSelected = (editingRecord.splitMeta?.selectedMembers || [])
          .map(resolveMemberId)
          .filter((id) => defaultMemberIds.includes(id));

        setSelectedMembers(
          metaSelected.length > 0
            ? metaSelected
            : splitKeys.length > 0
            ? splitKeys
            : defaultMemberIds
        );
        setSharesMap(editingRecord.splitMeta?.shares || defaultShares);
        setExactMap(editingRecord.splitMeta?.exactAmounts || { ...editingRecord.splits });
        const fallbackRec =
          activeMembers.find((m) => m.id !== resolvedPayer)?.id ||
          activeMembers[0]?.id ||
          '';
        setRecipientId(fallbackRec);
      }
    } else {
      let restoredDraft: Record<string, any> | null = null;
      try {
        if (typeof sessionStorage !== 'undefined') {
          const raw = sessionStorage.getItem(EXPENSE_DRAFT_STORAGE_KEY);
          if (raw) restoredDraft = JSON.parse(raw);
        }
      } catch {
        restoredDraft = null;
      }

      const newId = restoredDraft?.recordId || generateUUID();
      setRecordId(newId);
      setRecordType(restoredDraft?.recordType === 'transfer' ? 'transfer' : 'expense');
      setTitle(restoredDraft?.title || '');
      setRawDigits(restoredDraft?.rawDigits || '');
      setSelectedMultiplier(
        restoredDraft?.selectedMultiplier ?? (config.suggestMultipliers?.[0] || 1000)
      );
      const validPayer =
        activeMembers.find((m) => m.id === (restoredDraft?.payer || currentUserId))?.id ||
        activeMembers[0]?.id ||
        '';
      setPayer(validPayer);
      const defaultRec =
        activeMembers.find((m) => m.id === restoredDraft?.recipientId && m.id !== validPayer)?.id ||
        activeMembers.find((m) => m.id !== validPayer)?.id ||
        activeMembers[0]?.id ||
        '';
      setRecipientId(defaultRec);
      setCategoryId(restoredDraft?.categoryId || visibleCategories[0]?.id || 'cat_food');
      setSpentAt(restoredDraft?.spentAt || getNowGMT7(false));
      setNote(restoredDraft?.note || '');
      setSplitMode(restoredDraft?.splitMode || config.defaultSplitMode || 'equal');
      setSelectedMembers(
        Array.isArray(restoredDraft?.selectedMembers) && restoredDraft.selectedMembers.length > 0
          ? restoredDraft.selectedMembers
          : defaultMemberIds
      );
      setSharesMap(restoredDraft?.sharesMap || defaultShares);
      setExactMap(restoredDraft?.exactMap || {});
    }
  }, [isOpen, editingRecord?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lưu tạm bản nháp vào sessionStorage khi đang nhập mới чтобы tránh mất dữ liệu nếu trang tự tải lại
  useEffect(() => {
    if (!isOpen || editingRecord) return;
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (!title && !rawDigits && !note) {
          sessionStorage.removeItem(EXPENSE_DRAFT_STORAGE_KEY);
          return;
        }
        sessionStorage.setItem(
          EXPENSE_DRAFT_STORAGE_KEY,
          JSON.stringify({
            recordId,
            recordType,
            title,
            rawDigits,
            selectedMultiplier,
            payer,
            recipientId,
            categoryId,
            spentAt,
            note,
            splitMode,
            selectedMembers,
            sharesMap,
            exactMap,
          })
        );
      }
    } catch {
      // Ignore storage errors
    }
  }, [
    isOpen,
    editingRecord,
    recordId,
    recordType,
    title,
    rawDigits,
    selectedMultiplier,
    payer,
    recipientId,
    categoryId,
    spentAt,
    note,
    splitMode,
    selectedMembers,
    sharesMap,
    exactMap,
  ]);

  const digitCount = rawDigits.length;
  const numericBase = parseInt(rawDigits || '0', 10) || 0;
  const isShortInput = digitCount >= 1 && digitCount <= 3 && numericBase > 0;

  const suggestionChips = useMemo(() => {
    if (!isShortInput) return [];
    const multipliers =
      config.suggestMultipliers && config.suggestMultipliers.length > 0
        ? config.suggestMultipliers
        : [1000, 10000, 100000];
    const maxAmt = config.maxSuggestAmount || 50000000;
    return multipliers
      .map((mult) => ({
        multiplier: mult,
        value: numericBase * mult,
      }))
      .filter((item) => item.value <= maxAmt)
      .slice(0, 3);
  }, [isShortInput, numericBase, config.suggestMultipliers, config.maxSuggestAmount]);

  const effectiveAmount = useMemo(() => {
    if (numericBase <= 0) return 0;
    if (isShortInput && suggestionChips.length > 0) {
      const matched =
        suggestionChips.find((c) => c.multiplier === selectedMultiplier) || suggestionChips[0];
      return matched.value;
    }
    return numericBase;
  }, [numericBase, isShortInput, suggestionChips, selectedMultiplier]);

  const handleAmountChange = (val: string) => {
    const clean = val.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
    setRawDigits(clean);
    if (clean.length >= 1 && clean.length <= 3) {
      const defaultMult = config.suggestMultipliers?.[0] || 1000;
      setSelectedMultiplier(defaultMult);
    } else {
      setSelectedMultiplier(1);
    }
  };

  const handleApplyChip = (chipValue: number) => {
    setRawDigits(String(chipValue));
    setSelectedMultiplier(1);
  };

  const computedSplits = useMemo<Record<string, number>>(() => {
    if (effectiveAmount <= 0) return {};
    if (recordType === 'transfer') {
      return recipientId ? { [recipientId]: effectiveAmount } : {};
    }
    if (splitMode === 'equal') {
      return splitEqual(effectiveAmount, selectedMembers, recordId);
    }
    if (splitMode === 'shares') {
      return splitByShares(effectiveAmount, sharesMap, recordId);
    }
    if (splitMode === 'exact') {
      const { cleanedSplits } = validateExactSplits(effectiveAmount, exactMap);
      return cleanedSplits;
    }
    return {};
  }, [
    effectiveAmount,
    recordType,
    recipientId,
    splitMode,
    selectedMembers,
    recordId,
    sharesMap,
    exactMap,
  ]);

  const exactValidation = useMemo(
    () => validateExactSplits(effectiveAmount, exactMap),
    [effectiveAmount, exactMap]
  );

  const rangeCheck = useMemo(
    () => checkSpentAtRange(spentAt, config.startDate, config.endDate),
    [spentAt, config.startDate, config.endDate]
  );

  const canModifyRecord = useMemo(() => {
    if (!editingRecord) return config.tripStatus !== 'completed';
    return canMemberModifyExpense(
      editingRecord,
      currentUserId,
      members,
      isAdmin,
      config.tripStatus
    );
  }, [editingRecord, isAdmin, currentUserId, members, config.tripStatus]);

  const handleCloseModal = () => {
    clearSavedDraft();
    onClose();
  };

  const modalRef = useModalAccessibility<HTMLDivElement>(isOpen, handleCloseModal);

  if (!isOpen) return null;

  const toggleMemberEqual = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const adjustShare = (memberId: string, delta: number) => {
    setSharesMap((prev) => {
      const current = prev[memberId] ?? 0;
      return { ...prev, [memberId]: Math.max(0, current + delta) };
    });
  };

  const handleExactMemberInput = (memberId: string, rawVal: string) => {
    const clean = parseInt(rawVal.replace(/\D/g, ''), 10) || 0;
    setExactMap((prev) => ({ ...prev, [memberId]: clean }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    if (!canModifyRecord) {
      setFormError('Bạn chỉ được sửa/xóa khoản do mình tạo hoặc mở quyền Admin.');
      return;
    }

    const payerName = members.find((m) => m.id === payer)?.name || 'Thành viên';
    const recipientName = members.find((m) => m.id === recipientId)?.name || 'Thành viên';

    const finalTitle =
      recordType === 'transfer'
        ? title.trim() || `${payerName} chuyển cho ${recipientName}`
        : title.trim();

    if (!finalTitle) {
      setFormError('Vui lòng nhập tên khoản chi.');
      return;
    }

    if (effectiveAmount <= 0) {
      setFormError('Vui lòng nhập số tiền > 0 ₫.');
      return;
    }

    if (recordType === 'transfer') {
      if (!recipientId || recipientId === payer) {
        setFormError('Người nhận phải khác người chuyển.');
        return;
      }
    } else {
      if (splitMode === 'equal' && selectedMembers.length === 0) {
        setFormError('Chọn ít nhất 1 thành viên.');
        return;
      }
      if (splitMode === 'shares') {
        const totalShares = Object.values(sharesMap).reduce((a, b) => a + (b || 0), 0);
        if (totalShares <= 0) {
          setFormError('Tổng số suất phải > 0.');
          return;
        }
      }
      if (splitMode === 'exact' && !exactValidation.valid) {
        setFormError('Tổng tiền từng người chưa khớp tổng chi.');
        return;
      }
    }

    if (rangeCheck.isWarning && !pendingRangeConfirm) {
      setPendingRangeConfirm(true);
      return;
    }

    const nowSec = getNowGMT7(true);
    const baseRev = editingRecord ? editingRecord.rev : 0;

    const finalRecord: ExpenseRecord = {
      id: recordId,
      rev: editingRecord ? editingRecord.rev : 1,
      type: recordType,
      title: finalTitle,
      amount: effectiveAmount,
      payer,
      splits: computedSplits,
      splitMode: recordType === 'transfer' ? 'exact' : splitMode,
      splitMeta:
        recordType === 'transfer'
          ? undefined
          : splitMode === 'equal'
          ? { selectedMembers }
          : splitMode === 'shares'
          ? { shares: sharesMap }
          : { exactAmounts: exactMap },
      categoryId: recordType === 'transfer' ? 'cat_other' : categoryId,
      spentAt,
      createdBy: editingRecord ? editingRecord.createdBy || editingRecord.payer : currentUserId,
      createdAt: editingRecord ? editingRecord.createdAt : nowSec,
      updatedBy: currentUserId,
      updatedAt: nowSec,
      deleted: false,
      note: note.trim(),
      syncStatus: 'pending',
    };

    clearSavedDraft();
    setIsSubmitting(true);
    onSave(finalRecord, baseRev);
  };

  const enabledModes: SplitMode[] =
    isAdmin
      ? ['equal', 'shares', 'exact']
      : config.enabledSplitModes && config.enabledSplitModes.length > 0
      ? config.enabledSplitModes
      : ['equal', 'shares', 'exact'];

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-form-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[94vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 id="expense-form-title" className="text-base font-bold text-slate-900 text-balance">
            {editingRecord
              ? recordType === 'transfer'
                ? 'Sửa chuyển tiền'
                : 'Sửa khoản chi'
              : 'Thêm giao dịch'}
          </h2>
          <button
            type="button"
            onClick={handleCloseModal}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Control: Chi tiêu | Chuyển tiền */}
        <div className="px-5 pt-3 pb-1">
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              aria-pressed={recordType === 'expense'}
              onClick={() => setRecordType('expense')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                recordType === 'expense'
                  ? 'bg-white text-brand shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Chi tiêu chung</span>
            </button>
            <button
              type="button"
              aria-pressed={recordType === 'transfer'}
              onClick={() => setRecordType('transfer')}
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                recordType === 'transfer'
                  ? 'bg-white text-brand shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowRightLeft aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Chuyển tiền</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain space-y-3.5 flex-1">
          {formError && (
            <div
              role="alert"
              aria-live="polite"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2"
            >
              <AlertCircle aria-hidden="true" className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Số tiền VND */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
            <label htmlFor="vnd-amount-input" className="block text-xs font-semibold text-slate-600">
              Số tiền (VND)
            </label>
            <div className="relative flex items-center">
              <input
                id="vnd-amount-input"
                name="amount"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={rawDigits}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="VD: 125 hoặc 350000…"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white border border-slate-300 focus:border-brand text-lg font-mono font-bold text-slate-900 tabular-nums"
              />
              {rawDigits && (
                <button
                  type="button"
                  onClick={() => setRawDigits('')}
                  aria-label="Xóa số tiền"
                  className="absolute right-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-col">
              <div className="text-2xl font-mono font-extrabold text-brand tabular-nums tracking-tight">
                {formatVND(effectiveAmount)}
              </div>
              {effectiveAmount > 0 && (
                <div className="text-xs text-slate-500 italic">
                  {readVietnameseNumber(effectiveAmount)}
                </div>
              )}
            </div>

            {isShortInput && suggestionChips.length > 0 && (
              <div className="pt-1 flex flex-wrap gap-1.5">
                {suggestionChips.map((chip) => {
                  const isChipActive = effectiveAmount === chip.value;
                  return (
                    <button
                      key={chip.multiplier}
                      type="button"
                      onClick={() => handleApplyChip(chip.value)}
                      className={`min-h-[36px] px-3 py-1 rounded-sm font-mono text-xs font-bold tabular-nums border transition-colors ${
                        isChipActive
                          ? 'bg-brand text-white border-brand'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-brand'
                      }`}
                    >
                      {formatVND(chip.value)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {recordType === 'expense' ? (
            <>
              {/* Tên khoản chi */}
              <div>
                <label
                  htmlFor="expense-title-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Tên khoản chi
                </label>
                <input
                  id="expense-title-input"
                  name="title"
                  type="text"
                  maxLength={120}
                  autoComplete="off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Ăn sáng, Taxi, Vé tham quan…"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-sm border border-slate-300 focus:border-brand text-sm font-medium text-slate-900"
                />
              </div>

              {/* Người trả & Danh mục */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="expense-payer-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Người trả
                  </label>
                  <div className="relative flex items-center">
                    <select
                      id="expense-payer-select"
                      name="payer"
                      value={payer}
                      onChange={(e) => setPayer(e.target.value)}
                      className="w-full min-h-[44px] pl-3 pr-8 rounded-sm border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 appearance-none"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.id === currentUserId ? '(Bạn)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5" />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="expense-category-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Danh mục
                  </label>
                  <div className="relative flex items-center">
                    <select
                      id="expense-category-select"
                      name="categoryId"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full min-h-[44px] pl-3 pr-8 rounded-sm border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 appearance-none"
                    >
                      {visibleCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5" />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Người chuyển & Người nhận */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="transfer-sender-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Người chuyển
                  </label>
                  <div className="relative flex items-center">
                    <select
                      id="transfer-sender-select"
                      name="sender"
                      value={payer}
                      onChange={(e) => {
                        const nextPayer = e.target.value;
                        setPayer(nextPayer);
                        if (recipientId === nextPayer) {
                          const alt = activeMembers.find((m) => m.id !== nextPayer);
                          if (alt) setRecipientId(alt.id);
                        }
                      }}
                      className="w-full min-h-[44px] pl-3 pr-8 rounded-sm border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 appearance-none"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.id === currentUserId ? '(Bạn)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5" />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="transfer-recipient-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Người nhận
                  </label>
                  <div className="relative flex items-center">
                    <select
                      id="transfer-recipient-select"
                      name="recipient"
                      value={recipientId}
                      onChange={(e) => setRecipientId(e.target.value)}
                      className="w-full min-h-[44px] pl-3 pr-8 rounded-sm border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 appearance-none"
                    >
                      {activeMembers
                        .filter((m) => m.id !== payer)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} {m.id === currentUserId ? '(Bạn)' : ''}
                          </option>
                        ))}
                    </select>
                    <ChevronDown aria-hidden="true" className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5" />
                  </div>
                </div>
              </div>

              {/* Nội dung chuyển tiền */}
              <div>
                <label
                  htmlFor="transfer-title-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Nội dung (tùy chọn)
                </label>
                <input
                  id="transfer-title-input"
                  name="transferTitle"
                  type="text"
                  maxLength={120}
                  autoComplete="off"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Mặc định: ${
                    members.find((m) => m.id === payer)?.name || ''
                  } chuyển cho ${members.find((m) => m.id === recipientId)?.name || ''}…`}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-sm border border-slate-300 focus:border-brand text-sm font-medium text-slate-900"
                />
              </div>
            </>
          )}

          {/* Thời gian */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="spent-at-input"
                className="text-xs font-semibold text-slate-700 flex items-center gap-1"
              >
                <Calendar aria-hidden="true" className="w-3.5 h-3.5 text-slate-500" />
                <span>Thời gian</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSpentAt(getYesterdayGMT7(spentAt));
                    setPendingRangeConfirm(false);
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-sm bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  Hôm qua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpentAt(getNowGMT7(false));
                    setPendingRangeConfirm(false);
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-sm bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Clock aria-hidden="true" className="w-3 h-3" />
                  <span>Bây giờ</span>
                </button>
              </div>
            </div>
            <input
              id="spent-at-input"
              name="spentAt"
              type="datetime-local"
              value={toDatetimeLocalValue(spentAt)}
              onChange={(e) => {
                setSpentAt(fromDatetimeLocalValue(e.target.value));
                setPendingRangeConfirm(false);
              }}
              className="w-full min-h-[42px] px-3 py-1.5 rounded-sm border border-slate-300 bg-white text-xs sm:text-sm font-mono text-slate-900"
            />
          </div>

          {/* Chia tiền (chỉ hiện khi là Chi tiêu chung) */}
          {recordType === 'expense' && (
            <div className="space-y-2 pt-0.5">
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-md">
                {enabledModes.includes('equal') && (
                  <button
                    type="button"
                    onClick={() => setSplitMode('equal')}
                    className={`min-h-[36px] rounded-sm text-xs font-bold transition-colors ${
                      splitMode === 'equal'
                        ? 'bg-white text-brand shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Chia đều
                  </button>
                )}
                {enabledModes.includes('shares') && (
                  <button
                    type="button"
                    onClick={() => setSplitMode('shares')}
                    className={`min-h-[36px] rounded-sm text-xs font-bold transition-colors ${
                      splitMode === 'shares'
                        ? 'bg-white text-brand shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Theo suất
                  </button>
                )}
                {enabledModes.includes('exact') && (
                  <button
                    type="button"
                    onClick={() => setSplitMode('exact')}
                    className={`min-h-[36px] rounded-sm text-xs font-bold transition-colors ${
                      splitMode === 'exact'
                        ? 'bg-white text-brand shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Nhập số
                  </button>
                )}
              </div>

              {splitMode === 'equal' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      Chọn <strong className="text-slate-900">{selectedMembers.length}</strong>/
                      {activeMembers.length} người
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedMembers(activeMembers.map((m) => m.id))}
                        className="min-h-[32px] px-2.5 py-1 rounded-sm bg-brand-soft text-brand font-semibold"
                      >
                        Tất cả ({activeMembers.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMembers([])}
                        className="min-h-[32px] px-2.5 py-1 rounded-sm bg-slate-100 text-slate-600 font-medium"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden bg-white">
                    {activeMembers.map((m) => {
                      const checked = selectedMembers.includes(m.id);
                      const memberShare = computedSplits[m.id] || 0;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMemberEqual(m.id)}
                          className={`w-full min-h-[46px] px-3.5 py-2 flex items-center justify-between text-left transition-colors ${
                            checked ? 'bg-brand-soft/40' : 'bg-white opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-5 h-5 rounded-sm flex items-center justify-center border ${
                                checked
                                  ? 'bg-brand border-brand text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <span className="text-sm font-semibold text-slate-900">{m.name}</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-slate-800 tabular-nums">
                            {checked ? formatVND(memberShare) : '0 ₫'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {splitMode === 'shares' && (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden bg-white">
                  {activeMembers.map((m) => {
                    const weight = sharesMap[m.id] ?? 0;
                    const memberShare = computedSplits[m.id] || 0;
                    return (
                      <div
                        key={m.id}
                        className="min-h-[48px] px-3.5 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                          <div className="text-xs font-mono text-brand font-semibold tabular-nums">
                            {formatVND(memberShare)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => adjustShare(m.id, -1)}
                            aria-label={`Giảm suất ${m.name}`}
                            className="w-10 h-10 rounded-sm border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Minus aria-hidden="true" className="w-4 h-4" />
                          </button>
                          <span className="w-12 text-center font-mono text-xs font-bold text-slate-900 tabular-nums">
                            {weight} suất
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustShare(m.id, 1)}
                            aria-label={`Tăng suất ${m.name}`}
                            className="w-10 h-10 rounded-sm border border-slate-300 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Plus aria-hidden="true" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {splitMode === 'exact' && (
                <div className="space-y-2">
                  <div
                    className={`p-2.5 rounded-md border text-xs font-semibold flex items-center justify-between ${
                      exactValidation.valid
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <span>
                      Đã chia:{' '}
                      <strong className="font-mono">{formatVND(exactValidation.allocated)}</strong>
                    </span>
                    <span className="font-mono font-bold">
                      {exactValidation.diff === 0
                        ? 'Đã khớp'
                        : exactValidation.diff > 0
                        ? `Thiếu ${formatVND(exactValidation.diff)}`
                        : `Thừa ${formatVND(Math.abs(exactValidation.diff))}`}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden bg-white">
                    {activeMembers.map((m) => {
                      const val = exactMap[m.id] || 0;
                      return (
                        <div
                          key={m.id}
                          className="min-h-[48px] px-3.5 py-2 flex items-center justify-between gap-3"
                        >
                          <label
                            htmlFor={`exact-${m.id}`}
                            className="text-sm font-semibold text-slate-900 shrink-0"
                          >
                            {m.name}
                          </label>
                          <input
                            id={`exact-${m.id}`}
                            name={`exact-${m.id}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={val > 0 ? String(val) : ''}
                            onChange={(e) => handleExactMemberInput(m.id, e.target.value)}
                            placeholder="0…"
                            className="w-36 min-h-[36px] px-3 py-1 rounded-sm border border-slate-300 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ghi chú */}
          <div>
            <label
              htmlFor="expense-note-input"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Ghi chú (tùy chọn)
            </label>
            <input
              id="expense-note-input"
              name="note"
              type="text"
              maxLength={300}
              autoComplete="off"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú ngắn…"
              className="w-full min-h-[42px] px-3.5 py-1.5 rounded-sm border border-slate-300 text-xs text-slate-800"
            />
          </div>

          {pendingRangeConfirm && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-300 space-y-1">
              <div className="text-xs font-bold text-amber-900">
                Ngoài ngày chuyến đi — Bạn vẫn muốn lưu?
              </div>
              <p className="text-[11px] text-amber-800">{rangeCheck.reason}</p>
            </div>
          )}

          {editingRecord && !editingRecord.deleted && onSoftDelete && canModifyRecord && (
            <div className="pt-1 border-t border-slate-100">
              {!confirmDeleteStep ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteStep(true)}
                  className="w-full min-h-[42px] px-4 py-2 rounded-sm border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 aria-hidden="true" className="w-4 h-4" />
                  <span>Xóa giao dịch</span>
                </button>
              ) : (
                <div className="p-2.5 rounded-md bg-rose-50 border border-rose-200 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-rose-800">Xác nhận xóa?</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteStep(false)}
                      className="min-h-[34px] px-3 rounded-sm bg-white border border-slate-300 text-xs font-medium text-slate-700"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => onSoftDelete(editingRecord)}
                      className="min-h-[34px] px-3 rounded-sm bg-rose-600 text-white text-xs font-bold"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCloseModal}
              className="min-h-[46px] px-4 rounded-sm border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (recordType === 'expense' && splitMode === 'exact' && !exactValidation.valid)}
              className={`flex-1 min-h-[46px] px-5 rounded-sm font-bold text-sm text-white shadow-sm transition-colors ${
                isSubmitting || (recordType === 'expense' && splitMode === 'exact' && !exactValidation.valid)
                  ? 'bg-slate-300 cursor-not-allowed'
                  : pendingRangeConfirm
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-brand hover:bg-brand-hover'
              }`}
            >
              {pendingRangeConfirm
                ? 'Xác nhận lưu'
                : editingRecord?.deleted
                ? 'Khôi phục & Lưu'
                : editingRecord
                ? 'Lưu thay đổi'
                : recordType === 'transfer'
                ? 'Lưu chuyển tiền'
                : 'Lưu khoản chi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
