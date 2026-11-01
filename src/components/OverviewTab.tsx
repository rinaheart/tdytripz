import React, { useMemo } from 'react';
import {
  Car,
  ChevronRight,
  Hotel,
  Package,
  Plane,
  Play,
  Ticket,
  Utensils,
} from 'lucide-react';
import type {
  Category,
  ExpenseRecord,
  Member,
  MemberBalance,
  TripConfig,
} from '../types';
import {
  formatDateRangeVN,
  formatDayGroupHeader,
  formatVND,
  getTripDurationShort,
} from '../utils/format';
import { MemberAvatar } from './MemberAvatar';
import type { ActiveTab } from './Navbar';

interface OverviewTabProps {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
  balances: MemberBalance[];
  currentUserId: string | null;
  onNavigateTab: (tab: ActiveTab) => void;
  onOpenAddModal?: () => void;
}

export const CATEGORY_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Plane,
  Car,
  Utensils,
  Hotel,
  Ticket,
  Package,
  '✈️': Plane,
  '🚕': Car,
  '🍜': Utensils,
  '🏨': Hotel,
  '🎟️': Ticket,
  '🛍️': Package,
  '📦': Package,
};

export const OverviewTab: React.FC<OverviewTabProps> = React.memo(({
  config,
  members,
  categories,
  expenses,
  balances,
  currentUserId,
  onNavigateTab,
}) => {
  const activeExpenses = useMemo(
    () => expenses.filter((e) => !e.deleted && e.type === 'expense'),
    [expenses]
  );

  const totalTripExpense = useMemo(
    () => activeExpenses.reduce((sum, e) => sum + Math.round(e.amount || 0), 0),
    [activeExpenses]
  );

  const activeMemberCount = useMemo(
    () => Math.max(1, members.filter((m) => m.active).length),
    [members]
  );

  const averagePerPerson = Math.round(totalTripExpense / activeMemberCount);

  const myBalance = useMemo(
    () => balances.find((b) => b.memberId === currentUserId) || null,
    [balances, currentUserId]
  );

  const currentMember = useMemo(
    () => members.find((m) => m.id === currentUserId) || null,
    [members, currentUserId]
  );

  const categoryStats = useMemo(() => {
    const map = new Map<string, { category: Category; total: number; count: number }>();
    for (const c of categories) {
      map.set(c.id, { category: c, total: 0, count: 0 });
    }

    for (const exp of activeExpenses) {
      const entry = map.get(exp.categoryId) || {
        category: {
          id: exp.categoryId,
          name: 'Khác',
          icon: 'Package',
          order: 99,
          hidden: false,
        },
        total: 0,
        count: 0,
      };
      entry.total += Math.round(exp.amount || 0);
      entry.count += 1;
      map.set(exp.categoryId, entry);
    }

    return Array.from(map.values())
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [categories, activeExpenses]);

  const dailyStats = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; total: number; count: number; sortKey: string }
    >();

    for (const exp of activeExpenses) {
      const datePart = (exp.spentAt || '').slice(0, 10);
      const isPreTrip = config.startDate && datePart < config.startDate;
      const groupKey = isPreTrip ? 'PRE_TRIP' : datePart;
      const label = formatDayGroupHeader(datePart, config.startDate, config.endDate);
      const sortKey = isPreTrip ? '0000-00-00' : datePart;

      const existing = map.get(groupKey) || {
        key: groupKey,
        label,
        total: 0,
        count: 0,
        sortKey,
      };
      existing.total += Math.round(exp.amount || 0);
      existing.count += 1;
      map.set(groupKey, existing);
    }

    return Array.from(map.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [activeExpenses, config.startDate, config.endDate]);

  const tripDurationShort = useMemo(
    () => getTripDurationShort(config.startDate, config.endDate),
    [config.startDate, config.endDate]
  );

  const tripPlaceLabel = useMemo(() => {
    const rawPlace = (config.location || config.tripName || 'Chuyến đi').trim();
    if (tripDurationShort && !rawPlace.toUpperCase().includes(tripDurationShort)) {
      return `${rawPlace} · ${tripDurationShort}`;
    }
    return rawPlace;
  }, [config.location, config.tripName, tripDurationShort]);

  const tripDateRange = useMemo(
    () => formatDateRangeVN(config.startDate, config.endDate),
    [config.startDate, config.endDate]
  );

  return (
    <div className="space-y-3">
      {/* 1. Hero Card: Địa điểm · Số ngày đêm (Trái) | Thời gian chuyến đi (Phải) + Tổng chi + Bình quân */}
      <section className="p-3.5 sm:p-4 rounded-2xl bg-white border-2 border-brand shadow-sm shadow-brand/5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand min-w-0">
            <Play aria-hidden="true" className="w-3 h-3 fill-current shrink-0" />
            <span className="truncate">{tripPlaceLabel}</span>
          </div>

          <span className="text-[11px] font-mono font-semibold text-slate-500 tabular-nums shrink-0">
            {tripDateRange}
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2 py-0.5">
          <span className="text-xs font-semibold text-slate-500 shrink-0">
            Tổng chi toàn đoàn
          </span>
          <div className="text-[26px] sm:text-3xl leading-none font-mono font-extrabold tracking-tight text-slate-900 tabular-nums text-right ml-auto">
            {formatVND(totalTripExpense, true)}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
          <span className="text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">
            {activeExpenses.length} khoản · {activeMemberCount} người
          </span>

          <div className="text-slate-600 font-medium truncate text-right ml-auto">
            <span>Bình quân: </span>
            <strong className="font-mono font-bold text-slate-800 tabular-nums">
              ~{formatVND(averagePerPerson, false)}/người
            </strong>
          </div>
        </div>
      </section>

      {/* 2. Số liệu của bạn (Tinh gọn trong 1 Card duy nhất) */}
      {currentMember && myBalance && (
        <section className="p-3.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MemberAvatar member={currentMember} size="sm" />
              <span className="text-xs font-bold text-slate-800 truncate">
                {currentMember.name}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${
                  myBalance.balance > 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : myBalance.balance < 0
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                {myBalance.balance > 0
                  ? 'Cần nhận'
                  : myBalance.balance < 0
                  ? 'Cần trả'
                  : 'Cân bằng'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('settlement')}
              className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
            >
              <span>Chia tiền</span>
              <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-baseline justify-between gap-2 py-0.5">
            <span className="text-xs font-semibold text-slate-500 shrink-0">
              {myBalance.balance > 0
                ? 'Tổng cần nhận'
                : myBalance.balance < 0
                ? 'Tổng cần trả'
                : 'Số dư hiện tại'}
            </span>
            <div
              className={`text-2xl sm:text-[26px] leading-none font-mono font-extrabold tabular-nums text-right ml-auto ${
                myBalance.balance > 0
                  ? 'text-emerald-700'
                  : myBalance.balance < 0
                  ? 'text-rose-600'
                  : 'text-slate-800'
              }`}
            >
              {myBalance.balance > 0 ? '+' : ''}
              {formatVND(myBalance.balance, true)}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3 items-center text-xs">
            <div className="min-w-0">
              <span className="text-slate-500">Đã chi: </span>
              <strong className="font-mono font-bold text-slate-800 tabular-nums">
                {formatVND(myBalance.paidExpense, false)}
              </strong>
            </div>
            <div className="min-w-0 text-right">
              <span className="text-slate-500">Phải chịu: </span>
              <strong className="font-mono font-bold text-slate-800 tabular-nums">
                {formatVND(myBalance.owedExpense, false)}
              </strong>
            </div>
          </div>

          {myBalance.netTransfer !== 0 && (
            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {myBalance.netTransfer > 0 ? 'Đã chuyển trước' : 'Đã nhận trước'}
              </span>
              <span className="font-mono font-bold text-amber-700 tabular-nums">
                {myBalance.netTransfer > 0 ? '+' : ''}
                {formatVND(myBalance.netTransfer, false)}
              </span>
            </div>
          )}
        </section>
      )}

      {/* 3. Bento Grid: Theo danh mục & Theo ngày */}
      <div className="space-y-1.5">
        <div className="px-0.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            <Play aria-hidden="true" className="w-3 h-3 fill-current text-slate-400" />
            <span>THỐNG KÊ</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('expenses')}
            className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-0.5 cursor-pointer"
          >
            <span>Chi tiết</span>
            <ChevronRight aria-hidden="true" className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Theo danh mục */}
          <section className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Theo danh mục
            </h2>

            {categoryStats.length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-500">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-3">
                {categoryStats.map(({ category, total }) => {
                  const pct =
                    totalTripExpense > 0
                      ? Math.round((total / totalTripExpense) * 100)
                      : 0;
                  const IconComp = CATEGORY_ICON_MAP[category.icon] || Package;
                  return (
                    <div key={category.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span aria-hidden="true" className="shrink-0">
                            <IconComp className="w-3.5 h-3.5 text-brand" />
                          </span>
                          <span className="font-semibold text-slate-800 truncate">
                            {category.name}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2 shrink-0 font-mono tabular-nums">
                          <span className="text-[11px] text-slate-400 font-medium">
                            {pct}%
                          </span>
                          <span className="font-bold text-slate-800 text-right">
                            {formatVND(total, false)}
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand transition-[width]"
                          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Theo ngày */}
          <section className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Theo ngày
            </h2>

            {dailyStats.length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-500">Chưa có dữ liệu</div>
            ) : (
              <div className="space-y-3">
                {dailyStats.map((day) => {
                  const pct =
                    totalTripExpense > 0
                      ? Math.round((day.total / totalTripExpense) * 100)
                      : 0;
                  return (
                    <div key={day.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 truncate min-w-0">
                          {day.label}
                        </span>
                        <div className="flex items-baseline gap-2 shrink-0 font-mono tabular-nums">
                          <span className="text-[11px] text-slate-400 font-medium">
                            {pct}%
                          </span>
                          <span className="font-bold text-slate-800 text-right">
                            {formatVND(day.total, false)}
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand transition-[width]"
                          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
});

