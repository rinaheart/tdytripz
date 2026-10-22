import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  ChevronDown,
  Clock,
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
import type { Category, ExpenseRecord, Member, TripConfig } from '../types';
import { formatDayGroupHeader, formatVND } from '../utils/format';
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
}

export const ExpensesTab: React.FC<ExpensesTabProps> = ({
  config,
  members,
  categories,
  expenses,
  currentUserId,
  isAdmin,
  onEditRecord,
  onRequestAdminUnlock,
  onOpenAddModal,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [showDeleted, setShowDeleted] = useState<boolean>(false);

  const getMember = (id: string) => members.find((m) => m.id === id);
  const getCategory = (id: string) => categories.find((c) => c.id === id);

  const deletedCount = useMemo(
    () => expenses.filter((e) => e.deleted).length,
    [expenses]
  );

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses
      .filter((exp) => {
        if (!showDeleted && exp.deleted) return false;
        if (categoryFilter === '__transfer__') {
          if (exp.type !== 'transfer') return false;
        } else if (categoryFilter !== 'all') {
          if (exp.type !== 'expense' || exp.categoryId !== categoryFilter) return false;
        }
        if (memberFilter !== 'all') {
          const selectedMember = members.find((m) => m.id === memberFilter);
          const cleanPayer = String(exp.payer || '').trim();
          const isIdMatch = cleanPayer === memberFilter;
          const isNameMatch =
            selectedMember &&
            cleanPayer.toLowerCase() === selectedMember.name.trim().toLowerCase();
          if (!isIdMatch && !isNameMatch) return false;
        }
        if (q) {
          const payerName = getMember(exp.payer)?.name?.toLowerCase() || '';
          const matchTitle = exp.title.toLowerCase().includes(q);
          const matchNote = (exp.note || '').toLowerCase().includes(q);
          const matchPayer = payerName.includes(q);
          if (!matchTitle && !matchNote && !matchPayer) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmpSpent = (b.spentAt || '').localeCompare(a.spentAt || '');
        if (cmpSpent !== 0) return cmpSpent;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [expenses, showDeleted, categoryFilter, memberFilter, searchQuery, members]);

  const groupedDays = useMemo(() => {
    const groups: {
      groupKey: string;
      headerTitle: string;
      totalExpense: number;
      items: ExpenseRecord[];
    }[] = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const exp of filteredExpenses) {
      const dateStr = (exp.spentAt || '').slice(0, 10);
      const isPreTrip = config.startDate && dateStr < config.startDate;
      const groupKey = isPreTrip ? 'PRE_TRIP' : dateStr;
      const headerTitle = formatDayGroupHeader(dateStr, config.startDate, config.endDate);

      let grp = map.get(groupKey);
      if (!grp) {
        grp = {
          groupKey,
          headerTitle,
          totalExpense: 0,
          items: [],
        };
        map.set(groupKey, grp);
        groups.push(grp);
      }
      if (!exp.deleted && exp.type === 'expense') {
        grp.totalExpense += Math.round(exp.amount || 0);
      }
      grp.items.push(exp);
    }

    return groups;
  }, [filteredExpenses, config.startDate, config.endDate]);

  const hasActiveFilter =
    searchQuery.trim() !== '' || categoryFilter !== 'all' || memberFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setMemberFilter('all');
  };

  return (
    <div className="space-y-3.5">
      {/* Thanh tìm kiếm & bộ lọc tinh gọn theo phong cách TdyTime */}
      <section className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
        <div className="relative flex items-center">
          <Search aria-hidden="true" className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="search"
            name="expense-search"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm khoản chi, ghi chú…"
            aria-label="Tìm khoản chi"
            className="w-full min-h-[38px] pl-9 pr-8 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 focus:border-brand focus:bg-white text-xs font-medium text-slate-900 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Xóa từ khóa"
              className="absolute right-2 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
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
          <div className="pt-0.5 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span>{filteredExpenses.length} khoản</span>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-brand font-bold hover:underline"
                >
                  Bỏ lọc
                </button>
              )}
            </div>

            {(deletedCount > 0 || showDeleted) && (
              <button
                type="button"
                aria-pressed={showDeleted}
                onClick={() => setShowDeleted((prev) => !prev)}
                className={`inline-flex items-center gap-1 font-medium transition-colors ${
                  showDeleted ? 'text-rose-700 font-semibold' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Trash2 aria-hidden="true" className="w-3 h-3" />
                <span>{showDeleted ? 'Ẩn đã xóa' : `Đã xóa (${deletedCount})`}</span>
              </button>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="pt-1.5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
            <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
            <span>Quyền Admin đang mở — Chạm vào bất kỳ khoản chi nào để sửa hoặc xóa.</span>
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

                  const currentMemberName =
                    members.find((m) => m.id === currentUserId)?.name?.trim().toLowerCase() || '';
                  const isOwnRecord =
                    Boolean(currentUserId) &&
                    (exp.createdBy === currentUserId ||
                      exp.payer === currentUserId ||
                      (currentMemberName !== '' &&
                        (String(exp.createdBy || '').trim().toLowerCase() === currentMemberName ||
                          String(exp.payer || '').trim().toLowerCase() === currentMemberName)));

                  const canModify =
                    isAdmin ||
                    (!exp.deleted && config.tripStatus !== 'completed' && isOwnRecord);

                  const participantCount = Object.values(exp.splits || {}).filter(
                    (v) => v > 0
                  ).length;

                  const mySplit =
                    !isTransfer && currentUserId ? exp.splits?.[currentUserId] || 0 : 0;

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

                      {/* Phải: Số tiền tổng + Phần của bạn */}
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
                          {formatVND(exp.amount)}
                        </div>

                        <div className="mt-0.5 text-[11px] font-mono tabular-nums">
                          {exp.deleted ? (
                            <span className="text-rose-700 font-sans font-semibold">
                              {isAdmin ? 'Đã xóa (Chạm để sửa)' : 'Đã xóa'}
                            </span>
                          ) : isTransfer ? (
                            <span className="text-amber-800 font-sans font-medium">
                              Chuyển riêng
                            </span>
                          ) : mySplit > 0 ? (
                            <span className="text-brand font-semibold">
                              Bạn: {formatVND(mySplit)}
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
        </div>
      )}
    </div>
  );
};
