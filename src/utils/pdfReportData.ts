import type {
  Category,
  DebtTransaction,
  ExpenseRecord,
  Member,
  MemberBalance,
  SplitMode,
  TripConfig,
} from '../types';
import { formatDateRangeVN, formatShortDateVN, formatVND, getNowGMT7 } from './format';
import { calculateBalances, simplifyDebts } from './math';

export type DayBucketKind = 'pre' | 'trip' | 'post' | 'unknown';

export interface DayBucket {
  key: string;
  label: string;
  kind: DayBucketKind;
}

export interface ReportParticipantsInfo {
  kind: 'all' | 'except' | 'names' | 'count' | 'transfer';
  text: string;
}

export interface ExpenseReportRow {
  id: string;
  time: string;
  dateKey: string;
  title: string;
  payerId: string;
  payerName: string;
  payerAvatarColor: string;
  recipientId?: string;
  recipientName?: string;
  recipientAvatarColor?: string;
  amount: number;
  amountFormatted: string;
  recordType: 'expense' | 'transfer';
  categoryIcon: string;
  categoryShortName: string;
  splitMode: SplitMode;
  isCustomSplit: boolean;
  participants: ReportParticipantsInfo;
}

export interface LedgerGroup {
  bucketKey: string;
  label: string;
  kind: DayBucketKind;
  subtotal: number;
  rows: ExpenseReportRow[];
}

export interface ReportCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  fullCategoryName: string;
  categoryIcon: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface ReportDayBreakdown {
  dateKey: string;
  label: string;
  kind: DayBucketKind;
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
  fromAvatarColor: string;
  toMemberName: string;
  toAvatarColor: string;
  toBankInfo: string;
}

export interface SettlementSenderItem {
  fromMemberId: string;
  fromName: string;
  fromAvatarColor: string;
  amount: number;
}

export interface SettlementRecipientGroup {
  toMemberId: string;
  toName: string;
  toAvatarColor: string;
  bankInfo: string;
  total: number;
  receivedTransferAmount: number;
  senders: SettlementSenderItem[];
}

export interface MemberCardPayTarget {
  toMemberId: string;
  toName: string;
  toAvatarColor: string;
  amount: number;
}

export interface MemberCardData {
  memberId: string;
  memberName: string;
  avatarColor: string;
  bankInfo: string;
  paidExpense: number;
  owedExpense: number;
  netTransfer: number;
  balance: number;
  direction: 'pay' | 'receive' | 'settled';
  payTo: MemberCardPayTarget[];
  receiveFromCount: number;
  byCategory: ReportCategoryBreakdown[];
}

export interface TopPayerSummary {
  memberId: string;
  memberName: string;
  avatarColor: string;
  paidExpense: number;
  percentage: number;
}

export interface ExpenseReportOverview {
  totalExpenseAmount: number;
  totalTransferAmount: number;
  expenseCount: number;
  transferCount: number;
  memberCount: number;
  tripDays: number;
  averagePerMember: number;
  topPayer: TopPayerSummary | null;
  byCategory: ReportCategoryBreakdown[];
  byDay: ReportDayBreakdown[];
}

export interface ExpenseReportSettlement {
  balances: EnrichedMemberBalance[];
  simplifiedDebts: EnrichedDebtTransaction[];
  settlementGroups: SettlementRecipientGroup[];
}

export interface ExpenseReportData {
  tripId: string;
  tripName: string;
  location: string;
  accentColor: string;
  dateRangeLabel: string;
  tripDays: number;
  generatedAt: string;
  overview: ExpenseReportOverview;
  settlement: ExpenseReportSettlement;
  settlementGroups: SettlementRecipientGroup[];
  ledger: LedgerGroup[];
  memberCards: MemberCardData[];
  suggestedFileName: string;
}

const WEEKDAYS_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/**
 * Phân bổ tỷ lệ phần trăm số nguyên theo thuật toán Largest Remainder (tổng luôn bằng 100 khi có dữ liệu > 0)
 */
export function allocatePercentages(values: number[]): number[] {
  if (values.length === 0) return [];
  const clean = values.map((v) => Math.max(0, Number(v) || 0));
  const total = clean.reduce((acc, v) => acc + v, 0);
  if (total <= 0) {
    return clean.map(() => 0);
  }

  const exacts = clean.map((v) => (v * 100) / total);
  const floors = exacts.map((e) => Math.floor(e));
  let remainderCount = 100 - floors.reduce((acc, f) => acc + f, 0);

  const order = exacts
    .map((e, idx) => ({
      idx,
      rem: e - floors[idx],
      val: clean[idx],
    }))
    .sort((a, b) => {
      if (Math.abs(b.rem - a.rem) > 1e-9) return b.rem - a.rem;
      if (b.val !== a.val) return b.val - a.val;
      return a.idx - b.idx;
    });

  for (let i = 0; i < order.length && remainderCount > 0; i++) {
    floors[order[i].idx] += 1;
    remainderCount -= 1;
  }

  return floors;
}

