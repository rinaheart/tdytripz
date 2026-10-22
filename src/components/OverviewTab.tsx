import React, { useMemo } from 'react';
import {
  ArrowRight,
  Car,
  Hotel,
  MapPin,
  Package,
  Plane,
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
  formatDayGroupHeader,
  formatVND,
  readVietnameseNumber,
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

export const OverviewTab: React.FC<OverviewTabProps> = ({
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

  return (
    <div className="space-y-4">
      {/* 1. Thẻ Tổng chi (Hero Card) - Điểm nhấn màu chủ đạo duy nhất, không dùng khung lồng khung */}
      <section className="p-4 sm:p-5 rounded-md bg-brand text-white">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-100">
          <span>TỔNG CHI · {activeExpenses.length} KHOẢN</span>
          {config.location && (
            <span className="inline-flex items-center gap-1 font-normal normal-case tracking-normal text-blue-100 truncate">
              <MapPin aria-hidden="true" className="w-3 h-3 shrink-0 text-blue-200" />
              <span className="truncate">{config.location}</span>
            </span>
          )}
        </div>

        <div className="mt-1 text-[30px] sm:text-[34px] leading-tight font-mono font-extrabold tracking-tight text-white tabular-nums">
          {formatVND(totalTripExpense, true)}
        </div>

        <div className="mt-1 text-[11px] sm:text-xs text-blue-100 leading-snug">
          {readVietnameseNumber(totalTripExpense)}
        </div>

        {/* Hàng thông số phụ: Bình quân/người (trái) & Thành viên (canh phải) */}
        <div className="mt-4 pt-3.5 border-t border-white/25 grid grid-cols-2 gap-4 items-center">
          <div className="min-w-0">
            <div className="text-[11px] text-blue-100">Bình quân/người</div>
            <div className="mt-0.5 text-sm sm:text-base font-mono font-bold text-white tabular-nums truncate">
              ~{formatVND(averagePerPerson, false)}
            </div>
          </div>

          <div className="min-w-0 border-l border-white/25 pl-4 text-right">
            <div className="text-[11px] text-blue-100">Thành viên</div>
            <div className="mt-0.5 text-sm sm:text-base font-mono font-bold text-white tabular-nums">
              {String(activeMemberCount).padStart(2, '0')}{' '}
              <span className="text-xs font-normal text-blue-100">người</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Số liệu của bạn - Tinh gọn, đưa Số dư ròng nằm ngang cân đối */}
      {currentMember && myBalance && (
        <section className="p-3.5 sm:p-4 rounded-md bg-white border border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MemberAvatar member={currentMember} size="xs" />
              <h2 className="text-sm font-bold text-slate-900 truncate text-balance">
                Số liệu của bạn
              </h2>
              <span className="text-xs text-slate-600 font-medium truncate">
                · {currentMember.name}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('settlement')}
              className="py-1 px-2 -mr-1.5 rounded-sm text-xs font-semibold text-brand hover:bg-brand-soft flex items-center gap-1 transition-colors shrink-0"
            >
              <span>Chi tiết</span>
              <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          {/* Tâm điểm: Số dư ròng tinh gọn trên 1 hàng */}
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <div className="text-xs text-slate-600 min-w-0 truncate">
              <span>Số dư ròng</span>
              <span
                className={`ml-1 font-semibold ${
                  myBalance.balance > 0
                    ? 'text-emerald-800'
                    : myBalance.balance < 0
                    ? 'text-rose-700'
                    : 'text-slate-600'
                }`}
              >
                ·{' '}
                {myBalance.balance > 0
                  ? 'Cần nhận'
                  : myBalance.balance < 0
                  ? 'Cần trả'
                  : 'Cân bằng'}
              </span>
            </div>

            <div
              className={`text-xl sm:text-2xl leading-none font-mono font-extrabold tabular-nums shrink-0 ${
                myBalance.balance > 0
                  ? 'text-emerald-800'
                  : myBalance.balance < 0
                  ? 'text-rose-700'
                  : 'text-slate-800'
              }`}
            >
              {myBalance.balance > 0 ? '+' : ''}
              {formatVND(myBalance.balance, true)}
            </div>
          </div>

          {/* Hàng phụ: Đã chi (trái) & Phải chịu (canh phải) */}
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-4 items-center">
            <div className="min-w-0">
              <div className="text-[11px] text-slate-600">Đã chi</div>
              <div className="mt-0.5 text-sm font-mono font-bold text-slate-900 tabular-nums">
                {formatVND(myBalance.paidExpense, false)}
              </div>
            </div>
            <div className="min-w-0 border-l border-slate-100 pl-4 text-right">
              <div className="text-[11px] text-slate-600">Phải chịu</div>
              <div className="mt-0.5 text-sm font-mono font-bold text-slate-900 tabular-nums">
                {formatVND(myBalance.owedExpense, false)}
              </div>
            </div>
          </div>

          {myBalance.netTransfer !== 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-600">
                {myBalance.netTransfer > 0 ? 'Đã chuyển trả trước' : 'Đã nhận trả trước'}
              </span>
              <span className="font-mono font-bold text-amber-800 tabular-nums">
                {myBalance.netTransfer > 0 ? '+' : ''}
                {formatVND(myBalance.netTransfer, false)}
              </span>
            </div>
          )}
        </section>
      )}

      {/* 3. Theo danh mục & Theo ngày - Tối giản chữ tối đa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Theo danh mục */}
        <section className="p-4 rounded-md bg-white border border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[15px] font-bold text-slate-900 text-balance">Theo danh mục</h2>
            <button
              type="button"
              onClick={() => onNavigateTab('expenses')}
              className="py-1 px-2 -mr-1.5 rounded-sm text-xs font-semibold text-brand hover:bg-brand-soft flex items-center gap-1 transition-colors shrink-0"
            >
              <span>Tất cả</span>
              <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          {categoryStats.length === 0 ? (
            <div className="py-5 text-center text-xs text-slate-600">Chưa có dữ liệu</div>
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
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span aria-hidden="true" className="shrink-0">
                          <IconComp className="w-3.5 h-3.5 text-brand" />
                        </span>
                        <span className="font-medium text-slate-900 truncate">
                          {category.name}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 shrink-0 font-mono tabular-nums">
                        <span className="text-[11px] text-slate-600 font-medium">
                          {pct}%
                        </span>
                        <span className="font-bold text-slate-900 text-right">
                          {formatVND(total, false)}
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-sm bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-sm bg-brand transition-[width]"
                        style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Theo ngày */}
        <section className="p-4 rounded-md bg-white border border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-[15px] font-bold text-slate-900 text-balance">Theo ngày</h2>
          </div>

          {dailyStats.length === 0 ? (
            <div className="py-5 text-center text-xs text-slate-600">Chưa có dữ liệu</div>
          ) : (
            <div className="space-y-3">
              {dailyStats.map((day) => {
                const pct =
                  totalTripExpense > 0
                    ? Math.round((day.total / totalTripExpense) * 100)
                    : 0;
                return (
                  <div key={day.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="font-medium text-slate-900 truncate min-w-0">
                        {day.label}
                      </span>
                      <div className="flex items-baseline gap-2 shrink-0 font-mono tabular-nums">
                        <span className="text-[11px] text-slate-600 font-medium">
                          {pct}%
                        </span>
                        <span className="font-bold text-slate-900 text-right">
                          {formatVND(day.total, false)}
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-sm bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-sm bg-brand transition-[width]"
                        style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
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
  );
};
