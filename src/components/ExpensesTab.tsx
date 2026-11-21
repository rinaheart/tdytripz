import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Lock,
  Package,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { sortCategoriesTailOrder } from '../config';
import { canMemberModifyExpense } from '../services/syncService';
import type { Category, ExpenseRecord, Member, TripConfig } from '../types';
import {
  copyToClipboard,
  formatDayGroupHeader,
  formatExpensesForChat,
  formatVND,
  normalizeSearchText,
} from '../utils/format';
import {
  getExpenseParticipantHeadcount,
  getMemberGroupSize,
  splitPerGroupMember,
} from '../utils/math';
import { CATEGORY_ICON_MAP } from './OverviewTab';

interface ExpensesTabProps {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
  currentUserId: string | null;
  isAdmin: boolean;
  onEditRecord: (record: ExpenseRecord) => void;
  onRequestAdminUnlock?: (record: ExpenseRecord) => void;
  onSoftDeleteRecord: (record: ExpenseRecord) => void;
  onOpenAddModal: () => void;
  onShowToast?: (msg: string) => void;
}

export const ExpensesTab: React.FC<ExpensesTabProps> = React.memo(({
  config,
  members,
  categories,
  expenses,
  currentUserId,
  isAdmin,
  onEditRecord,
  onRequestAdminUnlock,
  onOpenAddModal,
  onShowToast,
}) => {
  const [showSearchPanel, setShowSearchPanel] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [showDeleted, setShowDeleted] = useState<boolean>(false);
  const [visibleLimit, setVisibleLimit] = useState<number>(100);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setVisibleLimit(100);
  }, [searchQuery, categoryFilter, memberFilter, showDeleted]);

  const memberMap = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of members) {
      map.set(m.id, m);
    }
    return map;
  }, [members]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const getMember = (id: string) => memberMap.get(id);
  const getCategory = (id: string) => categoryMap.get(id);

  const deletedCount = useMemo(
    () => expenses.filter((e) => e.deleted).length,
    [expenses]
  );

  const filteredExpenses = useMemo(() => {
    const qRaw = searchQuery.trim().toLowerCase();
    const qNorm = normalizeSearchText(searchQuery);
    const selectedMemberNameLower =
      memberFilter !== 'all'
        ? memberMap.get(memberFilter)?.name?.trim().toLowerCase() || ''
        : '';

    return expenses
      .filter((exp) => {
        if (!showDeleted && exp.deleted) return false;
        if (categoryFilter === '__transfer__') {
          if (exp.type !== 'transfer') return false;
        } else if (categoryFilter !== 'all') {
          if (exp.type !== 'expense' || exp.categoryId !== categoryFilter) return false;
        }
        if (memberFilter !== 'all') {
          const cleanPayer = String(exp.payer || '').trim();
          const isIdMatch = cleanPayer === memberFilter;
          const isNameMatch =
            selectedMemberNameLower !== '' &&
            cleanPayer.toLowerCase() === selectedMemberNameLower;
          if (!isIdMatch && !isNameMatch) return false;
        }
        if (qRaw) {
          const payerName = memberMap.get(exp.payer)?.name || '';
          const matchRaw =
            exp.title.toLowerCase().includes(qRaw) ||
            (exp.note || '').toLowerCase().includes(qRaw) ||
            payerName.toLowerCase().includes(qRaw);
          const matchNorm =
            qNorm.length > 0 &&
            (normalizeSearchText(exp.title).includes(qNorm) ||
              normalizeSearchText(exp.note || '').includes(qNorm) ||
              normalizeSearchText(payerName).includes(qNorm));
          if (!matchRaw && !matchNorm) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmpSpent = (b.spentAt || '').localeCompare(a.spentAt || '');
        if (cmpSpent !== 0) return cmpSpent;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [expenses, showDeleted, categoryFilter, memberFilter, searchQuery, memberMap]);

  const hasMoreItems = filteredExpenses.length > visibleLimit;

  useEffect(() => {
    if (!hasMoreItems || typeof IntersectionObserver === 'undefined') return;
    const node = loadMoreSentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLimit((prev) => Math.min(filteredExpenses.length, prev + 100));
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreItems, filteredExpenses.length]);

  const groupedDays = useMemo(() => {
    // Tính tổng tiền chính xác cho từng ngày trên toàn bộ danh sách đã lọc
    const fullDayTotals = new Map<string, number>();
    for (const exp of filteredExpenses) {
      if (!exp.deleted && exp.type === 'expense') {
        const dateStr = (exp.spentAt || '').slice(0, 10);
        const isPreTrip = config.startDate && dateStr < config.startDate;
        const groupKey = isPreTrip ? 'PRE_TRIP' : dateStr;
        fullDayTotals.set(
          groupKey,
          (fullDayTotals.get(groupKey) || 0) + Math.round(exp.amount || 0)
        );
      }
    }

    const visibleItems =
      filteredExpenses.length > visibleLimit
        ? filteredExpenses.slice(0, visibleLimit)
        : filteredExpenses;

    const groups: {
      groupKey: string;
      headerTitle: string;
      totalExpense: number;
      items: ExpenseRecord[];
    }[] = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const exp of visibleItems) {
      const dateStr = (exp.spentAt || '').slice(0, 10);
      const isPreTrip = config.startDate && dateStr < config.startDate;
      const groupKey = isPreTrip ? 'PRE_TRIP' : dateStr;
      const headerTitle = formatDayGroupHeader(dateStr, config.startDate, config.endDate);

      let grp = map.get(groupKey);
      if (!grp) {
        grp = {
          groupKey,
          headerTitle,
          totalExpense: fullDayTotals.get(groupKey) || 0,
          items: [],
        };
        map.set(groupKey, grp);
        groups.push(grp);
      }
      grp.items.push(exp);
    }

    return groups;
  }, [filteredExpenses, visibleLimit, config.startDate, config.endDate]);

  const activeFilterCount =
    (searchQuery.trim() !== '' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (memberFilter !== 'all' ? 1 : 0);
  const hasActiveFilter = activeFilterCount > 0;

  const copyableExpenses = useMemo(
    () => filteredExpenses.filter((e) => !e.deleted),
    [filteredExpenses]
  );

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setMemberFilter('all');
  };

  const handleCopyExpensesSummary = async () => {
    if (copyableExpenses.length === 0) {
      onShowToast?.('Chưa có khoản chi nào để sao chép');
      return;
    }

    const filterParts: string[] = [];
    if (categoryFilter === '__transfer__') {
      filterParts.push('Chuyển tiền');
    } else if (categoryFilter !== 'all') {
      const catName = categoryMap.get(categoryFilter)?.name;
      if (catName) filterParts.push(catName);
    }
    if (memberFilter !== 'all') {
      const memName = memberMap.get(memberFilter)?.name;
      if (memName) filterParts.push(`Người chi: ${memName}`);
    }
    if (searchQuery.trim()) {
      filterParts.push(`"${searchQuery.trim()}"`);
    }

    const formattedText = formatExpensesForChat({
      config,
      expenses: copyableExpenses,
      members,
      filterSummary: filterParts.join(' · '),
    });

    const ok = await copyToClipboard(formattedText);
    if (ok) {
      setCopiedSummary(true);
      onShowToast?.(`Đã sao chép ${copyableExpenses.length} khoản chi`);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setCopiedSummary(false), 2000);
    } else {
      onShowToast?.('Không thể sao chép tự động trên trình duyệt này');
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Thanh tìm kiếm & bộ lọc thu gọn/mở rộng để tiện chụp ảnh màn hình */}
      <section className="px-3 py-2 rounded-2xl bg-white/95 backdrop-blur-xs border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowSearchPanel((prev) => !prev)}
            aria-expanded={showSearchPanel}
            aria-controls="expense-search-panel"
            className="flex-1 min-w-0 min-h-[36px] flex items-center gap-2 text-left cursor-pointer group"
          >
            <Search
              aria-hidden="true"
              className={`w-4 h-4 shrink-0 transition-colors ${
                hasActiveFilter || showSearchPanel ? 'text-brand' : 'text-slate-400 group-hover:text-slate-600'
              }`}
            />
            <span
              className={`text-xs font-bold truncate ${
                hasActiveFilter ? 'text-brand' : 'text-slate-700'
              }`}
            >
              {hasActiveFilter ? `Đang lọc (${activeFilterCount})` : 'Tìm kiếm & lọc'}
            </span>
            <span className="text-[11px] font-medium text-slate-400 shrink-0 tabular-nums">
              · {filteredExpenses.length} khoản
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                showSearchPanel ? 'rotate-180 text-brand' : ''
              }`}
            />
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasActiveFilter && !showSearchPanel && (
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-[32px] px-2 rounded-lg text-[11px] font-bold text-brand hover:bg-brand-soft/60 transition-colors cursor-pointer"
              >
                Bỏ lọc
              </button>
            )}

            {copyableExpenses.length > 0 && (
              <button
                type="button"
                onClick={handleCopyExpensesSummary}
                aria-label="Sao chép nội dung danh sách khoản chi"
                className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  copiedSummary
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-brand/40 hover:bg-brand-soft/60 hover:text-brand'
                }`}
              >
                {copiedSummary ? (
                  <>
                    <Check aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Đã chép</span>
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Sao chép</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {showSearchPanel && (
          <div id="expense-search-panel" className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
            <div className="relative flex items-center">
              <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                name="expense-search"
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm khoản chi, ghi chú…"
                aria-label="Tìm khoản chi"
                className="w-full min-h-[38px] pl-9 pr-9 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 focus:border-brand focus:bg-white text-xs font-medium text-slate-900 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa từ khóa"
                  className="absolute right-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X aria-hidden="true" className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="relative flex items-center">
                <select
                  name="category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Lọc danh mục"
                  className={`w-full min-h-[36px] pl-3 pr-7 py-1 rounded-xl border text-xs font-semibold appearance-none transition-colors ${
                    categoryFilter !== 'all'
                      ? 'border-brand bg-brand-soft/60 text-brand'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <option value="all">Mọi danh mục</option>
                  <option value="__transfer__">Chuyển tiền</option>
                  {sortCategoriesTailOrder(categories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5" />
              </div>

              <div className="relative flex items-center">
                <select
                  name="member-filter"
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  aria-label="Lọc theo người trả"
                  className={`w-full min-h-[36px] pl-3 pr-7 py-1 rounded-xl border text-xs font-semibold appearance-none transition-colors ${
                    memberFilter !== 'all'
                      ? 'border-brand bg-brand-soft/60 text-brand'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <option value="all">Mọi người trả</option>
                  {[...members]
                    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
                <ChevronDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2.5" />
              </div>
            </div>

            {(hasActiveFilter || deletedCount > 0 || showDeleted) && (
              <div className="pt-0.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex flex-wrap items-center gap-2.5">
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-brand font-bold hover:underline cursor-pointer"
                    >
                      Bỏ lọc
                    </button>
                  )}
                  {(deletedCount > 0 || showDeleted) && (
                    <button
                      type="button"
                      aria-pressed={showDeleted}
                      onClick={() => setShowDeleted((prev) => !prev)}
                      className={`inline-flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                        showDeleted ? 'text-rose-700 font-semibold' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      <Trash2 aria-hidden="true" className="w-3 h-3" />
                      <span>{showDeleted ? 'Ẩn đã xóa' : `Đã xóa (${deletedCount})`}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-700 text-center">
            <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
            <span>
              {config.tripStatus === 'completed'
                ? 'Chuyến đi đang khóa sổ — Mở khóa trong Cài đặt nếu cần sửa hoặc xóa khoản chi.'
                : 'Quyền Admin đang mở — Chạm vào bất kỳ khoản chi nào để sửa hoặc xóa.'}
            </span>
          </div>
        )}
      </section>

      {/* Danh sách giao dịch theo ngày */}
      {groupedDays.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white border border-slate-200/90 shadow-2xs text-center space-y-2.5">
          <div className="text-sm font-bold text-slate-800">
            {hasActiveFilter ? 'Không tìm thấy giao dịch phù hợp' : 'Chưa có giao dịch nào'}
          </div>
          {hasActiveFilter ? (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[36px] px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <span>Xóa bộ lọc</span>
            </button>
          ) : (
            config.tripStatus !== 'completed' && (
              <button
                type="button"
                onClick={onOpenAddModal}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus aria-hidden="true" className="w-4 h-4" />
                <span>Thêm giao dịch</span>
              </button>
            )
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {groupedDays.map((group, grpIdx) => (
            <section key={group.groupKey} className="space-y-1.5">
              <div className="px-0.5 flex items-center justify-between text-xs">
                <div
                  className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
                    grpIdx === 0 ? 'text-brand' : 'text-slate-600'
                  }`}
                >
                  <Play
                    aria-hidden="true"
                    className={`w-3 h-3 fill-current ${
                      grpIdx === 0 ? 'text-brand' : 'text-slate-400'
                    }`}
                  />
                  <h3>{group.headerTitle}</h3>
                </div>
                {group.totalExpense > 0 && (
                  <span className="font-mono text-xs font-bold text-slate-600 tabular-nums">
                    {formatVND(group.totalExpense)}
                  </span>
                )}
              </div>

              <div className="divide-y divide-slate-100 rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
                {group.items.map((exp) => {
                  const isTransfer = exp.type === 'transfer';
                  const payerMember = getMember(exp.payer);
                  const cat = getCategory(exp.categoryId);
                  const IconComp = isTransfer
                    ? ArrowRightLeft
                    : CATEGORY_ICON_MAP[cat?.icon || 'Package'] || Package;

                  const recipientId = isTransfer
                    ? Object.keys(exp.splits || {})[0] || ''
                    : '';
                  const recipientMember = isTransfer ? getMember(recipientId) : undefined;

                  const isTripLocked = config.tripStatus === 'completed';
                  const canModify = canMemberModifyExpense(
                    exp,
                    currentUserId,
                    members,
                    isAdmin,
                    config.tripStatus
                  );

                  const participantCount = getExpenseParticipantHeadcount(
                    exp.splits,
                    memberMap
                  );

                  const mySplit =
                    !isTransfer && currentUserId ? exp.splits?.[currentUserId] || 0 : 0;
                  const currentGroupSize = currentUserId
                    ? getMemberGroupSize(memberMap.get(currentUserId))
                    : 1;
                  const myPerPersonSplit =
                    mySplit > 0 && currentGroupSize > 1
                      ? splitPerGroupMember(mySplit, currentGroupSize)
                      : null;

                  const hasSyncIssue =
                    exp.syncStatus === 'conflict' || exp.syncStatus === 'error';
                  const isPendingSync =
                    exp.syncStatus === 'pending' || exp.syncStatus === 'syncing';

                  const rowContent = (
                    <>
                      {/* Trái: Icon tròn + Thông tin chính */}
                      <div className="flex items-start gap-3 min-w-0 flex-1 text-left">
                        <div
                          aria-hidden="true"
                          className={`w-9 h-9 mt-0.5 rounded-full flex items-center justify-center shrink-0 ${
                            isTransfer
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-brand-soft text-brand'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-1.5">
                            <span
                              className={`text-sm font-bold text-slate-900 line-clamp-2 leading-snug ${
                                exp.deleted ? 'line-through text-slate-600' : ''
                              }`}
                            >
                              {exp.title}
                            </span>
                            {!canModify && !exp.deleted && (
                              <Lock
                                aria-hidden="true"
                                className="w-3 h-3 mt-1 text-slate-400 shrink-0"
                              />
                            )}
                            {hasSyncIssue && (
                              <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5 mt-0.5 text-rose-700 shrink-0" />
                            )}
                            {isPendingSync && (
                              <Clock aria-hidden="true" className="w-3 h-3 mt-1 text-amber-700 shrink-0" />
                            )}
                          </div>
                          {(hasSyncIssue || isPendingSync) && (
                            <div className="mt-0.5">
                              {exp.syncStatus === 'conflict' ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[10px] font-bold text-rose-700">
                                  Xung đột phiên bản (Chưa lên Sheet)
                                </span>
                              ) : exp.syncStatus === 'error' ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[10px] font-bold text-rose-700">
                                  {isTripLocked
                                    ? 'Chưa lên Sheet (Chuyến đi đã khóa sổ)'
                                    : 'Chưa lên Sheet (Lỗi đồng bộ)'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-800">
                                  Chờ đồng bộ lên Sheet
                                </span>
                              )}
                            </div>
                          )}

                          <div className="mt-0.5 text-xs text-slate-600 flex items-center gap-1 truncate">
                            {isTransfer ? (
                              <>
                                <span className="font-semibold text-slate-800">
                                  {payerMember?.name || exp.payer}
                                </span>
                                <ArrowRight aria-hidden="true" className="w-3 h-3 text-slate-500 shrink-0" />
                                <span className="font-semibold text-slate-800">
                                  {recipientMember?.name || recipientId}
                                </span>
                              </>
                            ) : (
                              <span>
                                <strong className="font-semibold text-slate-800">
                                  {payerMember?.name || exp.payer}
                                </strong>{' '}
                                · Chia {participantCount}
                              </span>
                            )}
                          </div>

                          {exp.note && (
                            <div className="mt-0.5 text-[11px] text-slate-600 line-clamp-1">
                              {exp.note}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Phải: Số tiền tổng + Phần của bạn (chỉ hiển thị số, bỏ đơn vị đ) */}
                      <div className="text-right shrink-0">
                        <div
                          className={`text-sm font-mono font-extrabold tabular-nums ${
                            exp.deleted
                              ? 'text-slate-600 line-through'
                              : isTransfer
                              ? 'text-amber-800'
                              : 'text-slate-900'
                          }`}
                        >
                          {formatVND(exp.amount, false)}
                        </div>

                        <div className="mt-0.5 text-[11px] font-mono tabular-nums">
                          {exp.deleted ? (
                            <span className="text-rose-700 font-sans font-semibold">
                              {isAdmin && !isTripLocked ? 'Đã xóa (Chạm để sửa)' : 'Đã xóa'}
                            </span>
                          ) : isTransfer ? (
                            <span className="text-amber-800 font-sans font-medium">
                              Chuyển riêng
                            </span>
                          ) : mySplit > 0 ? (
                            <span className="text-brand font-semibold">
                              {myPerPersonSplit
                                ? `Bạn: ${myPerPersonSplit.isExact ? '' : '~'}${formatVND(
                                    myPerPersonSplit.perPerson,
                                    false
                                  )}/ng`
                                : `Bạn: ${formatVND(mySplit, false)}`}
                            </span>
                          ) : (
                            <span className="text-slate-600 font-sans">Không chia</span>
                          )}
                        </div>
                      </div>
                    </>
                  );

                  return (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => {
                        if (isTripLocked) {
                          if (onRequestAdminUnlock) {
                            onRequestAdminUnlock(exp);
                          }
                          return;
                        }
                        if (canModify) {
                          onEditRecord(exp);
                        } else if (onRequestAdminUnlock) {
                          onRequestAdminUnlock(exp);
                        }
                      }}
                      className={`w-full px-3.5 py-3 flex items-start justify-between gap-3 transition-colors hover:bg-slate-50 active:bg-slate-100/80 cursor-pointer text-left ${
                        exp.deleted ? 'bg-rose-50/30 opacity-65' : ''
                      }`}
                    >
                      {rowContent}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {hasMoreItems && (
            <div ref={loadMoreSentinelRef} className="pt-1 flex justify-center">
              <button
                type="button"
                onClick={() =>
                  setVisibleLimit((prev) => Math.min(filteredExpenses.length, prev + 100))
                }
                className="min-h-[40px] px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                Xem thêm {Math.min(100, filteredExpenses.length - visibleLimit)} /{' '}
                {filteredExpenses.length - visibleLimit} giao dịch còn lại
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

