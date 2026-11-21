import type { DebtTransaction, ExpenseRecord, Member, MemberBalance } from '../types';

/**
 * Hàm băm chuỗi thành số nguyên không âm (DJB2 biến thể)
 * Dùng để xoay vòng người nhận đồng lẻ công bằng giữa các hóa đơn.
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

const LEADING_GROUP_SIZE_REGEX = /^\s*(\d+)[\s\-_]+\S/;
const MAX_GROUP_SIZE = 999;

/**
 * Phân tích số lượng thành viên trong 1 username gộp theo quy tắc bắt đầu bằng số.
 * Ví dụ: "10 thành viên" -> 10, "5 mem" -> 5, "03 bạn" -> 3.
 * Trả về 1 nếu là thành viên đơn lẻ (hoặc số <= 1 / vượt ngưỡng 999 như năm "2026 Team").
 */
export function parseMemberGroupSize(name: string): number {
  const match = String(name || '').match(LEADING_GROUP_SIZE_REGEX);
  if (!match) return 1;
  const parsed = parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed < 2 || parsed > MAX_GROUP_SIZE) {
    return 1;
  }
  return parsed;
}

/**
 * Lấy số suất / số người đại diện của 1 Member (mặc định 1, hoặc xx nếu tên bắt đầu bằng số).
 */
export function getMemberGroupSize(member?: Pick<Member, 'name'> | null): number {
  if (!member) return 1;
  return parseMemberGroupSize(member.name);
}

/**
 * Tổng số người thực tế trong đoàn (cộng dồn headcount của tất cả thành viên đang active).
 */
export function getTotalHeadcount(
  members: Array<Pick<Member, 'name' | 'active'>>
): number {
  return members
    .filter((m) => m.active !== false)
    .reduce((sum, m) => sum + getMemberGroupSize(m), 0);
}

/**
 * Tổng số người tham gia thực tế của 1 khoản chi dựa trên bản đồ splits và danh sách thành viên.
 */
export function getExpenseParticipantHeadcount(
  splits: Record<string, number> | undefined,
  memberMap: Map<string, Pick<Member, 'name'>>
): number {
  if (!splits) return 0;
  let total = 0;
  for (const [id, val] of Object.entries(splits)) {
    if (Math.round(val || 0) > 0) {
      total += getMemberGroupSize(memberMap.get(id));
    }
  }
  return total;
}

/**
 * Chia đều tổng tiền của 1 username gộp cho xx người trong nhóm để ra số tiền mỗi người chịu/chuyển.
 */
export function splitPerGroupMember(
  totalAmount: number,
  groupSize: number
): { total: number; groupSize: number; perPerson: number; isExact: boolean } {
  const cleanTotal = Math.round(totalAmount || 0);
  const cleanSize = Math.max(1, Math.round(groupSize || 1));
  const absPerPerson = Math.round(Math.abs(cleanTotal) / cleanSize);
  const perPerson = absPerPerson === 0 ? 0 : cleanTotal < 0 ? -absPerPerson : absPerPerson;
  return {
    total: cleanTotal,
    groupSize: cleanSize,
    perPerson,
    isExact: cleanTotal % cleanSize === 0,
  };
}

/**
 * Chia đều số nguyên tuyệt đối (VND) theo Largest Remainder Method
 * kết hợp xoay vòng vị trí bắt đầu bằng hashString(expenseId) % k.
 */
export function splitEqual(
  total: number,
  memberIds: string[],
  expenseId: string
): Record<string, number> {
  const cleanTotal = Math.max(0, Math.round(total));
  const uniqueIds = Array.from(new Set(memberIds)).sort();
  const k = uniqueIds.length;
  const result: Record<string, number> = {};

  if (k === 0 || cleanTotal === 0) {
    for (const id of uniqueIds) {
      result[id] = 0;
    }
    return result;
  }

  const base = Math.floor(cleanTotal / k);
  const remainder = cleanTotal % k;
  const startIndex = hashString(expenseId || 'default') % k;

  for (let i = 0; i < k; i++) {
    result[uniqueIds[i]] = base;
  }

  for (let r = 0; r < remainder; r++) {
    const targetIdx = (startIndex + r) % k;
    result[uniqueIds[targetIdx]] += 1;
  }

  return result;
}

/**
 * Chia đều có tính đến username gộp nhóm (mỗi username gộp "xx thành viên" tự động chịu xx phần).
 * Nếu tất cả thành viên được chọn đều có trọng số = 1 thì trả về kết quả y hệt splitEqual.
 */
