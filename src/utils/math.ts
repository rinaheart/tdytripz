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

/**
 * Tính toán Số dư ròng (balance) cho từng thành viên.
 * Luôn đọc trực tiếp từ trường `splits` đã lưu, chỉ tính các bản ghi `deleted === false`.
 * Công thức:
 * balance(u) = Đã chi (Expense) - Phải chịu (Expense splits) + Đã chuyển đi (Transfer) - Đã nhận về (Transfer)
 */
export function calculateBalances(
  members: Member[],
  expenses: ExpenseRecord[]
): MemberBalance[] {
  const map = new Map<string, MemberBalance>();

  for (const m of members) {
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

      for (const [participantId, rawAmt] of Object.entries(splitsObj)) {
        const amt = Math.round(rawAmt || 0);
        if (amt > 0) {
          const partEntry = ensureMember(participantId);
          partEntry.owedExpense += amt;
        }
      }
    }
  }

  const results: MemberBalance[] = [];
  for (const entry of map.values()) {
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
 */
export function calculatePairwiseDebts(
  members: Member[],
  expenses: ExpenseRecord[]
): DebtTransaction[] {
  const memberIds = Array.from(
    new Set([
      ...members.map((m) => m.id),
      ...expenses.flatMap((e) => [e.payer, ...Object.keys(e.splits || {})]),
    ])
  ).sort();

  // owed[from][to] = tổng số tiền `from` nợ `to`
  const owed: Record<string, Record<string, number>> = {};
  for (const a of memberIds) {
    owed[a] = {};
    for (const b of memberIds) {
      owed[a][b] = 0;
    }
  }

  for (const exp of expenses) {
    if (exp.deleted) continue;
    const payer = exp.payer;
    const splitsObj = exp.splits || {};

    if (exp.type === 'expense') {
      // Người tham gia nợ người trả tiền (payer)
      for (const [participantId, rawAmt] of Object.entries(splitsObj)) {
        const amt = Math.round(rawAmt || 0);
        if (amt > 0 && participantId !== payer) {
          owed[participantId][payer] = (owed[participantId][payer] || 0) + amt;
        }
      }
    } else if (exp.type === 'transfer') {
      // Payer chuyển tiền cho recipient -> giảm nợ của payer với recipient (tương đương recipient nợ lại payer)
      for (const [recipientId, rawAmt] of Object.entries(splitsObj)) {
        const amt = Math.round(rawAmt || 0);
        if (amt > 0 && recipientId !== payer) {
          owed[recipientId][payer] = (owed[recipientId][payer] || 0) + amt;
        }
      }
    }
  }

  const pairwiseTransactions: DebtTransaction[] = [];
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i];
      const b = memberIds[j];
      const aOwesB = owed[a]?.[b] || 0;
      const bOwesA = owed[b]?.[a] || 0;
      const net = aOwesB - bOwesA;
      if (net > 0) {
        pairwiseTransactions.push({
          fromMemberId: a,
          toMemberId: b,
          amount: net,
        });
      } else if (net < 0) {
        pairwiseTransactions.push({
          fromMemberId: b,
          toMemberId: a,
          amount: -net,
        });
      }
    }
  }

  pairwiseTransactions.sort((x, y) => y.amount - x.amount);
  return pairwiseTransactions;
}