/**
 * Phân nhóm ngày cho biểu đồ "Theo ngày" và "Sổ chi tiết":
 * - Trước chuyến (`dateKey < startDate`): gộp chung 1 nhóm `PRE_TRIP` ("Trước chuyến")
 * - Trong chuyến (`startDate <= dateKey <= endDate`): `Thứ Sáu 22/10 · Ngày 1`
 * - Sau chuyến (`dateKey > endDate`): gộp nhóm `POST_TRIP` ("Sau chuyến")
 */
export function getDayBucket(
  dateKey: string,
  startDate?: string,
  endDate?: string
): DayBucket {
  const cleanDate = (dateKey || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return { key: 'UNKNOWN', label: 'Chưa rõ ngày', kind: 'unknown' };
  }

  const cleanStart = (startDate || '').trim().slice(0, 10);
  const cleanEnd = (endDate || '').trim().slice(0, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStart) && cleanDate < cleanStart) {
    return { key: 'PRE_TRIP', label: 'Trước chuyến', kind: 'pre' };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanEnd) && cleanDate > cleanEnd) {
    return { key: 'POST_TRIP', label: 'Sau chuyến', kind: 'post' };
  }

  const [y, m, d] = cleanDate.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS_VN[dateObj.getUTCDay()];
  const ddmm = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStart)) {
    const [sy, sm, sd] = cleanStart.split('-').map(Number);
    const startObj = new Date(Date.UTC(sy, sm - 1, sd));
    const diffDays = Math.floor((dateObj.getTime() - startObj.getTime()) / 86400000) + 1;
    if (diffDays >= 1) {
      return {
        key: cleanDate,
        label: `${weekday} ${ddmm} · Ngày ${diffDays}`,
        kind: 'trip',
      };
    }
  }

  return {
    key: cleanDate,
    label: `${weekday} ${ddmm}`,
    kind: 'trip',
  };
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
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Tạo tên file báo cáo chuẩn ASCII: `report_${sanitizeFileNameSegment(location||tripName)}_${yyyymmdd}_${HHmm}.pdf`
 * Ví dụ: `report_ha-noi_20261104_0923.pdf`
 */
export function buildReportFileName(
  location: string,
  fallbackTripName?: string,
  nowGMT7Str?: string
): string {
  const rawLoc = (location || '').trim() || (fallbackTripName || '').trim() || 'report';
  const locSegment = sanitizeFileNameSegment(rawLoc) || 'report';
  const tsSource = (nowGMT7Str || '').trim();
  const m = tsSource.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  const timestampSegment = m ? `${m[1]}${m[2]}${m[3]}_${m[4]}${m[5]}` : '00000000_0000';
  return `report_${locSegment}_${timestampSegment}.pdf`;
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

export function resolveCategoryIconName(cat?: Category, rawName?: string): string {
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

/**
 * Xây dựng thông tin cột "Chia" trên sổ chi tiết:
 * - `all`: `Cả nhóm` (tất cả thành viên tham gia)
 * - `except`: `Trừ <tên>` (vắng đúng 1 người trong nhóm >= 3 thành viên)
 * - `names`: danh sách tên (<= 3 người)
 * - `count`: `N người` (> 3 người và vắng >= 2 người)
 * - `transfer`: `<Người chuyển> → <Người nhận>`
 */
export function buildParticipantsInfo(
  record: ExpenseRecord,
  activeMembers: Member[],
  memberMap: Map<string, Member>
): ReportParticipantsInfo {
  const entries = Object.entries(record.splits || {}).filter(
    ([, val]) => Math.round(val || 0) > 0
  );

  if (record.type === 'transfer') {
    const payerName = memberMap.get(record.payer)?.name || record.payer;
    const toNames = entries.map(([id]) => memberMap.get(id)?.name || id);
    return {
      kind: 'transfer',
      text: toNames.length > 0 ? `${payerName} → ${toNames.join(', ')}` : payerName,
    };
  }

  if (entries.length === 0) {
    return { kind: 'count', text: '0 người' };
  }

  const participantIds = entries.map(([id]) => id);
  const participantSet = new Set(participantIds);
  const missingMembers = activeMembers.filter((m) => !participantSet.has(m.id));

  if (activeMembers.length > 0 && missingMembers.length === 0) {
    return { kind: 'all', text: 'Cả nhóm' };
  }

  if (activeMembers.length >= 3 && missingMembers.length === 1 && participantIds.length >= 2) {
    return { kind: 'except', text: `Trừ ${missingMembers[0].name}` };
  }

  const names = participantIds.map((id) => memberMap.get(id)?.name || id);
  if (names.length <= 3) {
    return { kind: 'names', text: names.join(', ') };
  }

  return { kind: 'count', text: `${names.length} người` };
}

function computeTripDays(
  startDate?: string,
  endDate?: string,
  fallbackDayCount = 1
): number {
  const s = (startDate || '').trim().slice(0, 10);
  const e = (endDate || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e)) {
    const startMs = Date.parse(`${s}T00:00:00Z`);
    const endMs = Date.parse(`${e}T00:00:00Z`);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      return Math.round((endMs - startMs) / 86400000) + 1;
    }
  }
  return Math.max(1, fallbackDayCount);
}

