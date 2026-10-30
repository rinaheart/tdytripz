import type {
  Category,
  DebtTransaction,
  ExpenseRecord,
  Member,
  MemberBalance,
  TripConfig,
} from '../types';
import { formatShortDateVN, formatVND, getNowGMT7 } from './format';
import { calculateBalances, calculatePairwiseDebts, simplifyDebts } from './math';

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
  if (id.includes('transport') || id.includes('move') || n.includes('di chuyển') || n.includes('taxi') || n.includes('xe')) {
    return 'Car';
  }
  if (id.includes('food') || n.includes('ăn') || n.includes('uống') || n.includes('cafe')) {
    return 'Utensils';
  }
  if (id.includes('hotel') || n.includes('lưu trú') || n.includes('khách sạn') || n.includes('homestay')) {
    return 'Hotel';
  }
  if (id.includes('ticket') || n.includes('tham quan') || n.includes('vé chơi')) {
    return 'Ticket';
  }
  return 'Package';
}

function formatMemberBankInfo(member?: Member): string {
  if (!member) return '';
  const parts: string[] = [];
  if (member.bankName) parts.push(member.bankName.trim());
  if (member.accountNo) parts.push(member.accountNo.trim());
  if (member.accountHolder) parts.push(`(${member.accountHolder.trim()})`);
  return parts.join(' • ');
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

// ============================================================================
// CDN LOADER CHO JSPDF & JSPDF-AUTOTABLE + FONT ROBOTO UNICODE TIẾNG VIỆT
// ============================================================================

const JSPDF_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE_CDN_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
const ROBOTO_REGULAR_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf';
const ROBOTO_MEDIUM_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf';

let cachedRobotoRegularBase64: string | null = null;
let cachedRobotoMediumBase64: string | null = null;

function loadExternalScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Không thể tải thư viện: ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Không thể tải thư viện từ CDN: ${src}`));
    };
    document.head.appendChild(script);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return window.btoa(binary);
}

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) {
    throw new Error(`Không thể tải font Unicode từ CDN (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return arrayBufferToBase64(buf);
}

async function ensureRobotoFontsLoaded(): Promise<{ regular: string; medium: string } | null> {
  try {
    if (!cachedRobotoRegularBase64 || !cachedRobotoMediumBase64) {
      const [reg, med] = await Promise.all([
        fetchFontBase64(ROBOTO_REGULAR_TTF_URL),
        fetchFontBase64(ROBOTO_MEDIUM_TTF_URL),
      ]);
      cachedRobotoRegularBase64 = reg;
      cachedRobotoMediumBase64 = med;
    }
    return {
      regular: cachedRobotoRegularBase64,
      medium: cachedRobotoMediumBase64,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// HỆ THỐNG RENDER ICON LUCIDE (TƯƠNG ĐỒNG 100% VỚI WEB APP) + VECTOR ARROW SYMBOL
// ============================================================================

const LUCIDE_ICON_PATHS: Record<string, string[]> = {
  Plane: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ],
  Car: [
    'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
    'M7 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M9 17h6',
  ],
  Utensils: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  ],
  Hotel: [
    'M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z',
    'M9 22v-4h6v4',
    'M8 6h.01',
    'M16 6h.01',
    'M12 6h.01',
    'M12 10h.01',
    'M12 14h.01',
    'M16 10h.01',
    'M16 14h.01',
    'M8 10h.01',
    'M8 14h.01',
  ],
  Ticket: [
    'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
    'M13 5v2',
    'M13 17v2',
    'M13 11v2',
  ],
  Package: [
    'm7.5 4.27 9 5.15',
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'm3.3 7 8.7 5 8.7-5',
    'M12 22V12',
  ],
  Wallet: [
    'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
    'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  ],
  Users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  PieChart: [
    'M21.21 15.89A10 10 0 1 1 8 2.83',
    'M22 12A10 10 0 0 0 12 2v10z',
  ],
  Award: [
    'M6 9a6 6 0 1 0 12 0A6 6 0 1 0 6 9',
    'M15.477 12.89 17 22l-5-3-5 3 1.523-9.11',
  ],
  Calendar: [
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  ],
  ArrowRightLeft: [
    'm16 3 4 4-4 4',
    'M20 7H4',
    'm8 21-4-4 4-4',
    'M4 17h16',
  ],
  Send: [
    'm22 2-7 20-4-9-9-4Z',
    'M22 2 11 13',
  ],
  CheckCircle: [
    'M22 11.08V12a10 10 0 1 1-5.93-9.14',
    'm9 11 3 3L22 4',
  ],
  MapPin: [
    'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z',
    'M9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  ],
  // 4 Icon chuyên biệt trên các tab nhô cao của Hero Banner Trang 1 (lấy cảm hứng từ mẫu thiết kế)
  BannerTrain: [
    'M8 3.2h8',
    'M10.5 3.2v2.3',
    'M13.5 3.2v2.3',
    'M6.5 5.5h11a2 2 0 0 1 2 2v8.5a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 16V7.5a2 2 0 0 1 2-2Z',
    'M6.5 11.5h11',
    'M7.8 7.8h8.4v2.4H7.8Z',
    'M7.5 15a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
    'M14.5 15a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
    'M5.5 21.5 8 18.5',
    'M18.5 21.5 16 18.5',
    'M6.5 20.2h11',
  ],
  BannerTraveler: [
    'M14.5 4.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M16.5 8.2 14 13.5l-2.2 5.8',
    'M15.2 13.2 18.5 19.3',
    'M16 9l-3.8 2.8-2.4-.8',
    'M16.3 9l2.9 2.8 1.8 1.2',
    'M9.8 11l-3.2 4.5',
    'M3.5 14.8 6.8 12l2.6 2.2-3.3 3.9-2.6-3.3Z',
    'M4.2 19.6a.8.8 0 1 0 1.6 0 .8.8 0 1 0-1.6 0',
    'M6.8 19.6a.8.8 0 1 0 1.6 0 .8.8 0 1 0-1.6 0',
  ],
  BannerPlane: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ],
  BannerCoins: [
    'M3.5 11.5a4 1.6 0 1 0 8 0 4 1.6 0 1 0-8 0',
    'M3.5 11.5v6.8c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6v-6.8',
    'M3.5 13.8c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6',
    'M3.5 16.1c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6',
    'M12.5 6.2a4 1.6 0 1 0 8 0 4 1.6 0 1 0-8 0',
    'M12.5 6.2v12.1c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6V6.2',
    'M12.5 8.6c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6',
    'M12.5 11c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6',
    'M12.5 13.4c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6',
    'M12.5 15.8c0 .9 1.8 1.6 4 1.6s4-.7 4-1.6',
  ],
};

const iconDataUrlCache = new Map<string, string>();

function renderLucideIconDataUrl(
  iconName: string,
  strokeRgb: [number, number, number],
  bgRgb?: [number, number, number],
  lineWidth = 2.25
): string | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;

  const cacheKey = `${iconName}_${strokeRgb.join(',')}_${bgRgb ? bgRgb.join(',') : 'none'}_${lineWidth}`;
  const cached = iconDataUrlCache.get(cacheKey);
  if (cached) return cached;

  try {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (bgRgb) {
      ctx.fillStyle = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`;
      const r = 28;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();
    }

    const pad = bgRgb ? 26 : 8;
    const scale = (size - pad * 2) / 24;
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(scale, scale);
    ctx.strokeStyle = `rgb(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]})`;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const paths = LUCIDE_ICON_PATHS[iconName] || LUCIDE_ICON_PATHS.Package;
    for (const d of paths) {
      const p = new Path2D(d);
      ctx.stroke(p);
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    iconDataUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

function drawIconBadge(
  doc: any,
  iconName: string,
  x: number,
  y: number,
  sizeMm: number,
  strokeRgb: [number, number, number],
  bgRgb?: [number, number, number],
  lineWidth = 2.25
): void {
  const dataUrl = renderLucideIconDataUrl(iconName, strokeRgb, bgRgb, lineWidth);
  if (dataUrl) {
    doc.addImage(dataUrl, 'PNG', x, y, sizeMm, sizeMm);
    return;
  }
  if (bgRgb) {
    doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
    doc.roundedRect(x, y, sizeMm, sizeMm, sizeMm * 0.22, sizeMm * 0.22, 'F');
  }
}

/**
 * Vẽ ký hiệu mũi tên vector (→) sắc nét tuyệt đối không phụ thuộc vào glyph của font
 */
function drawVectorArrowSymbol(
  doc: any,
  startX: number,
  centerY: number,
  lengthMm: number,
  rgb: [number, number, number]
): void {
  const headLen = 1.25;
  const headHalfH = 0.78;
  const endX = startX + lengthMm;
  const shaftEndX = endX - headLen * 0.65;

  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.4);
  doc.line(startX, centerY, shaftEndX, centerY);
  doc.triangle(
    endX,
    centerY,
    endX - headLen,
    centerY - headHalfH,
    endX - headLen,
    centerY + headHalfH,
    'F'
  );
}

/**
 * Vẽ cặp "Người chuyển → Người nhận" với mũi tên vector chính xác ở giữa
 */
function drawTransferPairWithArrow(
  doc: any,
  activeFont: string,
  fontStyle: 'normal' | 'bold',
  fontSize: number,
  leftText: string,
  rightText: string,
  startX: number,
  baselineY: number,
  leftRgb: [number, number, number],
  arrowRgb: [number, number, number],
  rightRgb: [number, number, number]
): number {
  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(leftRgb[0], leftRgb[1], leftRgb[2]);
  doc.text(leftText, startX, baselineY);

  const leftW = doc.getTextWidth(leftText);
  const gap = 2.1;
  const arrowLen = 3.8;
  const arrowStartX = startX + leftW + gap;
  const arrowCenterY = baselineY - fontSize * 0.115;

  drawVectorArrowSymbol(doc, arrowStartX, arrowCenterY, arrowLen, arrowRgb);

  const rightX = arrowStartX + arrowLen + gap;
  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(rightRgb[0], rightRgb[1], rightRgb[2]);
  doc.text(rightText, rightX, baselineY);

  return rightX + doc.getTextWidth(rightText);
}

function hexToRgb(hex: string, fallback: [number, number, number] = [13, 148, 136]): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return fallback;
}

// ============================================================================
// HỆ MÀU EXECUTIVE REPORT LẤY CẢM HỨNG TỪ MẪU BUSINESS TRIP EXPENSE REPORT
// ============================================================================

const COLOR_BANNER_GREEN: [number, number, number] = [67, 160, 77]; // #43A04D — Signature Top & Footer Green
const COLOR_BANNER_GREEN_DARK: [number, number, number] = [46, 125, 55]; // #2E7D37 — Deep Green Accent
const COLOR_META_CREAM: [number, number, number] = [245, 232, 203]; // #F5E8CB — Warm Sand/Cream Metadata Strip
const COLOR_TOTAL_SAGE: [number, number, number] = [183, 221, 162]; // #B7DDA2 — Soft Sage Green Total Box & Table Foot
const COLOR_TABLE_SLATE_GREEN: [number, number, number] = [78, 109, 99]; // #4E6D63 — Slate-Green Table Header
const COLOR_HERO_DARK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_HERO_CARD: [number, number, number] = [30, 41, 59]; // Slate 800
const COLOR_INK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_SLATE: [number, number, number] = [71, 85, 105]; // Slate 600
const COLOR_MUTED: [number, number, number] = [100, 116, 139]; // Slate 500
const COLOR_BORDER: [number, number, number] = [214, 221, 228]; // Crisp Grid Border
const COLOR_TEAL: [number, number, number] = [13, 148, 136]; // Teal 600
const COLOR_TEAL_DARK: [number, number, number] = [15, 118, 110]; // Teal 700
const COLOR_EMERALD_BRIGHT: [number, number, number] = [52, 211, 153]; // Emerald 400
const COLOR_ROSE: [number, number, number] = [225, 29, 72]; // Rose 600
const COLOR_ROSE_DARK: [number, number, number] = [190, 18, 60]; // Rose 700

const CATEGORY_THEME_MAP: Record<
  string,
  { stroke: [number, number, number]; bg: [number, number, number]; bar: [number, number, number] }
> = {
  Plane: {
    stroke: [37, 99, 235],
    bg: [219, 234, 254],
    bar: [37, 99, 235], // Blue 600
  },
  Utensils: {
    stroke: [217, 119, 6],
    bg: [254, 243, 199],
    bar: [245, 158, 11], // Amber 500
  },
  Hotel: {
    stroke: [124, 58, 237],
    bg: [237, 233, 254],
    bar: [124, 58, 237], // Violet 600
  },
  Car: {
    stroke: [13, 148, 136],
    bg: [204, 251, 241],
    bar: [13, 148, 136], // Teal 600
  },
  Ticket: {
    stroke: [219, 39, 119],
    bg: [252, 231, 243],
    bar: [219, 39, 119], // Pink 600
  },
  Package: {
    stroke: [71, 85, 105],
    bg: [226, 232, 240],
    bar: [100, 116, 139], // Slate 500
  },
};

const DAY_BAR_PALETTE: Array<[number, number, number]> = [
  [67, 160, 77], // Forest Green
  [13, 148, 136], // Teal 600
  [14, 116, 144], // Cyan 700
  [2, 132, 199], // Sky 600
  [37, 99, 235], // Blue 600
  [124, 58, 237], // Violet 600
];

function ensurePageSpace(doc: any, cursorY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - 15) {
    doc.addPage();
    return 13;
  }
  return cursorY;
}

function computeDaysAndNightsLabel(report: ExpenseReportData): string {
  const range = (report.dateRangeLabel || '').trim();
  const parts = range.split('-').map((s) => s.trim());
  if (parts.length === 2) {
    const parseVN = (dStr: string): number => {
      const m = dStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return Number.NaN;
      return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    };
    const t1 = parseVN(parts[0]);
    const t2 = parseVN(parts[1]);
    if (!Number.isNaN(t1) && !Number.isNaN(t2) && t2 >= t1) {
      const days = Math.round((t2 - t1) / 86400000) + 1;
      const nights = Math.max(0, days - 1);
      return nights > 0 ? `${days}N/${nights}Đ (${days} ngày ${nights} đêm)` : `${days} ngày`;
    }
  }
  const activeDays = report.overview.byDay.length;
  if (activeDays > 1) {
    return `${activeDays}N/${activeDays - 1}Đ (${activeDays} ngày chi tiêu)`;
  }
  return activeDays === 1 ? '1 ngày' : 'Toàn chuyến đi';
}

function truncateTextToWidth(doc: any, text: string, maxWidthMm: number): string {
  const clean = (text || '').trim();
  if (!clean) return '—';
  if (doc.getTextWidth(clean) <= maxWidthMm) return clean;
  let sliced = clean;
  while (sliced.length > 1 && doc.getTextWidth(`${sliced}…`) > maxWidthMm) {
    sliced = sliced.slice(0, -1);
  }
  return `${sliced}…`;
}

/**
 * Vẽ Hero Masthead Trang 1 lấy cảm hứng trực tiếp từ mẫu "Business Trip Expense Report":
 * - Thanh Banner xanh lá chủ đạo kèm 4 Tab bo tròn nhô cao bên trái chứa 4 Icon Du lịch & Chi tiêu
 * - Dải thông tin 2 cột màu kem cát ấm (Warm Cream) gắn liền phía dưới
 * - Ô nổi bật "Tổng chi tiêu" màu xanh cốm (Soft Sage Green) bên phải
 */
function drawExecutiveMasthead(
  doc: any,
  activeFont: string,
  report: ExpenseReportData,
  subtitleBadge: string,
  marginX: number,
  startY: number,
  pageWidth: number
): number {
  const fullW = pageWidth - marginX * 2;
  const tabProtrusion = 4.6;
  const tabTopY = startY;
  const bannerY = tabTopY + tabProtrusion;
  const bannerH = 14.8;
  const metaStripY = bannerY + bannerH;
  const metaStripH = 19.6;

  // 1. Vẽ 4 Tab Icon nhô cao bên trái (hòa nhập liền khối với thanh Banner xanh lá)
  const tabIcons = ['BannerTrain', 'BannerTraveler', 'BannerPlane', 'BannerCoins'];
  const tabW = 13.6;
  const tabGap = 1.6;
  const tabTotalH = tabProtrusion + bannerH;

  doc.setFillColor(...COLOR_BANNER_GREEN);
  // Thanh banner ngang chính
  doc.rect(marginX, bannerY, fullW, bannerH, 'F');

  tabIcons.forEach((iconName, idx) => {
    const tabX = marginX + idx * (tabW + tabGap);
    doc.setFillColor(...COLOR_BANNER_GREEN);
    doc.roundedRect(tabX, tabTopY, tabW, tabTotalH, 2.2, 2.2, 'F');
    // Che phần bo góc dưới để nối liền hoàn hảo vào banner chính
    doc.rect(tabX, bannerY, tabW, bannerH, 'F');

    // Vẽ Icon trắng sắc nét bên trong mỗi tab
    const iconSize = 11.4;
    const iconX = tabX + (tabW - iconSize) / 2;
    const iconY = tabTopY + 2.4;
    drawIconBadge(
      doc,
      iconName,
      iconX,
      iconY,
      iconSize,
      [255, 255, 255],
      COLOR_BANNER_GREEN,
      1.85
    );
  });

  // 2. Tiêu đề Báo cáo nổi bật bên phải 4 Tab Icon
  const titleStartX = marginX + tabIcons.length * (tabW + tabGap) + 3.8;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.1);
  doc.setTextColor(220, 252, 231);
  doc.text(`TDYTRIP  •  ${subtitleBadge.toUpperCase()}`, titleStartX, bannerY + 4.8);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(15.2);
  doc.setTextColor(255, 255, 255);
  const bannerTitle = truncateTextToWidth(
    doc,
    `BÁO CÁO CHI TIÊU: ${report.tripName.toUpperCase()}`,
    pageWidth - marginX - titleStartX - 3
  );
  doc.text(bannerTitle, titleStartX, bannerY + 11.8);

  // 3. Dải Metadata 2 cột màu kem ấm (bên trái) + Hộp Tổng chi tiêu màu xanh cốm (bên phải)
  const rightTotalBoxW = 48;
  const leftMetaW = fullW - rightTotalBoxW;

  // Nền kem ấm (Warm Cream)
  doc.setFillColor(...COLOR_META_CREAM);
  doc.rect(marginX, metaStripY, leftMetaW, metaStripH, 'F');

  // Nền xanh cốm (Soft Sage Green) cho ô Tổng chi tiêu bên phải
  const totalBoxX = marginX + leftMetaW;
  doc.setFillColor(...COLOR_TOTAL_SAGE);
  doc.rect(totalBoxX, metaStripY, rightTotalBoxW, metaStripH, 'F');

  // Đường viền mỏng tinh tế bao quanh khối Metadata
  doc.setDrawColor(214, 202, 175);
  doc.setLineWidth(0.2);
  doc.line(marginX, metaStripY + metaStripH, marginX + leftMetaW, metaStripY + metaStripH);
  doc.setDrawColor(158, 201, 136);
  doc.line(totalBoxX, metaStripY + metaStripH, totalBoxX + rightTotalBoxW, metaStripY + metaStripH);

  // Nội dung 2 cột Metadata trong dải màu kem
  const col1LabelX = marginX + 4;
  const col1ValX = marginX + 25.5;
  const col2LabelX = marginX + 68.5;
  const col2ValX = marginX + 89.5;
  const row1Y = metaStripY + 5.4;
  const row2Y = metaStripY + 11.2;
  const row3Y = metaStripY + 17.0;

  const topCategoriesText =
    report.overview.byCategory.length > 0
      ? report.overview.byCategory
          .slice(0, 3)
          .map((c) => shortenCategoryLabelForTable(c.categoryName))
          .join(', ')
      : 'Chưa phát sinh';

  const leftRows: Array<[string, string]> = [
    ['Chuyến đi:', report.tripName || 'Chuyến đi'],
    ['Quy mô đoàn:', `${report.overview.memberCount} thành viên (${report.overview.expenseCount} khoản chi)`],
    ['Hạng mục chính:', topCategoriesText],
  ];

  const rightRows: Array<[string, string]> = [
    ['Thời gian:', report.dateRangeLabel || 'Toàn chuyến đi'],
    ['Thời lượng:', computeDaysAndNightsLabel(report)],
    ['Điểm đến:', report.location || 'Việt Nam'],
  ];

  const rowYs = [row1Y, row2Y, row3Y];
  const col1MaxValW = col2LabelX - col1ValX - 3;
  const col2MaxValW = totalBoxX - col2ValX - 3;

  leftRows.forEach(([label, val], idx) => {
    const ry = rowYs[idx];
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLOR_INK);
    doc.text(label, col1LabelX, ry);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(30, 41, 59);
    doc.text(truncateTextToWidth(doc, val, col1MaxValW), col1ValX, ry);
  });

  rightRows.forEach(([label, val], idx) => {
    const ry = rowYs[idx];
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLOR_INK);
    doc.text(label, col2LabelX, ry);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(30, 41, 59);
    doc.text(truncateTextToWidth(doc, val, col2MaxValW), col2ValX, ry);
  });

  // Nội dung Ô Tổng chi tiêu bên phải (Canh giữa ấn tượng theo mẫu)
  const totalCenterX = totalBoxX + rightTotalBoxW / 2;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(20, 45, 28);
  doc.text('Tổng chi tiêu:', totalCenterX, metaStripY + 5.8, { align: 'center' });

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(12.2);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
    totalCenterX,
    metaStripY + 12.4,
    { align: 'center' }
  );

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(45, 78, 52);
  doc.text(
    `TB: ${formatVND(report.overview.averagePerMember, false)} đ/người`,
    totalCenterX,
    metaStripY + 17.1,
    { align: 'center' }
  );

  return metaStripY + metaStripH + 3.2;
}

function drawSectionHeading(
  doc: any,
  activeFont: string,
  sectionCode: string,
  title: string,
  rightNote: string | null,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const y = ensurePageSpace(doc, cursorY, 10);

  doc.setFillColor(...COLOR_BANNER_GREEN);
  doc.roundedRect(marginX, y - 0.4, 7.2, 4.8, 1.1, 1.1, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(255, 255, 255);
  doc.text(sectionCode, marginX + 3.6, y + 2.9, { align: 'center' });

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, marginX + 9.2, y + 3.0);

  if (rightNote) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...COLOR_TABLE_SLATE_GREEN);
    doc.text(rightNote, pageWidth - marginX, y + 3.0, { align: 'right' });
  }

  return y + 5.8;
}

function drawFourKpiRow(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext?: string;
    iconName: string;
    accentColor: [number, number, number];
    surfaceColor: [number, number, number];
    borderColor: [number, number, number];
    iconBgColor: [number, number, number];
    valueColor?: [number, number, number];
  }>,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const boxHeight = 15.8;
  const y = ensurePageSpace(doc, cursorY, boxHeight + 3);
  const gap = 2.8;
  const totalWidth = pageWidth - marginX * 2;
  const colWidth = (totalWidth - gap * 3) / 4;

  items.slice(0, 4).forEach((item, idx) => {
    const x = marginX + idx * (colWidth + gap);

    doc.setFillColor(item.surfaceColor[0], item.surfaceColor[1], item.surfaceColor[2]);
    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, colWidth, boxHeight, 1.6, 1.6, 'FD');

    doc.setFillColor(item.accentColor[0], item.accentColor[1], item.accentColor[2]);
    doc.roundedRect(x + 0.2, y + 0.2, colWidth - 0.4, 1.1, 0.7, 0.7, 'F');

    drawIconBadge(
      doc,
      item.iconName,
      x + colWidth - 7.2,
      y + 2.2,
      4.8,
      item.accentColor,
      item.iconBgColor
    );

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(item.label.toUpperCase(), x + 2.6, y + 4.8);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9.4);
    const valColor = item.valueColor || COLOR_INK;
    doc.setTextColor(valColor[0], valColor[1], valColor[2]);
    doc.text(item.value, x + 2.6, y + 10.2);

    if (item.subtext) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(6.6);
      doc.setTextColor(...COLOR_SLATE);
      const cleanSub =
        item.subtext.length > 29 ? `${item.subtext.slice(0, 28)}…` : item.subtext;
      doc.text(cleanSub, x + 2.6, y + 14.0);
    }
  });

  return y + boxHeight + 2.8;
}

function drawCompactChartCard(
  doc: any,
  activeFont: string,
  title: string,
  headerIcon: string,
  headerIconColor: [number, number, number],
  headerIconBg: [number, number, number],
  items: Array<{
    label: string;
    iconName: string;
    iconStroke: [number, number, number];
    iconBg: [number, number, number];
    barColor: [number, number, number];
    amount: number;
    count: number;
    percentage: number;
  }>,
  x: number,
  y: number,
  width: number,
  fixedHeight?: number,
  footerSummary?: { leftLabel: string; rightValue: string }
): number {
  const maxItems = items.slice(0, 6);
  const itemHeight = 6.8;
  const headerH = 7.2;
  const footerH = footerSummary ? 5.6 : 0;
  const cardH =
    fixedHeight || Math.max(24, headerH + maxItems.length * itemHeight + footerH + 1.8);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, cardH, 'FD');

  // Header Slate-Green đồng điệu với bảng của mẫu thiết kế
  doc.setFillColor(...COLOR_TABLE_SLATE_GREEN);
  doc.rect(x, y, width, headerH, 'F');

  drawIconBadge(doc, headerIcon, x + 2.6, y + 1.35, 4.4, [255, 255, 255], COLOR_TABLE_SLATE_GREEN);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.9);
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 8.0, y + 4.8);

  let rowY = y + headerH + 0.9;
  const iconSize = 4.0;
  const textStartX = x + 2.8 + iconSize + 1.5;
  const trackW = width - (iconSize + 1.5) - 5.6;

  maxItems.forEach((item, idx) => {
    if (idx > 0) {
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.15);
      doc.line(x + 2, rowY - 0.3, x + width - 2, rowY - 0.3);
    }

    drawIconBadge(doc, item.iconName, x + 2.8, rowY + 0.4, iconSize, item.iconStroke, item.iconBg);

    // Dòng 1: Tên hạng mục / ngày + số khoản chi
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.1);
    doc.setTextColor(...COLOR_INK);
    const cleanLabel =
      item.label.length > 27 ? `${item.label.slice(0, 26)}…` : item.label;
    doc.text(`${cleanLabel} • ${item.count} khoản`, textStartX, rowY + 2.4);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.1);
    doc.setTextColor(item.iconStroke[0], item.iconStroke[1], item.iconStroke[2]);
    doc.text(
      `${formatVND(item.amount, false)} đ (${item.percentage}%)`,
      x + width - 2.8,
      rowY + 2.4,
      { align: 'right' }
    );

    // Dòng 2: Thanh progress bar bo tròn
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(textStartX, rowY + 3.5, trackW, 1.8, 0.7, 0.7, 'F');

    const ratio = Math.max(0, Math.min(1, item.percentage / 100));
    const fillW = Math.max(ratio > 0 ? 1.6 : 0, trackW * ratio);
    if (fillW > 0) {
      doc.setFillColor(item.barColor[0], item.barColor[1], item.barColor[2]);
      doc.roundedRect(textStartX, rowY + 3.5, fillW, 1.8, 0.7, 0.7, 'F');
    }

    rowY += itemHeight;
  });

  // Dải tổng kết màu xanh cốm (Soft Sage Green) ở đáy thẻ như hàng "Category total:" trong mẫu
  if (footerSummary) {
    const footY = y + cardH - footerH;
    doc.setFillColor(...COLOR_TOTAL_SAGE);
    doc.rect(x, footY, width, footerH, 'F');
    doc.setDrawColor(163, 208, 140);
    doc.setLineWidth(0.2);
    doc.line(x, footY, x + width, footY);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(20, 45, 28);
    doc.text(footerSummary.leftLabel, x + 3, footY + 3.8);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);
    doc.text(footerSummary.rightValue, x + width - 2.8, footY + 3.8, { align: 'right' });
  }

  return y + cardH;
}

function drawSideBySideOverviewCharts(
  doc: any,
  activeFont: string,
  byCategory: ReportCategoryBreakdown[],
  byDay: ReportDayBreakdown[],
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const maxRows = Math.max(
    Math.min(6, byCategory.length),
    Math.min(6, byDay.length),
    1
  );
  const sharedHeight = 7.2 + maxRows * 6.8 + 5.6 + 1.4;
  const y = ensurePageSpace(doc, cursorY, sharedHeight + 3);

  const gap = 3.6;
  const fullW = pageWidth - marginX * 2;
  const colW = (fullW - gap) / 2;

  const totalCatAmount = byCategory.reduce((s, c) => s + c.amount, 0);
  const avgDayAmount =
    byDay.length > 0
      ? Math.round(byDay.reduce((s, d) => s + d.amount, 0) / byDay.length)
      : 0;

  drawCompactChartCard(
    doc,
    activeFont,
    'Chi tiêu theo Hạng mục',
    'PieChart',
    [13, 148, 136],
    [204, 251, 241],
    byCategory.map((c) => {
      const theme = CATEGORY_THEME_MAP[c.categoryIcon] || CATEGORY_THEME_MAP.Package;
      return {
        label: shortenCategoryLabelForTable(c.categoryName),
        iconName: c.categoryIcon || 'Package',
        iconStroke: theme.stroke,
        iconBg: theme.bg,
        barColor: theme.bar,
        amount: c.amount,
        count: c.count,
        percentage: c.percentage,
      };
    }),
    marginX,
    y,
    colW,
    sharedHeight,
    {
      leftLabel: `Tổng cộng (${byCategory.length} hạng mục):`,
      rightValue: `${formatVND(totalCatAmount, false)} đ`,
    }
  );

  drawCompactChartCard(
    doc,
    activeFont,
    'Chi tiêu theo Ngày',
    'Calendar',
    [37, 99, 235],
    [219, 234, 254],
    byDay.map((d, idx) => {
      const barCol = DAY_BAR_PALETTE[idx % DAY_BAR_PALETTE.length];
      return {
        label: d.label.replace(/\s*\((\d{2}\/\d{2})\/\d{4}\)/, ' ($1)'),
        iconName: 'Calendar',
        iconStroke: barCol,
        iconBg: [241, 245, 249],
        barColor: barCol,
        amount: d.amount,
        count: d.count,
        percentage: d.percentage,
      };
    }),
    marginX + colW + gap,
    y,
    colW,
    sharedHeight,
    {
      leftLabel: `Trung bình / ngày (${byDay.length} ngày):`,
      rightValue: `${formatVND(avgDayAmount, false)} đ/ngày`,
    }
  );

  return y + sharedHeight + 3.0;
}

function drawMemberBalanceComparisonChart(
  doc: any,
  activeFont: string,
  balances: EnrichedMemberBalance[],
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  if (balances.length === 0) return cursorY;

  const rowHeight = 6.6;
  const headerHeight = 7.2;
  const totalBoxHeight = headerHeight + balances.length * rowHeight + 1.6;

  const y = ensurePageSpace(doc, cursorY, totalBoxHeight + 2.6);
  const fullWidth = pageWidth - marginX * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.rect(marginX, y, fullWidth, totalBoxHeight, 'FD');

  doc.setFillColor(...COLOR_TABLE_SLATE_GREEN);
  doc.rect(marginX, y, fullWidth, headerHeight, 'F');
  drawIconBadge(
    doc,
    'ArrowRightLeft',
    marginX + 2.6,
    y + 1.35,
    4.4,
    [255, 255, 255],
    COLOR_TABLE_SLATE_GREEN
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.9);
  doc.setTextColor(255, 255, 255);
  doc.text('So sánh Đã chi & Phải chịu theo Thành viên', marginX + 8.0, y + 4.8);

  const legendRightX = marginX + fullWidth - 3.2;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(6.9);

  doc.setFillColor(...COLOR_TOTAL_SAGE);
  doc.roundedRect(legendRightX - 53, y + 2.3, 2.6, 2.6, 0.5, 0.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Đã chi', legendRightX - 49.2, y + 4.5);

  doc.setFillColor(203, 213, 225);
  doc.roundedRect(legendRightX - 27, y + 2.3, 2.6, 2.6, 0.5, 0.5, 'F');
  doc.text('Phải chịu', legendRightX - 23.2, y + 4.5);

  const maxVal = Math.max(
    1,
    ...balances.map((b) => Math.max(b.paidExpense, b.owedExpense))
  );

  let rowY = y + headerHeight + 0.8;
  const nameColWidth = 34;
  const statusColWidth = 42;
  const barTrackX = marginX + 3.5 + nameColWidth;
  const barTrackWidth = fullWidth - 7 - nameColWidth - statusColWidth;

  balances.forEach((b, idx) => {
    if (idx > 0) {
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.15);
      doc.line(marginX + 2, rowY - 0.2, marginX + fullWidth - 2, rowY - 0.2);
    }

    const avatarRgb = hexToRgb(b.avatarColor, [67, 160, 77]);
    doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
    doc.circle(marginX + 5.4, rowY + 2.8, 2.0, 'F');
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(6.1);
    doc.setTextColor(255, 255, 255);
    const initial = (b.memberName || '?').trim().charAt(0).toUpperCase();
    doc.text(initial, marginX + 5.4, rowY + 3.5, { align: 'center' });

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLOR_INK);
    const shortName = b.memberName.length > 15 ? `${b.memberName.slice(0, 14)}…` : b.memberName;
    doc.text(shortName, marginX + 8.8, rowY + 3.6);

    // Thanh 1: Đã chi (Forest Green)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 0.7, barTrackWidth, 1.8, 0.6, 0.6, 'F');
    const paidW = Math.max(
      b.paidExpense > 0 ? 1.5 : 0,
      (b.paidExpense / maxVal) * barTrackWidth
    );
    if (paidW > 0) {
      doc.setFillColor(...COLOR_BANNER_GREEN);
      doc.roundedRect(barTrackX, rowY + 0.7, paidW, 1.8, 0.6, 0.6, 'F');
    }

    // Thanh 2: Phải chịu (Slate 400)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 3.1, barTrackWidth, 1.8, 0.6, 0.6, 'F');
    const owedW = Math.max(
      b.owedExpense > 0 ? 1.5 : 0,
      (b.owedExpense / maxVal) * barTrackWidth
    );
    if (owedW > 0) {
      doc.setFillColor(148, 163, 184);
      doc.roundedRect(barTrackX, rowY + 3.1, owedW, 1.8, 0.6, 0.6, 'F');
    }

    // Pill Số dư cuối bên phải
    let balLabel = '0 đ';
    let pillBg: [number, number, number] = [241, 245, 249];
    let pillText: [number, number, number] = COLOR_MUTED;
    if (b.balance > 0) {
      pillBg = [220, 252, 231];
      pillText = COLOR_BANNER_GREEN_DARK;
      balLabel = `+${formatVND(b.balance, false)} đ`;
    } else if (b.balance < 0) {
      pillBg = [255, 228, 230];
      pillText = COLOR_ROSE_DARK;
      balLabel = `${formatVND(b.balance, false)} đ`;
    }

    const pillW = 31;
    const pillX = marginX + fullWidth - 3.0 - pillW;
    doc.setFillColor(pillBg[0], pillBg[1], pillBg[2]);
    doc.roundedRect(pillX, rowY + 0.5, pillW, 4.5, 1.1, 1.1, 'F');

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(pillText[0], pillText[1], pillText[2]);
    doc.text(balLabel, marginX + fullWidth - 4.5, rowY + 3.55, { align: 'right' });

    rowY += rowHeight;
  });

  return y + totalBoxHeight + 2.6;
}

/**
 * Vẽ Khối Ghi chú & Xác nhận đối soát ở cuối Trang 1 (lấy cảm hứng từ khung Notes & Signatures của mẫu)
 */
function drawPageOneNotesAndVerification(
  doc: any,
  activeFont: string,
  report: ExpenseReportData,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const blockH = 20.5;
  const pageHeight = doc.internal.pageSize.getHeight();
  // Chỉ vẽ trên Trang 1 nếu còn đủ chỗ phía trên thanh Footer
  if (doc.internal.getCurrentPageInfo().pageNumber !== 1 || cursorY + blockH > pageHeight - 16) {
    return cursorY;
  }

  const fullW = pageWidth - marginX * 2;
  const y = cursorY + 1.2;

  // Cột trái: Notes: + Khung viền xanh lá bo góc mềm mại
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(...COLOR_INK);
  doc.text('Ghi chú:', marginX, y + 3.5);

  const noteBoxX = marginX + 13.5;
  const noteBoxW = 86;
  const noteBoxH = 17.5;
  doc.setFillColor(252, 254, 252);
  doc.setDrawColor(163, 208, 140);
  doc.setLineWidth(0.3);
  doc.roundedRect(noteBoxX, y, noteBoxW, noteBoxH, 2.6, 2.6, 'FD');

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.1);
  doc.setTextColor(30, 41, 59);
  const debtCount = report.settlement.simplifiedDebts.length;
  const noteLine1 =
    debtCount > 0
      ? `Hệ thống đã tối ưu công nợ toàn đoàn còn ${debtCount} giao dịch chuyển khoản.`
      : 'Toàn bộ thành viên trong chuyến đi đã cân bằng thu chi 100%.';
  doc.text(noteLine1, noteBoxX + 3.2, y + 5.2);
  doc.text(
    'Số liệu chi tiết từng khoản và phụ lục cá nhân được đính kèm ở các trang sau.',
    noteBoxX + 3.2,
    y + 9.8
  );
  doc.setFont(activeFont, 'bold');
  doc.setTextColor(...COLOR_BANNER_GREEN_DARK);
  doc.text(
    '*Vui lòng kiểm tra kỹ STK ngân hàng trước khi thực hiện chuyển khoản.',
    noteBoxX + 3.2,
    y + 14.6
  );

  // Cột phải: 2 cột Xác nhận đối soát & Người lập báo cáo (Phong cách chữ ký chuyên nghiệp)
  const sigCol1X = noteBoxX + noteBoxW + 7;
  const sigColW = (marginX + fullW - sigCol1X - 5) / 2;
  const sigCol2X = sigCol1X + sigColW + 5;

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(...COLOR_INK);
  doc.text('Hệ thống tổng hợp:', sigCol1X, y + 3.2);
  doc.text('Xác nhận quyết toán:', sigCol2X, y + 3.2);

  // Chữ ký cách điệu / Badge đối soát
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_TABLE_SLATE_GREEN);
  doc.text('TdyTrip Auto-Audit', sigCol1X, y + 9.2);

  const topPayer = [...report.settlement.balances].sort(
    (a, b) => b.paidExpense - a.paidExpense
  )[0];
  doc.setTextColor(...COLOR_BANNER_GREEN_DARK);
  doc.text('Đã khớp 100%', sigCol2X, y + 9.2);

  // Đường kẻ ngang dưới chữ ký
  doc.setDrawColor(180, 190, 200);
  doc.setLineWidth(0.25);
  doc.line(sigCol1X, y + 11.2, sigCol1X + sigColW, y + 11.2);
  doc.line(sigCol2X, y + 11.2, sigCol2X + sigColW, y + 11.2);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...COLOR_INK);
  doc.text('Báo cáo tự động', sigCol1X, y + 14.5);
  doc.text(topPayer ? topPayer.memberName : 'Trưởng đoàn', sigCol2X, y + 14.5);

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.7);
  doc.setTextColor(...COLOR_SLATE);
  doc.text(`Xuất: ${report.generatedAt}`, sigCol1X, y + 17.6);
  doc.text('Đại diện thành viên', sigCol2X, y + 17.6);

  return y + blockH;
}

function renderMemberAppendixSection(
  doc: any,
  autoTableFn: any,
  activeFont: string,
  report: ExpenseReportData,
  appendix: MemberAppendixData,
  badgeLabel: string,
  marginX: number,
  startCursorY: number,
  pageWidth: number
): number {
  let cursorY = startCursorY;
  const fullWidth = pageWidth - marginX * 2;

  // Hero Header cho trang Phụ lục cá nhân
  const bannerH = 18.5;
  doc.setFillColor(...COLOR_HERO_DARK);
  doc.roundedRect(marginX, cursorY, fullWidth, bannerH, 2.2, 2.2, 'F');

  const avatarRgb = hexToRgb(appendix.avatarColor, [13, 148, 136]);
  doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
  doc.roundedRect(marginX, cursorY, fullWidth, 1.4, 0.8, 0.8, 'F');

  doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
  doc.circle(marginX + 8.5, cursorY + 10, 4.6, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(10.8);
  doc.setTextColor(255, 255, 255);
  doc.text(
    (appendix.memberName || '?').trim().charAt(0).toUpperCase(),
    marginX + 8.5,
    cursorY + 11.3,
    { align: 'center' }
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.1);
  doc.setTextColor(...COLOR_EMERALD_BRIGHT);
  doc.text(`${badgeLabel}  •  ${report.tripName.toUpperCase()}`, marginX + 16, cursorY + 6.3);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(13.2);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `QUYẾT TOÁN CÁ NHÂN: ${appendix.memberName.toUpperCase()}`,
    marginX + 16,
    cursorY + 13.5
  );

  if (appendix.bankInfo) {
    doc.setFillColor(...COLOR_HERO_CARD);
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.2);
    const bankText = `TK nhận: ${appendix.bankInfo}`;
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    const bw = Math.min(78, doc.getTextWidth(bankText) + 6);
    doc.roundedRect(pageWidth - marginX - bw - 3, cursorY + 5.2, bw, 8, 1.5, 1.5, 'FD');
    doc.setTextColor(226, 232, 240);
    doc.text(bankText, pageWidth - marginX - 6, cursorY + 10.2, { align: 'right' });
  }

  cursorY += bannerH + 3.5;

  // 4 ô KPI cá nhân
  const isPositive = appendix.balance > 0;
  const isNegative = appendix.balance < 0;
  const balanceAccent: [number, number, number] = isPositive
    ? COLOR_TEAL_DARK
    : isNegative
      ? COLOR_ROSE_DARK
      : COLOR_SLATE;
  const balanceSurface: [number, number, number] = isPositive
    ? [240, 253, 250]
    : isNegative
      ? [255, 241, 242]
      : [248, 250, 252];
  const balanceBorder: [number, number, number] = isPositive
    ? [153, 246, 228]
    : isNegative
      ? [254, 205, 211]
      : [226, 232, 240];
  const balanceIconBg: [number, number, number] = isPositive
    ? [204, 251, 241]
    : isNegative
      ? [255, 228, 230]
      : [226, 232, 240];

  const balanceStatusText = isPositive
    ? 'Số tiền được nhận về'
    : isNegative
      ? 'Số tiền cần chuyển trả'
      : 'Đã cân bằng thu chi';
  const balPrefix = isPositive ? '+' : '';

  const hasMemberTransfers =
    appendix.sentTransfer > 0 || appendix.receivedTransfer > 0;
  const shareRatioPct =
    report.overview.totalExpenseAmount > 0
      ? Math.round((appendix.paidExpense / report.overview.totalExpenseAmount) * 1000) / 10
      : 0;

  cursorY = drawFourKpiRow(
    doc,
    activeFont,
    [
      {
        label: 'Đã chi',
        value: `${formatVND(appendix.paidExpense, false)} đ`,
        subtext: `${appendix.paidRows.filter((r) => r.recordType === 'expense').length} khoản (${shareRatioPct}% tổng chi)`,
        iconName: 'Wallet',
        accentColor: COLOR_TEAL,
        surfaceColor: [240, 253, 250],
        borderColor: [153, 246, 228],
        iconBgColor: [204, 251, 241],
        valueColor: COLOR_TEAL_DARK,
      },
      {
        label: 'Phải chịu',
        value: `${formatVND(appendix.owedExpense, false)} đ`,
        subtext: `Tham gia ${appendix.participatedRows.filter((r) => r.recordType === 'expense').length} khoản chi`,
        iconName: 'Users',
        accentColor: [37, 99, 235],
        surfaceColor: [239, 246, 255],
        borderColor: [191, 219, 254],
        iconBgColor: [219, 234, 254],
        valueColor: COLOR_INK,
      },
      hasMemberTransfers
        ? {
            label: 'Đã chuyển / nhận',
            value: `${formatVND(appendix.netTransfer, false)} đ`,
            subtext: `Chuyển ${formatVND(appendix.sentTransfer, false)} / Nhận ${formatVND(appendix.receivedTransfer, false)}`,
            iconName: 'ArrowRightLeft',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: COLOR_INK,
          }
        : {
            label: 'Giao dịch tất toán',
            value:
              appendix.finalSettlementActions.length > 0
                ? `${appendix.finalSettlementActions.length} giao dịch`
                : 'Không cần chuyển',
            subtext:
              appendix.finalSettlementActions.length > 0
                ? isNegative
                  ? 'Chuyển khoản tất toán'
                  : 'Nhận tiền tất toán'
                : 'Đã cân bằng',
            iconName: 'Send',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: COLOR_INK,
          },
      {
        label: 'Số dư cuối',
        value: `${balPrefix}${formatVND(appendix.balance, false)} đ`,
        subtext: balanceStatusText,
        iconName: 'CheckCircle',
        accentColor: balanceAccent,
        surfaceColor: balanceSurface,
        borderColor: balanceBorder,
        iconBgColor: balanceIconBg,
        valueColor: balanceAccent,
      },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // Bố cục 2 cột song song:
  // - Cột trái: Khung KẾT QUẢ QUYẾT TOÁN CÁ NHÂN
  // - Cột phải: Biểu đồ Chi phí theo Hạng mục
  const gap = 4;
  const leftColW = fullWidth * 0.48;
  const rightColW = fullWidth - leftColW - gap;

  const actions = appendix.finalSettlementActions;
  const catCount = Math.min(6, appendix.byCategory.length);
  const rightChartH = catCount > 0 ? 8 + catCount * 7.5 + 2.2 : 24;
  const leftMinH = Math.max(26, 12 + Math.max(1, actions.length) * 8 + 8);
  const blockH = Math.max(rightChartH, leftMinH);

  cursorY = ensurePageSpace(doc, cursorY, blockH + 4);

  // Vẽ Cột trái: Khung Kết quả Quyết toán cá nhân nổi bật
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(isNegative ? 254 : 153, isNegative ? 205 : 246, isNegative ? 211 : 228);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, cursorY, leftColW, blockH, 1.8, 1.8, 'FD');

  doc.setFillColor(isNegative ? 255 : 240, isNegative ? 241 : 253, isNegative ? 242 : 250);
  doc.roundedRect(marginX + 0.2, cursorY + 0.2, leftColW - 0.4, 7.8, 1.6, 1.6, 'F');

  const leftBarColor = isNegative ? COLOR_ROSE : isPositive ? COLOR_TEAL_DARK : COLOR_SLATE;
  doc.setFillColor(...leftBarColor);
  doc.roundedRect(marginX, cursorY, 2.2, blockH, 1, 1, 'F');

  drawIconBadge(
    doc,
    'Send',
    marginX + 4.2,
    cursorY + 1.7,
    4.5,
    leftBarColor,
    isNegative ? [255, 228, 230] : [204, 251, 241]
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text('KẾT QUẢ QUYẾT TOÁN CÁ NHÂN', marginX + 9.8, cursorY + 5.1);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(marginX + 4, cursorY + 8, marginX + leftColW - 3.5, cursorY + 8);

  if (actions.length === 0) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(
      `${appendix.memberName} đã cân bằng thu chi, không cần chuyển khoản.`,
      marginX + 5,
      cursorY + 14.5
    );
  } else if (actions.length === 1) {
    // Khi chỉ có 1 giao dịch quyết toán: Vẽ thẻ Callout nổi bật để làm tâm điểm trực quan
    const act = actions[0];
    const isSender = act.fromMemberId === appendix.memberId;
    const subCardX = marginX + 4.5;
    const subCardY = cursorY + 10.5;
    const subCardW = leftColW - 8;
    const subCardH = act.toBankInfo && isSender ? 18.5 : 13.5;

    doc.setFillColor(isSender ? 255 : 240, isSender ? 241 : 253, isSender ? 242 : 250);
    doc.setDrawColor(isSender ? 254 : 153, isSender ? 205 : 246, isSender ? 211 : 228);
    doc.setLineWidth(0.25);
    doc.roundedRect(subCardX, subCardY, subCardW, subCardH, 1.5, 1.5, 'FD');

    if (isSender) {
      drawTransferPairWithArrow(
        doc,
        activeFont,
        'bold',
        9.2,
        appendix.memberName,
        act.toMemberName,
        subCardX + 3.2,
        subCardY + 6.2,
        COLOR_ROSE_DARK,
        COLOR_ROSE,
        COLOR_INK
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(...COLOR_ROSE_DARK);
      doc.text(
        `${formatVND(act.amount, false)} đ`,
        subCardX + subCardW - 3.2,
        subCardY + 6.2,
        { align: 'right' }
      );

      if (act.toBankInfo) {
        doc.setFont(activeFont, 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(...COLOR_SLATE);
        doc.text(`TK nhận: ${act.toBankInfo}`, subCardX + 3.2, subCardY + 13.2);
      }
    } else {
      drawTransferPairWithArrow(
        doc,
        activeFont,
        'bold',
        9.2,
        act.fromMemberName,
        appendix.memberName,
        subCardX + 3.2,
        subCardY + 7.5,
        COLOR_INK,
        COLOR_TEAL,
        COLOR_TEAL_DARK
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(...COLOR_TEAL_DARK);
      doc.text(
        `+${formatVND(act.amount, false)} đ`,
        subCardX + subCardW - 3.2,
        subCardY + 7.5,
        { align: 'right' }
      );
    }
  } else {
    let actY = cursorY + 12.8;
    actions.forEach((act) => {
      const isSender = act.fromMemberId === appendix.memberId;

      if (isSender) {
        drawTransferPairWithArrow(
          doc,
          activeFont,
          'bold',
          8.4,
          appendix.memberName,
          act.toMemberName,
          marginX + 5,
          actY,
          COLOR_ROSE_DARK,
          COLOR_ROSE,
          COLOR_INK
        );

        doc.setFont(activeFont, 'bold');
        doc.setFontSize(8.6);
        doc.setTextColor(...COLOR_ROSE_DARK);
        doc.text(
          `${formatVND(act.amount, false)} đ`,
          marginX + leftColW - 4,
          actY,
          { align: 'right' }
        );

        if (act.toBankInfo) {
          actY += 4.2;
          doc.setFont(activeFont, 'normal');
          doc.setFontSize(7.2);
          doc.setTextColor(...COLOR_SLATE);
          doc.text(`TK nhận: ${act.toBankInfo}`, marginX + 5, actY);
        }
      } else {
        drawTransferPairWithArrow(
          doc,
          activeFont,
          'bold',
          8.2,
          act.fromMemberName,
          appendix.memberName,
          marginX + 5,
          actY,
          COLOR_INK,
          COLOR_TEAL,
          COLOR_TEAL_DARK
        );

        doc.setFont(activeFont, 'bold');
        doc.setFontSize(8.4);
        doc.setTextColor(...COLOR_TEAL_DARK);
        doc.text(
          `+${formatVND(act.amount, false)} đ`,
          marginX + leftColW - 4,
          actY,
          { align: 'right' }
        );
      }
      actY += 5.8;
    });
  }

  // Dòng công thức tính nhanh dưới đáy hộp Quyết toán cá nhân (dùng dấu '-' chuẩn ASCII)
  const formulaY = cursorY + blockH - 3.2;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.18);
  doc.line(marginX + 4.5, formulaY - 3.8, marginX + leftColW - 3.5, formulaY - 3.8);
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(
    `Tính toán: Đã chi (${formatVND(appendix.paidExpense, false)}) - Phải chịu (${formatVND(appendix.owedExpense, false)}) = ${balPrefix}${formatVND(appendix.balance, false)} đ`,
    marginX + 4.8,
    formulaY
  );

  // Vẽ Cột phải: Biểu đồ Chi phí theo Hạng mục kèm Icon
  if (appendix.byCategory.length > 0) {
    drawCompactChartCard(
      doc,
      activeFont,
      `Chi phí theo Hạng mục (${appendix.memberName})`,
      'PieChart',
      [13, 148, 136],
      [204, 251, 241],
      appendix.byCategory.slice(0, 6).map((c) => {
        const theme = CATEGORY_THEME_MAP[c.categoryIcon] || CATEGORY_THEME_MAP.Package;
        return {
          label: shortenCategoryLabelForTable(c.categoryName),
          iconName: c.categoryIcon || 'Package',
          iconStroke: theme.stroke,
          iconBg: theme.bg,
          barColor: theme.bar,
          amount: c.amount,
          count: c.count,
          percentage: c.percentage,
        };
      }),
      marginX + leftColW + gap,
      cursorY,
      rightColW,
      blockH
    );
  }

  cursorY += blockH + 4.5;

  // Bảng các khoản thành viên đã chi
  cursorY = ensurePageSpace(doc, cursorY, 20);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    `CÁC KHOẢN ${appendix.memberName.toUpperCase()} ĐÃ CHI (${appendix.paidRows.length} KHOẢN)`,
    marginX,
    cursorY + 3
  );
  cursorY += 4.2;

  if (typeof autoTableFn === 'function') {
    const paidBody = appendix.paidRows.map((r, i) => [
      `${i + 1}`,
      r.date,
      r.title,
      r.participantsSummary,
      r.compactTypeLabel,
      r.amountFormatted,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: [
        [
          { content: '#', styles: { halign: 'center' } },
          'Thời gian',
          'Nội dung khoản chi',
          'Chia cho',
          'Hạng mục',
          { content: 'Số tiền (đ)', styles: { halign: 'right' } },
        ],
      ],
      body:
        paidBody.length > 0
          ? paidBody
          : [['—', '—', `${appendix.memberName} chưa chi khoản nào`, '—', '—', '0']],
      foot:
        paidBody.length > 0
          ? [
              [
                {
                  content: `TỔNG ĐÃ CHI (${appendix.paidRows.length} khoản)`,
                  colSpan: 5,
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_INK },
                },
                {
                  content: formatVND(appendix.paidExpense, false),
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
                },
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 14 },
      styles: {
        font: activeFont,
        fontSize: 7.8,
        cellPadding: 1.65,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.12,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [240, 253, 250],
        textColor: COLOR_TEAL_DARK,
        lineColor: [153, 246, 228],
        lineWidth: 0.2,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 27 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 32, textColor: COLOR_SLATE },
        4: { cellWidth: 24, textColor: COLOR_SLATE },
        5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            const [p1, p2] = raw.split('→').map((s) => s.trim());
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.9;
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'normal',
              7.6,
              p1 || '',
              p2 || '',
              textX,
              midY,
              COLOR_SLATE,
              COLOR_TEAL,
              COLOR_SLATE
            );
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 10) + 5;
  }

  return cursorY;
}

function stampPageFooters(doc: any, activeFont: string, report: ExpenseReportData): void {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const fullW = pageWidth - marginX * 2;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    if (p === 1) {
      // Thanh Footer xanh lá bo góc trên-phải đậm chất "Business Trip Expense Report" trên Trang 1
      const barY = pageHeight - 13.5;
      const barH = 9.2;
      doc.setFillColor(...COLOR_BANNER_GREEN);
      doc.roundedRect(marginX, barY, fullW, barH, 2.8, 2.8, 'F');
      // Vuông góc dưới-trái, trên-trái, dưới-phải để giữ điểm nhấn bo tròn góc trên-phải như mẫu
      doc.rect(marginX, barY, fullW - 4, barH, 'F');
      doc.rect(marginX, barY + 3, fullW, barH - 3, 'F');

      drawIconBadge(
        doc,
        'Wallet',
        marginX + 3.2,
        barY + 1.8,
        5.6,
        [255, 255, 255],
        COLOR_BANNER_GREEN,
        2.1
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(255, 255, 255);
      doc.text('TDYTRIP', marginX + 10.2, barY + 5.8);

      doc.setFont(activeFont, 'normal');
      doc.setFontSize(7.1);
      doc.setTextColor(220, 252, 231);
      doc.text(
        `${report.tripName}  •  ${report.location || 'Việt Nam'}  •  Xuất: ${report.generatedAt}`,
        marginX + 29,
        barY + 5.7
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(255, 255, 255);
      doc.text(`Trang ${p} / ${totalPages}`, pageWidth - marginX - 3.5, barY + 5.8, {
        align: 'right',
      });
    } else {
      // Các trang chi tiết & phụ lục giữ thanh footer thanh mảnh để tối đa không gian bảng
      doc.setDrawColor(...COLOR_BORDER);
      doc.setLineWidth(0.2);
      doc.line(marginX, pageHeight - 10.5, pageWidth - marginX, pageHeight - 10.5);

      doc.setFont(activeFont, 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(...COLOR_MUTED);
      doc.text(
        `TdyTrip  •  ${report.tripName}  •  Báo cáo chi tiêu & quyết toán`,
        marginX,
        pageHeight - 6.8
      );
      doc.setFont(activeFont, 'bold');
      doc.setTextColor(...COLOR_TABLE_SLATE_GREEN);
      doc.text(`Trang ${p} / ${totalPages}`, pageWidth - marginX, pageHeight - 6.8, {
        align: 'right',
      });
    }
  }
}

export async function exportExpenseReportPdf(report: ExpenseReportData): Promise<void> {
  await loadExternalScript(JSPDF_CDN_URL);
  await loadExternalScript(AUTOTABLE_CDN_URL);

  const win = window as unknown as {
    jspdf?: { jsPDF: new (options?: Record<string, unknown>) => any };
    jsPDF?: new (options?: Record<string, unknown>) => any;
  };

  const JsPDFConstructor = win.jspdf?.jsPDF || win.jsPDF;
  if (!JsPDFConstructor) {
    throw new Error('Không khởi tạo được thư viện jsPDF từ CDN.');
  }

  const doc = new JsPDFConstructor({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const fonts = await ensureRobotoFontsLoaded();
  let activeFont = 'helvetica';

  if (fonts) {
    doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Medium.ttf', fonts.medium);
    doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
    activeFont = 'Roboto';
  }

  const autoTableFn = (doc as any).autoTable || (win as any).jspdf?.autoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // Trường hợp lọc theo 1 thành viên cụ thể: Xuất báo cáo cá nhân
  if (report.filterMemberId !== 'all' && report.memberAppendices.length > 0) {
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      report.memberAppendices[0],
      'BÁO CÁO QUYẾT TOÁN CÁ NHÂN',
      marginX,
      9.0,
      pageWidth
    );
    stampPageFooters(doc, activeFont, report);
    doc.save(report.suggestedFileName);
    return;
  }

  // ==========================================================================
  // TRANG 1: TỔNG QUAN CHUYẾN ĐI & KẾT QUẢ QUYẾT TOÁN (PHONG CÁCH BUSINESS TRIP REPORT)
  // ==========================================================================
  let cursorY = drawExecutiveMasthead(
    doc,
    activeFont,
    report,
    'BÁO CÁO CHI TIÊU & QUYẾT TOÁN',
    marginX,
    8.5,
    pageWidth
  );

  // PHẦN 01: TỔNG QUAN CHI TIÊU
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '01',
    'TỔNG QUAN CHI TIÊU',
    `${report.overview.memberCount} thành viên  •  ${report.overview.expenseCount} khoản chi`,
    marginX,
    cursorY,
    pageWidth
  );

  const topCat = report.overview.byCategory[0];
  const topPayer = [...report.settlement.balances].sort(
    (a, b) => b.paidExpense - a.paidExpense
  )[0];
  const topPayerPct =
    topPayer && report.overview.totalExpenseAmount > 0
      ? Math.round((topPayer.paidExpense / report.overview.totalExpenseAmount) * 1000) / 10
      : 0;

  cursorY = drawFourKpiRow(
    doc,
    activeFont,
    [
      {
        label: 'Tổng chi tiêu',
        value: `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
        subtext: `${report.overview.expenseCount} khoản chi • ${report.overview.byDay.length} ngày`,
        iconName: 'Wallet',
        accentColor: COLOR_BANNER_GREEN,
        surfaceColor: [242, 251, 244],
        borderColor: [163, 217, 165],
        iconBgColor: [220, 245, 222],
        valueColor: COLOR_BANNER_GREEN_DARK,
      },
      {
        label: 'Bình quân / người',
        value: `${formatVND(report.overview.averagePerMember, false)} đ`,
        subtext: `Chia cho ${report.overview.memberCount} thành viên`,
        iconName: 'Users',
        accentColor: [37, 99, 235],
        surfaceColor: [239, 246, 255],
        borderColor: [191, 219, 254],
        iconBgColor: [219, 234, 254],
        valueColor: [30, 64, 175],
      },
      {
        label: 'Hạng mục lớn nhất',
        value: topCat ? `${formatVND(topCat.amount, false)} đ` : '0 đ',
        subtext: topCat
          ? `${shortenCategoryLabelForTable(topCat.categoryName)} (${topCat.percentage}%)`
          : 'Chưa phát sinh',
        iconName: topCat?.categoryIcon || 'PieChart',
        accentColor: [217, 119, 6],
        surfaceColor: [255, 251, 235],
        borderColor: [253, 230, 138],
        iconBgColor: [254, 243, 199],
        valueColor: [180, 83, 9],
      },
      report.overview.totalTransferAmount > 0
        ? {
            label: 'Đã chuyển trả',
            value: `${formatVND(report.overview.totalTransferAmount, false)} đ`,
            subtext: `${report.overview.transferCount} giao dịch đã chuyển`,
            iconName: 'ArrowRightLeft',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: [109, 40, 217],
          }
        : {
            label: 'Chi nhiều nhất',
            value: topPayer ? `${formatVND(topPayer.paidExpense, false)} đ` : '0 đ',
            subtext: topPayer
              ? `${topPayer.memberName} (${topPayerPct}% tổng chi)`
              : 'Chưa phát sinh',
            iconName: 'Award',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: [109, 40, 217],
          },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // 2 Biểu đồ đặt song song 2 cột (Chi tiêu theo Hạng mục & Chi tiêu theo Ngày) kèm dải tổng kết xanh cốm
  cursorY = drawSideBySideOverviewCharts(
    doc,
    activeFont,
    report.overview.byCategory,
    report.overview.byDay,
    marginX,
    cursorY,
    pageWidth
  );

  // PHẦN 02: QUYẾT TOÁN CHIA TIỀN
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '02',
    'CÂN ĐỐI THU CHI & QUYẾT TOÁN',
    `${report.settlement.simplifiedDebts.length} giao dịch tất toán`,
    marginX,
    cursorY,
    pageWidth
  );

  // Biểu đồ tương quan Đã chi vs. Phải chịu kèm Avatar tròn
  cursorY = drawMemberBalanceComparisonChart(
    doc,
    activeFont,
    report.settlement.balances,
    marginX,
    cursorY,
    pageWidth
  );

  const hasAnyTransfers = report.overview.totalTransferAmount > 0;

  // Bảng 2.1: Bảng cân đối tổng hợp từng thành viên (Header Slate-Green + Footer Xanh cốm như mẫu)
  if (typeof autoTableFn === 'function') {
    const balanceHead = hasAnyTransfers
      ? [
          [
            'Thành viên',
            { content: 'Đã chi (đ)', styles: { halign: 'right' } },
            { content: 'Phải chịu (đ)', styles: { halign: 'right' } },
            { content: 'Đã chuyển (đ)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (đ)', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ]
      : [
          [
            'Thành viên',
            { content: 'Đã chi (đ)', styles: { halign: 'right' } },
            { content: 'Phải chịu (đ)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (đ)', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ];

    const balanceRows = report.settlement.balances.map((b) => {
      const prefix = b.balance > 0 ? '+' : '';
      const status =
        b.balance > 0 ? 'Nhận về' : b.balance < 0 ? 'Cần chuyển' : 'Đã cân bằng';
      if (hasAnyTransfers) {
        return [
          b.memberName,
          formatVND(b.paidExpense, false),
          formatVND(b.owedExpense, false),
          formatVND(b.netTransfer, false),
          `${prefix}${formatVND(b.balance, false)}`,
          status,
        ];
      }
      return [
        b.memberName,
        formatVND(b.paidExpense, false),
        formatVND(b.owedExpense, false),
        `${prefix}${formatVND(b.balance, false)}`,
        status,
      ];
    });

    const totalPaidAll = report.settlement.balances.reduce((s, b) => s + b.paidExpense, 0);
    const totalOwedAll = report.settlement.balances.reduce((s, b) => s + b.owedExpense, 0);
    const balanceFoot = hasAnyTransfers
      ? [
          [
            'Tổng cộng đoàn:',
            { content: formatVND(totalPaidAll, false), styles: { halign: 'right' } },
            { content: formatVND(totalOwedAll, false), styles: { halign: 'right' } },
            { content: '0', styles: { halign: 'right' } },
            { content: '0', styles: { halign: 'right' } },
            { content: 'Đã khớp 100%', styles: { halign: 'right' } },
          ],
        ]
      : [
          [
            'Tổng cộng đoàn:',
            { content: formatVND(totalPaidAll, false), styles: { halign: 'right' } },
            { content: formatVND(totalOwedAll, false), styles: { halign: 'right' } },
            { content: '0', styles: { halign: 'right' } },
            { content: 'Đã khớp 100%', styles: { halign: 'right' } },
          ],
        ];

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: balanceHead,
      body: balanceRows,
      foot: balanceFoot,
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: activeFont,
        fontSize: 7.8,
        cellPadding: 1.5,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.14,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: COLOR_TABLE_SLATE_GREEN,
        textColor: [255, 255, 255],
        lineColor: [255, 255, 255],
        lineWidth: 0.18,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: COLOR_TOTAL_SAGE,
        textColor: [20, 45, 28],
        lineColor: [163, 208, 140],
        lineWidth: 0.18,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: hasAnyTransfers
        ? {
            0: { cellWidth: 34, fontStyle: 'bold' },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 'auto', halign: 'right' },
          }
        : {
            0: { cellWidth: 38, fontStyle: 'bold' },
            1: { cellWidth: 36, halign: 'right' },
            2: { cellWidth: 36, halign: 'right' },
            3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: 'auto', halign: 'right' },
          },
      didParseCell: (data: any) => {
        const balColIdx = hasAnyTransfers ? 4 : 3;
        const statusColIdx = hasAnyTransfers ? 5 : 4;
        if (data.section === 'body' && (data.column.index === balColIdx || data.column.index === statusColIdx)) {
          const rawText = String(data.cell.raw || '');
          if (rawText.startsWith('+') || rawText === 'Nhận về') {
            data.cell.styles.textColor = COLOR_BANNER_GREEN_DARK;
            data.cell.styles.fontStyle = 'bold';
          } else if (rawText.startsWith('-') || rawText === 'Cần chuyển') {
            data.cell.styles.textColor = COLOR_ROSE_DARK;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 3.0;
  }

  // Bảng 2.2: DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN (Nổi bật nhất trên Trang 1, cột cuối canh phải)
  cursorY = ensurePageSpace(doc, cursorY, 20);
  drawIconBadge(doc, 'Send', marginX, cursorY - 0.5, 4.2, COLOR_BANNER_GREEN_DARK, [220, 252, 231]);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...COLOR_BANNER_GREEN_DARK);
  doc.text(
    'DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN',
    marginX + 5.4,
    cursorY + 2.6
  );
  cursorY += 3.8;

  if (typeof autoTableFn === 'function') {
    const hasDebts = report.settlement.simplifiedDebts.length > 0;
    const totalSettlementTransfer = report.settlement.simplifiedDebts.reduce(
      (s, d) => s + d.amount,
      0
    );
    const simplifiedBody = report.settlement.simplifiedDebts.map((d, idx) => [
      `${idx + 1}`,
      `${d.fromMemberName} → ${d.toMemberName}`,
      formatVND(d.amount, false),
      d.toBankInfo || 'Chưa cập nhật STK',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: [
        [
          { content: '#', styles: { halign: 'center' } },
          '', // Vẽ tiêu đề "Người chuyển → Người nhận" bằng vector arrow trong didDrawCell
          { content: 'Số tiền chuyển (đ)', styles: { halign: 'right' } },
          { content: 'Tài khoản nhận', styles: { halign: 'right' } },
        ],
      ],
      body: hasDebts
        ? simplifiedBody
        : [['—', 'Tất cả thành viên đã cân bằng thu chi', '0', '—']],
      foot: hasDebts
        ? [
            [
              {
                content: 'Tổng tiền luân chuyển tất toán:',
                colSpan: 2,
                styles: { halign: 'left', fontStyle: 'bold' },
              },
              {
                content: `${formatVND(totalSettlementTransfer, false)} đ`,
                styles: { halign: 'right', fontStyle: 'bold' },
              },
              {
                content: `${report.settlement.simplifiedDebts.length} lệnh chuyển khoản`,
                styles: { halign: 'right', fontStyle: 'bold' },
              },
            ],
          ]
        : undefined,
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: activeFont,
        fontSize: 8.0,
        cellPadding: 1.65,
        textColor: COLOR_INK,
        lineColor: [187, 224, 175],
        lineWidth: 0.15,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: COLOR_BANNER_GREEN,
        textColor: [255, 255, 255],
        lineColor: [255, 255, 255],
        lineWidth: 0.18,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: COLOR_TOTAL_SAGE,
        textColor: [20, 45, 28],
        lineColor: [163, 208, 140],
        lineWidth: 0.18,
      },
      alternateRowStyles: { fillColor: [244, 251, 245] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 56, fontStyle: 'bold' },
        2: { cellWidth: 42, halign: 'right', fontStyle: 'bold', textColor: COLOR_BANNER_GREEN_DARK },
        3: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', textColor: COLOR_SLATE },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1 && hasDebts) {
          // Xóa text mặc định để vẽ tên + mũi tên vector sắc nét trong didDrawCell
          data.cell.text = [''];
        }
      },
      didDrawCell: (data: any) => {
        if (data.column.index === 1) {
          const textX = data.cell.x + data.cell.padding('left');
          const midY = data.cell.y + data.cell.height / 2 + 1;
          if (data.section === 'head') {
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'bold',
              8.1,
              'Người chuyển',
              'Người nhận',
              textX,
              midY,
              [255, 255, 255],
              [220, 252, 231],
              [255, 255, 255]
            );
          } else if (data.section === 'body' && hasDebts) {
            const debt = report.settlement.simplifiedDebts[data.row.index];
            if (debt) {
              drawTransferPairWithArrow(
                doc,
                activeFont,
                'bold',
                8.2,
                debt.fromMemberName,
                debt.toMemberName,
                textX,
                midY,
                COLOR_ROSE_DARK,
                COLOR_BANNER_GREEN,
                COLOR_BANNER_GREEN_DARK
              );
            }
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 2.8;
  }

  // Khối Ghi chú & Xác nhận đối soát ở đáy Trang 1 (theo mẫu thiết kế)
  cursorY = drawPageOneNotesAndVerification(
    doc,
    activeFont,
    report,
    marginX,
    cursorY,
    pageWidth
  );

  // ==========================================================================
  // PHẦN 03: DANH SÁCH CHI TIẾT KHOẢN CHI (Bắt đầu trang mới gọn gàng, tối ưu 42 mục/trang)
  // ==========================================================================
  if (cursorY > 175) {
    doc.addPage();
    cursorY = 12;
  }

  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '03',
    'DANH SÁCH CHI TIẾT KHOẢN CHI',
    `${report.rows.length} giao dịch theo thời gian`,
    marginX,
    cursorY,
    pageWidth
  );

  if (typeof autoTableFn === 'function') {
    const tableHead = [
      [
        { content: '#', styles: { halign: 'center' } },
        'Thời gian',
        'Nội dung khoản chi',
        'Người chi',
        'Chia cho',
        'Hạng mục',
        { content: 'Số tiền (đ)', styles: { halign: 'right' } },
      ],
    ];
    const tableBody = report.rows.map((r, idx) => [
      `${idx + 1}`,
      r.date,
      r.title,
      r.payerName,
      r.participantsSummary,
      r.compactTypeLabel,
      r.amountFormatted,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: tableHead,
      body:
        tableBody.length > 0
          ? tableBody
          : [['—', '—', 'Chưa có khoản chi nào trong chuyến đi', '—', '—', '—', '0']],
      foot:
        tableBody.length > 0
          ? [
              [
                {
                  content:
                    report.overview.transferCount > 0
                      ? `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi • Đã chuyển: ${formatVND(report.totalTransferAmount, false)} đ)`
                      : `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi)`,
                  colSpan: 6,
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_INK },
                },
                {
                  content: formatVND(report.overview.totalExpenseAmount, false),
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
                },
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 13 },
      styles: {
        font: activeFont,
        fontSize: 7.45,
        cellPadding: 1.25,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [240, 253, 250],
        textColor: COLOR_TEAL_DARK,
        lineColor: [153, 246, 228],
        lineWidth: 0.2,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 26 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 22 },
        4: { cellWidth: 31, textColor: COLOR_SLATE },
        5: { cellWidth: 23, textColor: COLOR_SLATE },
        6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            const [p1, p2] = raw.split('→').map((s) => s.trim());
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.9;
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'normal',
              7.3,
              p1 || '',
              p2 || '',
              textX,
              midY,
              COLOR_SLATE,
              COLOR_TEAL,
              COLOR_SLATE
            );
          }
        }
      },
    });
  }

  // ==========================================================================
  // PHẦN 04: PHỤ LỤC THỐNG KÊ THEO TỪNG CÁ NHÂN (MỖI THÀNH VIÊN 1 TRANG TINH GỌN)
  // ==========================================================================
  report.memberAppendices.forEach((appendix, idx) => {
    doc.addPage();
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      appendix,
      `PHỤ LỤC CÁ NHÂN (${idx + 1}/${report.memberAppendices.length})`,
      marginX,
      10.5,
      pageWidth
    );
  });

  stampPageFooters(doc, activeFont, report);
  doc.save(report.suggestedFileName);
}
