import type {
  Category,
  DebtTransaction,
  ExpenseRecord,
  Member,
  MemberBalance,
  TripConfig,
} from '../types';
import { formatShortDateVN, formatVND, getNowGMT7 } from './format';
import {
  calculateBalances,
  calculatePairwiseDebts,
  simplifyDebts,
} from './math';

export interface ExpenseReportRow {
  id: string;
  date: string;
  title: string;
  payerId: string;
  payerName: string;
  amount: number;
  amountFormatted: string;
  memberShare: number | null;
  memberShareFormatted: string | null;
  typeLabel: string;
  compactTypeLabel: string;
  categoryIcon: string;
  recordType: 'expense' | 'transfer';
  participantsSummary: string;
}

export interface MemberReportSummary {
  memberId: string;
  memberName: string;
  paidExpense: number;
  owedExpense: number;
  sentTransfer: number;
  receivedTransfer: number;
  balance: number;
}

export interface ReportCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface ReportDayBreakdown {
  dateKey: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface EnrichedMemberBalance extends MemberBalance {
  memberName: string;
  avatarColor: string;
  bankInfo: string;
}

export interface EnrichedDebtTransaction extends DebtTransaction {
  fromMemberName: string;
  toMemberName: string;
  toBankInfo: string;
}

export interface MemberAppendixData {
  memberId: string;
  memberName: string;
  avatarColor: string;
  bankInfo: string;
  paidExpense: number;
  owedExpense: number;
  sentTransfer: number;
  receivedTransfer: number;
  netTransfer: number;
  balance: number;
  finalSettlementActions: EnrichedDebtTransaction[];
  byCategory: ReportCategoryBreakdown[];
  paidRows: ExpenseReportRow[];
  participatedRows: ExpenseReportRow[];
}

export interface ExpenseReportOverview {
  totalExpenseAmount: number;
  totalTransferAmount: number;
  expenseCount: number;
  transferCount: number;
  memberCount: number;
  averagePerMember: number;
  byCategory: ReportCategoryBreakdown[];
  byDay: ReportDayBreakdown[];
}

export interface ExpenseReportSettlement {
  balances: EnrichedMemberBalance[];
  simplifiedDebts: EnrichedDebtTransaction[];
  pairwiseDebts: EnrichedDebtTransaction[];
}

export interface ExpenseReportData {
  tripId: string;
  tripName: string;
  location: string;
  dateRangeLabel: string;
  generatedAt: string;
  filterMemberId: string;
  scopeLabel: string;
  rows: ExpenseReportRow[];
  totalExpenseAmount: number;
  totalTransferAmount: number;
  memberSummary: MemberReportSummary | null;
  overview: ExpenseReportOverview;
  settlement: ExpenseReportSettlement;
  memberAppendices: MemberAppendixData[];
  suggestedFileName: string;
}

export function formatSpentAtReportVN(spentAt: string): string {
  if (!spentAt) return '';
  const clean = spentAt.trim();
  const datePart = clean.slice(0, 10);
  const timePart = clean.length >= 16 ? clean.slice(11, 16) : '';
  const shortDate = formatShortDateVN(datePart);
  return timePart ? `${shortDate} ${timePart}` : shortDate;
}

export function sanitizeFileNameSegment(input: string): string {
  return (input || 'report')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function shortenCategoryLabelForTable(label: string): string {
  if (!label) return 'Khác';
  const withoutParens = label.replace(/\s*\([^)]*\)/g, '').trim();
  const normalized = withoutParens
    .replace(/^Di chuyển tại chỗ$/i, 'Di chuyển')
    .replace(/^Khách sạn\s*\/\s*Lưu trú$/i, 'Lưu trú')
    .replace(/^Vé máy bay\s*\/\s*Tàu xe$/i, 'Vé đi/về')
    .trim();
  return normalized || label;
}

function resolveCategoryIconName(cat?: Category, rawName?: string): string {
  const icon = (cat?.icon || '').trim();
  if (
    icon === 'Plane' ||
    icon === 'Car' ||
    icon === 'Utensils' ||
    icon === 'Hotel' ||
    icon === 'Ticket' ||
    icon === 'Package'
  ) {
    return icon;
  }
  const n = (rawName || cat?.name || '').toLowerCase();
  const id = (cat?.id || '').toLowerCase();
  if (id.includes('flight') || n.includes('vé đi') || n.includes('máy bay') || n.includes('tàu')) {
    return 'Plane';
  }
  if (
    id.includes('transport') ||
    id.includes('move') ||
    n.includes('di chuyển') ||
    n.includes('taxi') ||
    n.includes('xe')
  ) {
    return 'Car';
  }
  if (id.includes('food') || n.includes('ăn') || n.includes('uống') || n.includes('cafe')) {
    return 'Utensils';
  }
  if (
    id.includes('hotel') ||
    n.includes('lưu trú') ||
    n.includes('khách sạn') ||
    n.includes('homestay')
  ) {
    return 'Hotel';
  }
  if (id.includes('ticket') || n.includes('tham quan') || n.includes('vé chơi')) {
    return 'Ticket';
  }
  return 'Package';
}

export function formatMemberBankInfo(member?: Member): string {
  if (!member) return '';
  const cleanAccountNo = String(member.accountNo || '')
    .replace(/\s+/g, '')
    .replace(/^'+/, '');
  const cleanBank = String(member.bankName || '').trim();
  if (cleanAccountNo && cleanBank) {
    return `${cleanBank} • ${cleanAccountNo}`;
  }
  if (cleanAccountNo) {
    return `STK: ${cleanAccountNo}`;
  }
  return cleanBank;
}

function getEffectiveRecordAmount(record: ExpenseRecord): number {
  const splitSum = Object.values(record.splits || {}).reduce(
    (acc, val) => acc + Math.round(val || 0),
    0
  );
  return splitSum > 0 ? splitSum : Math.round(record.amount || 0);
}

function formatParticipantsSummary(
  record: ExpenseRecord,
  memberMap: Map<string, Member>,
  totalActiveMembersCount: number
): string {
  const entries = Object.entries(record.splits || {}).filter(
    ([, val]) => Math.round(val || 0) > 0
  );
  if (entries.length === 0) return '—';

  const names = entries.map(([id]) => memberMap.get(id)?.name || id);
  if (record.type === 'transfer') {
    const payerName = memberMap.get(record.payer)?.name || record.payer;
    return `${payerName} → ${names.join(', ')}`;
  }

  // Nếu khoản chi chia hết cho tất cả thành viên trong đoàn thì chỉ ghi "xx người"
  if (totalActiveMembersCount > 0 && entries.length >= totalActiveMembersCount) {
    return `${entries.length} người`;
  }

  if (names.length <= 3) {
    return names.join(', ');
  }
  return `${names.length} người (${names.slice(0, 2).join(', ')}…)`;
}

function computeDayLabel(datePart: string, startDate?: string): string {
  if (!datePart || datePart.length < 10) return 'Chưa rõ ngày';
  const shortVN = formatShortDateVN(datePart);
  if (!startDate || startDate.length < 10) {
    return shortVN;
  }
  if (datePart < startDate) {
    return `Trước chuyến (${shortVN.slice(0, 5)})`;
  }
  const startMs = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const curMs = Date.parse(`${datePart.slice(0, 10)}T00:00:00Z`);
  if (!Number.isNaN(startMs) && !Number.isNaN(curMs)) {
    const diffDays = Math.floor((curMs - startMs) / 86400000) + 1;
    if (diffDays >= 1 && diffDays <= 60) {
      return `Ngày ${diffDays} (${shortVN})`;
    }
  }
  return shortVN;
}

export function buildExpenseReportData(params: {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
  filterMemberId: string; // 'all' hoặc member.id
}): ExpenseReportData {
  const { config, members, categories, expenses, filterMemberId } = params;
  const normalizedFilter = filterMemberId && filterMemberId !== 'all' ? filterMemberId : 'all';

  const activeMembers = members.filter((m) => m.active !== false);
  const memberCount = activeMembers.length;
  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const categoryMap = new Map<string, Category>();
  for (const c of categories) {
    categoryMap.set(c.id, c);
  }

  const allActiveRecords = expenses
    .filter((e) => !e.deleted)
    .sort((a, b) => {
      const cmp = (a.spentAt || '').localeCompare(b.spentAt || '');
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });

  // 1. Tính toán Overview cho toàn chuyến đi
  let fullExpenseTotal = 0;
  let fullTransferTotal = 0;
  let fullExpenseCount = 0;
  let fullTransferCount = 0;

  const catAgg = new Map<string, { name: string; icon: string; amount: number; count: number }>();
  const dayAgg = new Map<string, { label: string; amount: number; count: number }>();

  for (const rec of allActiveRecords) {
    const effAmount = getEffectiveRecordAmount(rec);
    if (rec.type === 'transfer') {
      fullTransferTotal += effAmount;
      fullTransferCount += 1;
    } else {
      fullExpenseTotal += effAmount;
      fullExpenseCount += 1;

      const catId = rec.categoryId || 'cat_other';
      const catObj = categoryMap.get(catId);
      const catName = shortenCategoryLabelForTable(catObj?.name || 'Khác');
      const catIcon = resolveCategoryIconName(catObj, catName);
      const curCat = catAgg.get(catId) || { name: catName, icon: catIcon, amount: 0, count: 0 };
      curCat.amount += effAmount;
      curCat.count += 1;
      catAgg.set(catId, curCat);

      const dateKey = (rec.spentAt || '').trim().slice(0, 10) || 'unknown';
      const curDay = dayAgg.get(dateKey) || {
        label: computeDayLabel(dateKey, config.startDate),
        amount: 0,
        count: 0,
      };
      curDay.amount += effAmount;
      curDay.count += 1;
      dayAgg.set(dateKey, curDay);
    }
  }

  const byCategory: ReportCategoryBreakdown[] = Array.from(catAgg.entries())
    .map(([categoryId, item]) => ({
      categoryId,
      categoryName: item.name,
      categoryIcon: item.icon,
      amount: item.amount,
      count: item.count,
      percentage:
        fullExpenseTotal > 0 ? Math.round((item.amount / fullExpenseTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const byDay: ReportDayBreakdown[] = Array.from(dayAgg.entries())
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([dateKey, item]) => ({
      dateKey,
      label: item.label,
      amount: item.amount,
      count: item.count,
      percentage:
        fullExpenseTotal > 0 ? Math.round((item.amount / fullExpenseTotal) * 1000) / 10 : 0,
    }));

  const averagePerMember = memberCount > 0 ? Math.round(fullExpenseTotal / memberCount) : 0;

  // 2. Tính toán Chia tiền & Quyết toán (Settlement)
  const rawBalances = calculateBalances(activeMembers, allActiveRecords);
  const enrichedBalances: EnrichedMemberBalance[] = rawBalances.map((b) => {
    const m = memberMap.get(b.memberId);
    return {
      ...b,
      memberName: m?.name || b.memberId,
      avatarColor: m?.avatarColor || '#0f766e',
      bankInfo: formatMemberBankInfo(m),
    };
  });

  const enrichDebtList = (list: DebtTransaction[]): EnrichedDebtTransaction[] =>
    list.map((d) => {
      const fromM = memberMap.get(d.fromMemberId);
      const toM = memberMap.get(d.toMemberId);
      return {
        ...d,
        fromMemberName: fromM?.name || d.fromMemberId,
        toMemberName: toM?.name || d.toMemberId,
        toBankInfo: formatMemberBankInfo(toM),
      };
    });

  const simplifiedDebts = enrichDebtList(simplifyDebts(rawBalances));
  const pairwiseDebts = enrichDebtList(calculatePairwiseDebts(activeMembers, allActiveRecords));

  // Helper tạo ExpenseReportRow
  const toReportRow = (
    e: ExpenseRecord,
    targetMemberId: string | null
  ): ExpenseReportRow => {
    const cleanAmount = getEffectiveRecordAmount(e);
    const payerName = memberMap.get(e.payer)?.name || e.payer;
    const catObj = categoryMap.get(e.categoryId);
    const rawCatName = catObj?.name || 'Khác';
    const typeLabel = e.type === 'transfer' ? 'Chuyển trả' : shortenCategoryLabelForTable(rawCatName);
    const compactTypeLabel = typeLabel;
    const categoryIcon =
      e.type === 'transfer' ? 'ArrowRightLeft' : resolveCategoryIconName(catObj, typeLabel);
    const memberShare =
      targetMemberId === null ? null : Math.round(e.splits?.[targetMemberId] || 0);

    return {
      id: e.id,
      date: formatSpentAtReportVN(e.spentAt),
      title: e.title || (e.type === 'transfer' ? 'Chuyển khoản quyết toán' : 'Khoản chi'),
      payerId: e.payer,
      payerName,
      amount: cleanAmount,
      amountFormatted: formatVND(cleanAmount, false),
      memberShare,
      memberShareFormatted: memberShare !== null ? formatVND(memberShare, false) : null,
      typeLabel,
      compactTypeLabel,
      categoryIcon,
      recordType: e.type,
      participantsSummary: formatParticipantsSummary(e, memberMap, memberCount),
    };
  };

  // 3. Xây dựng danh sách bản ghi theo bộ lọc chính
  const filteredRecords = allActiveRecords.filter((e) => {
    if (normalizedFilter === 'all') return true;
    const isPayer = e.payer === normalizedFilter;
    const share = Math.round(e.splits?.[normalizedFilter] || 0);
    return isPayer || share > 0;
  });

  let totalExpenseAmount = 0;
  let totalTransferAmount = 0;

  const rows: ExpenseReportRow[] = filteredRecords.map((e) => {
    const cleanAmount = getEffectiveRecordAmount(e);
    if (e.type === 'transfer') {
      totalTransferAmount += cleanAmount;
    } else {
      totalExpenseAmount += cleanAmount;
    }
    return toReportRow(e, normalizedFilter === 'all' ? null : normalizedFilter);
  });

  // 4. Xây dựng Phụ lục chi tiết từng thành viên (Member Appendices)
  const buildAppendixForMember = (m: Member): MemberAppendixData => {
    const bal = enrichedBalances.find((b) => b.memberId === m.id);
    const paidExpense = bal?.paidExpense || 0;
    const owedExpense = bal?.owedExpense || 0;
    const sentTransfer = bal?.sentTransfer || 0;
    const receivedTransfer = bal?.receivedTransfer || 0;
    const netTransfer = bal?.netTransfer || 0;
    const balance = bal?.balance || 0;

    const finalSettlementActions = simplifiedDebts.filter(
      (d) => d.fromMemberId === m.id || d.toMemberId === m.id
    );

    const paidRows = allActiveRecords
      .filter((e) => e.payer === m.id)
      .map((e) => toReportRow(e, m.id));

    const participatedRows = allActiveRecords
      .filter((e) => Math.round(e.splits?.[m.id] || 0) > 0)
      .map((e) => toReportRow(e, m.id));

    const personalCatMap = new Map<string, { name: string; icon: string; amount: number; count: number }>();
    let personalTotalOwed = 0;

    for (const e of allActiveRecords) {
      if (e.type !== 'expense') continue;
      const myShare = Math.round(e.splits?.[m.id] || 0);
      if (myShare <= 0) continue;
      personalTotalOwed += myShare;
      const catId = e.categoryId || 'cat_other';
      const catObj = categoryMap.get(catId);
      const catName = shortenCategoryLabelForTable(catObj?.name || 'Khác');
      const catIcon = resolveCategoryIconName(catObj, catName);
      const cur = personalCatMap.get(catId) || { name: catName, icon: catIcon, amount: 0, count: 0 };
      cur.amount += myShare;
      cur.count += 1;
      personalCatMap.set(catId, cur);
    }

    const personalByCategory: ReportCategoryBreakdown[] = Array.from(personalCatMap.entries())
      .map(([categoryId, item]) => ({
        categoryId,
        categoryName: item.name,
        categoryIcon: item.icon,
        amount: item.amount,
        count: item.count,
        percentage:
          personalTotalOwed > 0
            ? Math.round((item.amount / personalTotalOwed) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      memberId: m.id,
      memberName: m.name,
      avatarColor: m.avatarColor || '#0f766e',
      bankInfo: formatMemberBankInfo(m),
      paidExpense,
      owedExpense,
      sentTransfer,
      receivedTransfer,
      netTransfer,
      balance,
      finalSettlementActions,
      byCategory: personalByCategory,
      paidRows,
      participatedRows,
    };
  };

  const targetMembersForAppendix =
    normalizedFilter === 'all'
      ? activeMembers
      : activeMembers.filter((m) => m.id === normalizedFilter);

  const memberAppendices = targetMembersForAppendix.map(buildAppendixForMember);

  let memberSummary: MemberReportSummary | null = null;
  let scopeLabel = 'Toàn bộ chuyến đi';

  if (normalizedFilter !== 'all') {
    const targetMember = memberMap.get(normalizedFilter);
    const memberName = targetMember?.name || normalizedFilter;
    scopeLabel = `Thành viên: ${memberName}`;
    const foundBalance = enrichedBalances.find((b) => b.memberId === normalizedFilter);

    memberSummary = {
      memberId: normalizedFilter,
      memberName,
      paidExpense: foundBalance?.paidExpense || 0,
      owedExpense: foundBalance?.owedExpense || 0,
      sentTransfer: foundBalance?.sentTransfer || 0,
      receivedTransfer: foundBalance?.receivedTransfer || 0,
      balance: foundBalance?.balance || 0,
    };
  }

  const tripSlug = sanitizeFileNameSegment(config.tripName || config.tripId || 'chuyen-di');
  const scopeSlug =
    normalizedFilter === 'all'
      ? 'all'
      : sanitizeFileNameSegment(memberSummary?.memberName || normalizedFilter);

  const dateRangeLabel =
    config.startDate && config.endDate
      ? `${formatShortDateVN(config.startDate)} - ${formatShortDateVN(config.endDate)}`
      : config.startDate
        ? formatShortDateVN(config.startDate)
        : '';

  return {
    tripId: config.tripId,
    tripName: config.tripName || 'Chuyến đi',
    location: config.location || '',
    dateRangeLabel,
    generatedAt: formatSpentAtReportVN(getNowGMT7(false)),
    filterMemberId: normalizedFilter,
    scopeLabel,
    rows,
    totalExpenseAmount,
    totalTransferAmount,
    memberSummary,
    overview: {
      totalExpenseAmount: fullExpenseTotal,
      totalTransferAmount: fullTransferTotal,
      expenseCount: fullExpenseCount,
      transferCount: fullTransferCount,
      memberCount,
      averagePerMember,
      byCategory,
      byDay,
    },
    settlement: {
      balances: enrichedBalances,
      simplifiedDebts,
      pairwiseDebts,
    },
    memberAppendices,
    suggestedFileName: `bao-cao-${tripSlug}-${scopeSlug}.pdf`,
  };
}