export function buildExpenseReportData(params: {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
}): ExpenseReportData {
  const { config, members, categories, expenses } = params;

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

  let fullExpenseTotal = 0;
  let fullTransferTotal = 0;
  let fullExpenseCount = 0;
  let fullTransferCount = 0;

  const catAgg = new Map<
    string,
    { name: string; fullName: string; icon: string; amount: number; count: number }
  >();
  const dayAgg = new Map<
    string,
    { label: string; kind: DayBucketKind; sortKey: string; amount: number; count: number }
  >();
  const ledgerGroupMap = new Map<string, LedgerGroup & { sortKey: string }>();

  const bucketSortKey = (bucket: DayBucket): string => {
    if (bucket.kind === 'pre') return '0000-00-00';
    if (bucket.kind === 'post') return '9999-12-30';
    if (bucket.kind === 'unknown') return '9999-12-31';
    return bucket.key;
  };

  for (const rec of allActiveRecords) {
    const effAmount = getEffectiveRecordAmount(rec);
    const rawSpent = (rec.spentAt || '').trim();
    const dateKey = rawSpent.slice(0, 10) || 'unknown';
    const timePart = rawSpent.length >= 16 ? rawSpent.slice(11, 16) : '';
    const ddmm = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? formatShortDateVN(dateKey).slice(0, 5) : '';
    const bucket = getDayBucket(dateKey, config.startDate, config.endDate);

    const rowTime =
      bucket.kind === 'trip'
        ? timePart || ddmm
        : ddmm && timePart
          ? `${ddmm} ${timePart}`
          : ddmm || timePart;

    const payerMember = memberMap.get(rec.payer);
    const payerName = payerMember?.name || rec.payer;
    const payerAvatarColor = payerMember?.avatarColor || '#0f766e';

    const catObj = categoryMap.get(rec.categoryId);
    const rawFullName = (catObj?.name || 'Khác').trim();
    const categoryShortName =
      rec.type === 'transfer' ? 'Chuyển trả' : shortenCategoryLabelForTable(rawFullName);
    const categoryIcon =
      rec.type === 'transfer'
        ? 'ArrowRightLeft'
        : resolveCategoryIconName(catObj, categoryShortName);

    let recipientId: string | undefined;
    let recipientName: string | undefined;
    let recipientAvatarColor: string | undefined;
    if (rec.type === 'transfer') {
      const firstSplitEntry = Object.entries(rec.splits || {}).find(
        ([, val]) => Math.round(val || 0) > 0
      );
      recipientId = firstSplitEntry?.[0];
      const recMember = recipientId ? memberMap.get(recipientId) : undefined;
      recipientName = recMember?.name || recipientId || '';
      recipientAvatarColor = recMember?.avatarColor || '#0f766e';
    }

    const splitMode: SplitMode = rec.splitMode || 'equal';
    const isCustomSplit =
      rec.type === 'expense' && (splitMode === 'exact' || splitMode === 'shares');
    const participants = buildParticipantsInfo(rec, activeMembers, memberMap);

    const row: ExpenseReportRow = {
      id: rec.id,
      time: rowTime,
      dateKey,
      title: rec.title || (rec.type === 'transfer' ? 'Chuyển khoản quyết toán' : 'Khoản chi'),
      payerId: rec.payer,
      payerName,
      payerAvatarColor,
      recipientId,
      recipientName,
      recipientAvatarColor,
      amount: effAmount,
      amountFormatted: formatVND(effAmount, false),
      recordType: rec.type,
      categoryIcon,
      categoryShortName,
      splitMode,
      isCustomSplit,
      participants,
    };

    const existingLedgerGrp = ledgerGroupMap.get(bucket.key) || {
      bucketKey: bucket.key,
      label: bucket.label,
      kind: bucket.kind,
      subtotal: 0,
      rows: [],
      sortKey: bucketSortKey(bucket),
    };
    if (rec.type === 'expense') {
      existingLedgerGrp.subtotal += effAmount;
    }
    existingLedgerGrp.rows.push(row);
    ledgerGroupMap.set(bucket.key, existingLedgerGrp);

    if (rec.type === 'transfer') {
      fullTransferTotal += effAmount;
      fullTransferCount += 1;
    } else {
      fullExpenseTotal += effAmount;
      fullExpenseCount += 1;

      const catId = rec.categoryId || 'cat_other';
      const curCat = catAgg.get(catId) || {
        name: categoryShortName,
        fullName: rawFullName,
        icon: categoryIcon,
        amount: 0,
        count: 0,
      };
      curCat.amount += effAmount;
      curCat.count += 1;
      catAgg.set(catId, curCat);

      const curDay = dayAgg.get(bucket.key) || {
        label: bucket.label,
        kind: bucket.kind,
        sortKey: bucketSortKey(bucket),
        amount: 0,
        count: 0,
      };
      curDay.amount += effAmount;
      curDay.count += 1;
      dayAgg.set(bucket.key, curDay);
    }
  }

  const sortedCats = Array.from(catAgg.entries()).sort((a, b) => b[1].amount - a[1].amount);
  const catPercentages = allocatePercentages(sortedCats.map(([, item]) => item.amount));
  const byCategory: ReportCategoryBreakdown[] = sortedCats.map(([categoryId, item], idx) => ({
    categoryId,
    categoryName: item.name,
    fullCategoryName: item.fullName,
    categoryIcon: item.icon,
    amount: item.amount,
    count: item.count,
    percentage: catPercentages[idx] ?? 0,
  }));

  const sortedDays = Array.from(dayAgg.entries()).sort((a, b) =>
    a[1].sortKey.localeCompare(b[1].sortKey)
  );
  const dayPercentages = allocatePercentages(sortedDays.map(([, item]) => item.amount));
  const byDay: ReportDayBreakdown[] = sortedDays.map(([dateKey, item], idx) => ({
    dateKey,
    label: item.label,
    kind: item.kind,
    amount: item.amount,
    count: item.count,
    percentage: dayPercentages[idx] ?? 0,
  }));

  const tripDaysCount = computeTripDays(
    config.startDate,
    config.endDate,
    byDay.filter((d) => d.kind === 'trip').length || byDay.length
  );

  const ledger: LedgerGroup[] = Array.from(ledgerGroupMap.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _unused, ...grp }) => grp);

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

  const simplifiedDebts: EnrichedDebtTransaction[] = simplifyDebts(rawBalances).map((d) => {
    const fromM = memberMap.get(d.fromMemberId);
    const toM = memberMap.get(d.toMemberId);
    return {
      ...d,
      fromMemberName: fromM?.name || d.fromMemberId,
      fromAvatarColor: fromM?.avatarColor || '#be123c',
      toMemberName: toM?.name || d.toMemberId,
      toAvatarColor: toM?.avatarColor || '#0f766e',
      toBankInfo: formatMemberBankInfo(toM),
    };
  });

  // Gom simplifiedDebts theo người nhận (settlementGroups)
  const recipientGroupMap = new Map<string, SettlementRecipientGroup>();
  for (const debt of simplifiedDebts) {
    const recBalance = enrichedBalances.find((b) => b.memberId === debt.toMemberId);
    const existing = recipientGroupMap.get(debt.toMemberId) || {
      toMemberId: debt.toMemberId,
      toName: debt.toMemberName,
      toAvatarColor: debt.toAvatarColor,
      bankInfo: debt.toBankInfo,
      total: 0,
      receivedTransferAmount: recBalance?.receivedTransfer || 0,
      senders: [],
    };
    existing.total += debt.amount;
    existing.senders.push({
      fromMemberId: debt.fromMemberId,
      fromName: debt.fromMemberName,
      fromAvatarColor: debt.fromAvatarColor,
      amount: debt.amount,
    });
    recipientGroupMap.set(debt.toMemberId, existing);
  }

  const settlementGroups: SettlementRecipientGroup[] = Array.from(recipientGroupMap.values())
    .map((grp) => ({
      ...grp,
      senders: [...grp.senders].sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.total - a.total);

  // Ứng trước nhiều nhất (topPayer)
  const sortedPayers = [...enrichedBalances].sort((a, b) => b.paidExpense - a.paidExpense);
  const payerPercentages = allocatePercentages(sortedPayers.map((p) => p.paidExpense));
  const topPayer: TopPayerSummary | null =
    sortedPayers.length > 0 && sortedPayers[0].paidExpense > 0
      ? {
          memberId: sortedPayers[0].memberId,
          memberName: sortedPayers[0].memberName,
          avatarColor: sortedPayers[0].avatarColor,
          paidExpense: sortedPayers[0].paidExpense,
          percentage: payerPercentages[0] ?? 0,
        }
      : null;

  // 3. Sinh MemberCards từ settlement.balances (đảm bảo luôn khớp 100% với quyết toán)
  const memberCards: MemberCardData[] = enrichedBalances.map((bal) => {
    const payTo: MemberCardPayTarget[] = simplifiedDebts
      .filter((d) => d.fromMemberId === bal.memberId)
      .sort((a, b) => b.amount - a.amount)
      .map((d) => ({
        toMemberId: d.toMemberId,
        toName: d.toMemberName,
        toAvatarColor: d.toAvatarColor,
        amount: d.amount,
      }));

    const receiveFromCount = simplifiedDebts.filter(
      (d) => d.toMemberId === bal.memberId
    ).length;

    const personalCatMap = new Map<
      string,
      { name: string; fullName: string; icon: string; amount: number; count: number }
    >();

    for (const e of allActiveRecords) {
      if (e.type !== 'expense') continue;
      const myShare = Math.round(e.splits?.[bal.memberId] || 0);
      if (myShare <= 0) continue;
      const catId = e.categoryId || 'cat_other';
      const catObj = categoryMap.get(catId);
      const rawFullName = (catObj?.name || 'Khác').trim();
      const catName = shortenCategoryLabelForTable(rawFullName);
      const catIcon = resolveCategoryIconName(catObj, catName);
      const cur = personalCatMap.get(catId) || {
        name: catName,
        fullName: rawFullName,
        icon: catIcon,
        amount: 0,
        count: 0,
      };
      cur.amount += myShare;
      cur.count += 1;
      personalCatMap.set(catId, cur);
    }

    const sortedPersonalCats = Array.from(personalCatMap.entries()).sort(
      (a, b) => b[1].amount - a[1].amount
    );
    const personalCatPcts = allocatePercentages(
      sortedPersonalCats.map(([, item]) => item.amount)
    );
    const personalByCategory: ReportCategoryBreakdown[] = sortedPersonalCats.map(
      ([categoryId, item], idx) => ({
        categoryId,
        categoryName: item.name,
        fullCategoryName: item.fullName,
        categoryIcon: item.icon,
        amount: item.amount,
        count: item.count,
        percentage: personalCatPcts[idx] ?? 0,
      })
    );

    const direction: 'pay' | 'receive' | 'settled' =
      bal.balance < 0 ? 'pay' : bal.balance > 0 ? 'receive' : 'settled';

    return {
      memberId: bal.memberId,
      memberName: bal.memberName,
      avatarColor: bal.avatarColor,
      bankInfo: bal.bankInfo,
      paidExpense: bal.paidExpense,
      owedExpense: bal.owedExpense,
      netTransfer: bal.netTransfer,
      balance: bal.balance,
      direction,
      payTo,
      receiveFromCount,
      byCategory: personalByCategory,
    };
  });

  const nowGMT7 = getNowGMT7(false);
  const dateRangeLabel =
    config.startDate && config.endDate
      ? formatDateRangeVN(config.startDate, config.endDate)
      : config.startDate
        ? formatShortDateVN(config.startDate)
        : '';

  return {
    tripId: config.tripId,
    tripName: config.tripName || 'Chuyến đi',
    location: config.location || '',
    accentColor: config.accentColor || '#000777',
    dateRangeLabel,
    tripDays: tripDaysCount,
    generatedAt: formatSpentAtReportVN(nowGMT7),
    overview: {
      totalExpenseAmount: fullExpenseTotal,
      totalTransferAmount: fullTransferTotal,
      expenseCount: fullExpenseCount,
      transferCount: fullTransferCount,
      memberCount,
      tripDays: tripDaysCount,
      averagePerMember,
      topPayer,
      byCategory,
      byDay,
    },
    settlement: {
      balances: enrichedBalances,
      simplifiedDebts,
      settlementGroups,
    },
    settlementGroups,
    ledger,
    memberCards,
    suggestedFileName: buildReportFileName(config.location, config.tripName, nowGMT7),
  };
}