export function splitEqualWeighted(
  total: number,
  memberIds: string[],
  memberWeights: Record<string, number>,
  expenseId: string
): Record<string, number> {
  const uniqueIds = Array.from(new Set(memberIds)).sort();
  if (uniqueIds.length === 0) return {};

  let hasMultiMemberGroup = false;
  const weights: Record<string, number> = {};
  for (const id of uniqueIds) {
    const w = Math.max(1, Math.round(memberWeights[id] || 1));
    weights[id] = w;
    if (w > 1) {
      hasMultiMemberGroup = true;
    }
  }

  if (!hasMultiMemberGroup) {
    return splitEqual(total, uniqueIds, expenseId);
  }

  return splitByShares(total, weights, expenseId);
}

/**
 * Chia theo suất/hệ số (shares) số nguyên tuyệt đối (VND) theo Largest Remainder Method.
 * Phần dư thập phân (T * w_i) % W lớn nhất được ưu tiên nhận +1 ₫;
 * nếu bằng nhau thì phân xử bằng thứ tự xoay vòng từ hashString(expenseId).
 */
export function splitByShares(
  total: number,
  weights: Record<string, number>,
  expenseId: string
): Record<string, number> {
  const cleanTotal = Math.max(0, Math.round(total));
  const sortedIds = Object.keys(weights)
    .filter((id) => Math.round(weights[id] || 0) > 0)
    .sort();

  const k = sortedIds.length;
  const result: Record<string, number> = {};

  if (k === 0 || cleanTotal === 0) {
    return result;
  }

  let totalWeight = 0;
  const cleanWeights: Record<string, number> = {};
  for (const id of sortedIds) {
    const w = Math.max(0, Math.round(weights[id] || 0));
    cleanWeights[id] = w;
    totalWeight += w;
  }

  if (totalWeight <= 0) {
    return result;
  }

  const startIndex = hashString(expenseId || 'default') % k;
  let allocated = 0;

  const items = sortedIds.map((id, idx) => {
    const w = cleanWeights[id];
    const numerator = cleanTotal * w;
    const floorVal = Math.floor(numerator / totalWeight);
    const remNumerator = numerator % totalWeight;
    const rotatedRank = (idx - startIndex + k) % k;
    allocated += floorVal;
    return {
      id,
      floorVal,
      remNumerator,
      rotatedRank,
    };
  });

  const leftover = cleanTotal - allocated;

  items.sort((a, b) => {
    if (b.remNumerator !== a.remNumerator) {
      return b.remNumerator - a.remNumerator;
    }
    return a.rotatedRank - b.rotatedRank;
  });

  for (let i = 0; i < items.length; i++) {
    result[items[i].id] = items[i].floorVal + (i < leftover ? 1 : 0);
  }

  return result;
}

/**
 * Kiểm tra tổng tiền nhập cụ thể (exact) có khớp 100% với tổng khoản chi hay không.
 */
export function validateExactSplits(
  total: number,
  exactAmounts: Record<string, number>
): { valid: boolean; allocated: number; diff: number; cleanedSplits: Record<string, number> } {
  const cleanTotal = Math.max(0, Math.round(total));
  const cleanedSplits: Record<string, number> = {};
  let allocated = 0;

  for (const [id, rawAmt] of Object.entries(exactAmounts)) {
    const amt = Math.max(0, Math.round(rawAmt || 0));
    if (amt > 0) {
      cleanedSplits[id] = amt;
      allocated += amt;
    }
  }

  const diff = cleanTotal - allocated; // diff > 0: Còn thiếu; diff < 0: Đang thừa
  return {
    valid: cleanTotal > 0 && diff === 0,
    allocated,
    diff,
    cleanedSplits,
  };
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

interface Rational {
  num: bigint;
  den: bigint;
}

function addRational(a: Rational, b: Rational): Rational {
  if (b.num === 0n) return a;
  if (a.num === 0n) return b;
  if (a.den === b.den) {
    const num = a.num + b.num;
    const g = gcdBigInt(num, a.den);
    return { num: num / g, den: a.den / g };
  }
  const num = a.num * b.den + b.num * a.den;
  const den = a.den * b.den;
  const g = gcdBigInt(num, den);
  return { num: num / g, den: den / g };
}

function combineDenMap(denMap: Map<number, bigint> | undefined): Rational {
  let acc: Rational = { num: 0n, den: 1n };
  if (!denMap) return acc;
  for (const [den, num] of denMap.entries()) {
    if (num === 0n) continue;
    const denBig = BigInt(den);
    const g = gcdBigInt(num, denBig);
    acc = addRational(acc, { num: num / g, den: denBig / g });
  }
  return acc;
}

/**
 * Kiểm tra khoản chi có khớp tỉ lệ chia hữu tỉ chuẩn (equal hoặc shares) hay không
 * (sai lệch mỗi phần đã lưu <= 1đ so với giá trị lý thuyết).
 * Trả về danh sách trọng số để tích lũy phân số chính xác tuyệt đối, tránh cộng dồn sai số làm tròn 1–2đ qua nhiều hóa đơn.
 */
function resolveExactRationalWeights(
  exp: ExpenseRecord,
  effectivePaid: number,
  memberMap: Map<string, Member>
): { entries: Array<[string, number]>; totalWeight: number } | null {
  if (exp.type === 'transfer' || effectivePaid <= 0) return null;
  const splitsObj = exp.splits || {};
  const positiveEntries: Array<[string, number]> = [];
  for (const [id, rawAmt] of Object.entries(splitsObj)) {
    const amt = Math.round(rawAmt || 0);
    if (amt > 0) {
      positiveEntries.push([id, amt]);
    }
  }
  if (positiveEntries.length === 0) return null;

  if (exp.splitMode === 'equal') {
    let totalWeight = 0;
    const weighted: Array<[string, number]> = [];
    for (const [id] of positiveEntries) {
      const w = getMemberGroupSize(memberMap.get(id));
      weighted.push([id, w]);
      totalWeight += w;
    }
    if (totalWeight <= 0) return null;
    for (let i = 0; i < positiveEntries.length; i++) {
      const savedAmt = positiveEntries[i][1];
      const exactAmt = (effectivePaid * weighted[i][1]) / totalWeight;
      if (Math.abs(savedAmt - exactAmt) > 1.000001) {
        return null;
      }
    }
    return { entries: weighted, totalWeight };
  }

  if (exp.splitMode === 'shares' && exp.splitMeta?.shares) {
    let totalWeight = 0;
    const weighted: Array<[string, number]> = [];
    for (const [id] of positiveEntries) {
      const w = Math.max(0, Math.round(exp.splitMeta.shares[id] || 0));
      if (w <= 0) return null;
      weighted.push([id, w]);
      totalWeight += w;
    }
    if (totalWeight <= 0) return null;
    for (let i = 0; i < positiveEntries.length; i++) {
      const savedAmt = positiveEntries[i][1];
      const exactAmt = (effectivePaid * weighted[i][1]) / totalWeight;
      if (Math.abs(savedAmt - exactAmt) > 1.000001) {
        return null;
      }
    }
    return { entries: weighted, totalWeight };
  }

  return null;
}

/**
 * Tính toán Số dư ròng (balance) cho từng thành viên.
 * Tích lũy chính xác theo phân số hữu tỉ cho các khoản chia đều / chia suất (equal, shares)
 * và chỉ áp dụng Largest Remainder đúng 1 lần ở cấp quyết toán để loại bỏ hoàn toàn sai lệch ±1–2đ
 * khi tổng chi phí chia hết cho số thành viên.
 * Công thức:
 * balance(u) = Đã chi (Expense) - Phải chịu (Expense splits) + Đã chuyển đi (Transfer) - Đã nhận về (Transfer)
 */
export function calculateBalances(
  members: Member[],
  expenses: ExpenseRecord[]
): MemberBalance[] {
  const map = new Map<string, MemberBalance>();
  const memberMap = new Map<string, Member>();
  const owedByDenMap = new Map<string, Map<number, bigint>>();

  for (const m of members) {
    memberMap.set(m.id, m);
    map.set(m.id, {
      memberId: m.id,
      paidExpense: 0,
      owedExpense: 0,
      sentTransfer: 0,
      receivedTransfer: 0,
      netTransfer: 0,
      balance: 0,
    });
  }

  const ensureMember = (id: string): MemberBalance => {
    let entry = map.get(id);
    if (!entry) {
      entry = {
        memberId: id,
        paidExpense: 0,
        owedExpense: 0,
        sentTransfer: 0,
        receivedTransfer: 0,
        netTransfer: 0,
        balance: 0,
      };
      map.set(id, entry);
    }
    return entry;
  };

  const addOwedTerm = (memberId: string, den: number, numeratorDelta: bigint) => {
    ensureMember(memberId);
    let dm = owedByDenMap.get(memberId);
    if (!dm) {
      dm = new Map<number, bigint>();
      owedByDenMap.set(memberId, dm);
    }
    dm.set(den, (dm.get(den) || 0n) + numeratorDelta);
  };

  let totalExpenseAmount = 0;

  for (const exp of expenses) {
    if (exp.deleted) continue;

    const splitsObj = exp.splits || {};
    const splitSum = Object.values(splitsObj).reduce((acc, v) => acc + Math.round(v || 0), 0);
    const effectivePaid = splitSum > 0 ? splitSum : Math.round(exp.amount || 0);

    if (exp.type === 'transfer') {
      const payerEntry = ensureMember(exp.payer);
      payerEntry.sentTransfer += effectivePaid;

      for (const [recipientId, rawAmt] of Object.entries(splitsObj)) {
        const amt = Math.round(rawAmt || 0);
        if (amt > 0) {
          const recEntry = ensureMember(recipientId);
          recEntry.receivedTransfer += amt;
        }
      }
    } else {
      const payerEntry = ensureMember(exp.payer);
      payerEntry.paidExpense += effectivePaid;

      const rational = resolveExactRationalWeights(exp, effectivePaid, memberMap);
      if (rational) {
        totalExpenseAmount += effectivePaid;
        const paidBig = BigInt(effectivePaid);
        for (const [participantId, weight] of rational.entries) {
          addOwedTerm(participantId, rational.totalWeight, paidBig * BigInt(weight));
        }
      } else {
        for (const [participantId, rawAmt] of Object.entries(splitsObj)) {
          const amt = Math.round(rawAmt || 0);
          if (amt > 0) {
            totalExpenseAmount += amt;
            addOwedTerm(participantId, 1, BigInt(amt));
          }
        }
      }
    }
  }

  // Áp dụng Largest Remainder chính xác bằng phân số BigInt đúng 1 lần trên toàn bộ chuyến đi
  const owedEntries: Array<{
    memberId: string;
    floorVal: number;
    remNum: bigint;
    remDen: bigint;
  }> = [];

  let allocatedFloors = 0;
  for (const memberId of map.keys()) {
    const rational = combineDenMap(owedByDenMap.get(memberId));
    const floorVal = Number(rational.num / rational.den);
    const remNum = rational.num % rational.den;
    allocatedFloors += floorVal;
    owedEntries.push({
      memberId,
      floorVal,
      remNum,
      remDen: rational.den,
    });
  }

  const leftover = totalExpenseAmount - allocatedFloors;
  const finalOwed = new Map<string, number>();
  for (const item of owedEntries) {
    finalOwed.set(item.memberId, item.floorVal);
  }

  if (leftover > 0) {
    const ranked = [...owedEntries]
      .filter((item) => item.remNum > 0n)
      .sort((a, b) => {
        const diff = b.remNum * a.remDen - a.remNum * b.remDen;
        if (diff !== 0n) return diff > 0n ? 1 : -1;
        return a.memberId.localeCompare(b.memberId);
      });
    for (let i = 0; i < leftover && i < ranked.length; i++) {
      const id = ranked[i].memberId;
      finalOwed.set(id, (finalOwed.get(id) || 0) + 1);
    }
  }

  const results: MemberBalance[] = [];
  for (const entry of map.values()) {
    entry.owedExpense = finalOwed.get(entry.memberId) || 0;
    entry.netTransfer = entry.sentTransfer - entry.receivedTransfer;
    entry.balance =
      entry.paidExpense - entry.owedExpense + entry.sentTransfer - entry.receivedTransfer;
    results.push(entry);
  }

  return results;
}

/**
 * Thuật toán tối giản công nợ (Minimum Cash Flow - Greedy)
 * Ghép người âm nhiều nhất với người dương nhiều nhất, tối đa N - 1 giao dịch.
 */
export function simplifyDebts(balances: MemberBalance[]): DebtTransaction[] {
  const debtors: { id: string; amount: number }[] = [];
  const creditors: { id: string; amount: number }[] = [];

  for (const b of balances) {
    const rounded = Math.round(b.balance);
    if (rounded < 0) {
      debtors.push({ id: b.memberId, amount: -rounded });
    } else if (rounded > 0) {
      creditors.push({ id: b.memberId, amount: rounded });
    }
  }

  const transactions: DebtTransaction[] = [];

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
    creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

    const debtor = debtors[0];
    const creditor = creditors[0];
    const settleAmount = Math.min(debtor.amount, creditor.amount);

    if (settleAmount > 0) {
      transactions.push({
        fromMemberId: debtor.id,
        toMemberId: creditor.id,
        amount: settleAmount,
      });
    }

    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount <= 0) debtors.shift();
    if (creditor.amount <= 0) creditors.shift();
  }

  return transactions;
}

/**
 * Tính công nợ trực tiếp đôi một giữa từng cặp thành viên (Pairwise Debts).
 * Nếu A nợ B 200k và B nợ A 50k -> bù trừ trực tiếp thành A cần chuyển B 150k.
 * Tích lũy theo phân số hữu tỉ chính xác giữa cùng một cặp để triệt tiêu sai lệch cộng dồn ±1đ.
 */
export function calculatePairwiseDebts(
  members: Member[],
  expenses: ExpenseRecord[]
): DebtTransaction[] {
  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const memberIds = Array.from(
    new Set([
      ...members.map((m) => m.id),
      ...expenses.flatMap((e) => [e.payer, ...Object.keys(e.splits || {})]),
    ])
  ).sort();

  // owedMap[from][to] = Map<den, numeratorSum>
  const owedMap = new Map<string, Map<number, bigint>>();
  const addPairTerm = (from: string, to: string, den: number, numDelta: bigint) => {
    if (from === to || numDelta === 0n) return;
    const key = `${from}\u0000${to}`;
    let dm = owedMap.get(key);
    if (!dm) {
      dm = new Map<number, bigint>();
      owedMap.set(key, dm);
    }
    dm.set(den, (dm.get(den) || 0n) + numDelta);
  };

  for (const exp of expenses) {
    if (exp.deleted) continue;
    const payer = exp.payer;
    const splitsObj = exp.splits || {};

    if (exp.type === 'expense') {
      const splitSum = Object.values(splitsObj).reduce((acc, v) => acc + Math.round(v || 0), 0);
      const effectivePaid = splitSum > 0 ? splitSum : Math.round(exp.amount || 0);
      const rational = resolveExactRationalWeights(exp, effectivePaid, memberMap);

      if (rational) {
        const paidBig = BigInt(effectivePaid);
        for (const [participantId, weight] of rational.entries) {
          if (participantId !== payer) {
            addPairTerm(participantId, payer, rational.totalWeight, paidBig * BigInt(weight));
          }
        }
      } else {
        for (const [participantId, rawAmt] of Object.entries(splitsObj)) {
          const amt = Math.round(rawAmt || 0);
          if (amt > 0 && participantId !== payer) {
            addPairTerm(participantId, payer, 1, BigInt(amt));
          }
        }
      }
    } else if (exp.type === 'transfer') {
      // Payer chuyển tiền cho recipient -> giảm nợ của payer với recipient (tương đương recipient nợ lại payer)
      for (const [recipientId, rawAmt] of Object.entries(splitsObj)) {
        const amt = Math.round(rawAmt || 0);
        if (amt > 0 && recipientId !== payer) {
          addPairTerm(recipientId, payer, 1, BigInt(amt));
        }
      }
    }
  }

  const roundPositiveRational = (r: Rational): number => {
    if (r.num <= 0n) return 0;
    const q = r.num / r.den;
    const rem = r.num % r.den;
    return Number(rem * 2n >= r.den ? q + 1n : q);
  };

  const pairwiseTransactions: DebtTransaction[] = [];
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i];
      const b = memberIds[j];
      const aOwesB = combineDenMap(owedMap.get(`${a}\u0000${b}`));
      const bOwesA = combineDenMap(owedMap.get(`${b}\u0000${a}`));
      const net = addRational(aOwesB, { num: -bOwesA.num, den: bOwesA.den });
      if (net.num > 0n) {
        const amt = roundPositiveRational(net);
        if (amt > 0) {
          pairwiseTransactions.push({
            fromMemberId: a,
            toMemberId: b,
            amount: amt,
          });
        }
      } else if (net.num < 0n) {
        const amt = roundPositiveRational({ num: -net.num, den: net.den });
        if (amt > 0) {
          pairwiseTransactions.push({
            fromMemberId: b,
            toMemberId: a,
            amount: amt,
          });
        }
      }
    }
  }

  pairwiseTransactions.sort((x, y) => y.amount - x.amount);
  return pairwiseTransactions;
}
