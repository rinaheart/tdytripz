import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import type {
  DebtTransaction,
  ExpenseRecord,
  Member,
  MemberBalance,
} from '../types';
import { copyToClipboard, formatVND } from '../utils/format';
import { calculatePairwiseDebts, simplifyDebts } from '../utils/math';
import { MemberAvatar } from './MemberAvatar';

interface SettlementTabProps {
  members: Member[];
  expenses: ExpenseRecord[];
  balances: MemberBalance[];
  currentUserId: string | null;
  onShowToast: (msg: string) => void;
}

export const SettlementTab: React.FC<SettlementTabProps> = ({
  members,
  expenses,
  balances,
  currentUserId,
  onShowToast,
}) => {
  const [viewMode, setViewMode] = useState<'simplified' | 'pairwise'>('simplified');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const getMember = (id: string) => members.find((m) => m.id === id);

  const sumOfBalances = useMemo(
    () => balances.reduce((acc, b) => acc + Math.round(b.balance), 0),
    [balances]
  );

  const simplifiedTransactions = useMemo(() => simplifyDebts(balances), [balances]);
  const pairwiseTransactions = useMemo(
    () => calculatePairwiseDebts(members, expenses),
    [members, expenses]
  );

  const activeTransactions: DebtTransaction[] = useMemo(() => {
    const raw = viewMode === 'simplified' ? simplifiedTransactions : pairwiseTransactions;
    return [...raw].sort((a, b) => {
      const nameA = members.find((m) => m.id === a.fromMemberId)?.name || '';
      const nameB = members.find((m) => m.id === b.fromMemberId)?.name || '';
      const cmp = nameA.localeCompare(nameB, 'vi');
      if (cmp !== 0) return cmp;
      const recA = members.find((m) => m.id === a.toMemberId)?.name || '';
      const recB = members.find((m) => m.id === b.toMemberId)?.name || '';
      return recA.localeCompare(recB, 'vi');
    });
  }, [viewMode, simplifiedTransactions, pairwiseTransactions, members]);

  const sortedBalances = useMemo(
    () =>
      [...balances].sort((a, b) => {
        const nameA = members.find((m) => m.id === a.memberId)?.name || '';
        const nameB = members.find((m) => m.id === b.memberId)?.name || '';
        return nameA.localeCompare(nameB, 'vi');
      }),
    [balances, members]
  );

  /**
   * Copy chỉ duy nhất Số tài khoản (ví dụ: "0011004567890"), tuyệt đối không kèm tên ngân hàng hay ký tự phụ
   */
  const handleCopyAccountNo = async (txKey: string, recipient: Member) => {
    const rawAccountNo = String(recipient.accountNo || '')
      .replace(/\s+/g, '')
      .replace(/^'+/, '');

    if (!rawAccountNo) {
      onShowToast(`${recipient.name} chưa có STK (cập nhật ở Cài đặt)`);
      return;
    }

    const ok = await copyToClipboard(rawAccountNo);
    if (ok) {
      setCopiedKey(`stk_${txKey}`);
      onShowToast(`Đã copy STK: ${rawAccountNo}`);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  /**
   * Copy chỉ duy nhất Số tiền viết liền nguyên bản (ví dụ: "2500000"), không dấu chấm/phẩy hay ký hiệu tiền tệ
   */
  const handleCopyRawAmount = async (txKey: string, amount: number) => {
    const rawIntegerString = String(Math.round(amount));
    const ok = await copyToClipboard(rawIntegerString);
    if (ok) {
      setCopiedKey(`amt_${txKey}`);
      onShowToast(`Đã copy số tiền: ${rawIntegerString}`);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  return (
    <div className="space-y-4">
      {/* Phần 1 (Thông tin chính): Số tiền cần chuyển giữa các thành viên */}
      <section className="p-4 sm:p-5 rounded-md bg-white border border-slate-200 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 text-balance">
            Cần chuyển ({activeTransactions.length} khoản)
          </h2>

          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-md shrink-0">
            <button
              type="button"
              aria-pressed={viewMode === 'simplified'}
              onClick={() => setViewMode('simplified')}
              className={`min-h-[34px] px-3 py-1 rounded-sm text-xs font-bold transition-colors whitespace-nowrap ${
                viewMode === 'simplified'
                  ? 'bg-white text-brand shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tối giản
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'pairwise'}
              onClick={() => setViewMode('pairwise')}
              className={`min-h-[34px] px-3 py-1 rounded-sm text-xs font-bold transition-colors whitespace-nowrap ${
                viewMode === 'pairwise'
                  ? 'bg-white text-brand shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Từng cặp
            </button>
          </div>
        </div>

        {activeTransactions.length === 0 ? (
          <div className="p-6 rounded-md bg-emerald-50/60 border border-emerald-200 text-center space-y-1">
            <CheckCircle2 aria-hidden="true" className="w-7 h-7 text-emerald-600 mx-auto" />
            <div className="text-sm font-bold text-emerald-950">Không có khoản nợ nào</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeTransactions.map((tx) => {
              const sender = getMember(tx.fromMemberId);
              const recipient = getMember(tx.toMemberId);
              if (!sender || !recipient) return null;

              const txKey = `${tx.fromMemberId}_${tx.toMemberId}`;
              const isInvolvingMe =
                tx.fromMemberId === currentUserId || tx.toMemberId === currentUserId;
              const cleanAccountNo = String(recipient.accountNo || '')
                .replace(/\s+/g, '')
                .replace(/^'+/, '');

              return (
                <div
                  key={txKey}
                  className={`p-3.5 rounded-md border transition-colors space-y-2.5 ${
                    isInvolvingMe
                      ? 'border-brand-border bg-brand-soft/35'
                      : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm min-w-0">
                        <span className="font-bold text-rose-700 truncate">{sender.name}</span>
                        <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-bold text-emerald-800 truncate">{recipient.name}</span>
                      </div>
                      {(recipient.bankName || cleanAccountNo) && (
                        <div className="text-[11px] font-mono text-slate-600 truncate mt-0.5">
                          {recipient.bankName ? `${recipient.bankName} · ` : ''}
                          {cleanAccountNo || 'Chưa có STK'}
                        </div>
                      )}
                    </div>

                    <span className="text-base font-mono font-extrabold text-brand tabular-nums shrink-0">
                      {formatVND(tx.amount)}
                    </span>
                  </div>

                  {/* Chỉ duy nhất 2 nút Copy tinh gọn: STK (raw) & Số tiền (raw integer) */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyAccountNo(txKey, recipient)}
                      className="min-h-[38px] px-3 py-1.5 rounded-sm border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      {copiedKey === `stk_${txKey}` ? (
                        <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Copy aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      )}
                      <span>STK</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyRawAmount(txKey, tx.amount)}
                      className="min-h-[38px] px-3 py-1.5 rounded-sm bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      {copiedKey === `amt_${txKey}` ? (
                        <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      ) : (
                        <Copy aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>Số tiền</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Phần 2: Bảng cân đối chi tiêu */}
      <section className="p-4 sm:p-5 rounded-md bg-white border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 text-balance">
            <Scale aria-hidden="true" className="w-4 h-4 text-brand" />
            <span>Bảng cân đối (Đơn vị: ₫)</span>
          </h2>

          <div
            className={`inline-flex items-center gap-1 text-xs font-semibold ${
              sumOfBalances === 0 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            <ShieldCheck aria-hidden="true" className="w-4 h-4 shrink-0" />
            <span>
              {sumOfBalances === 0 ? 'Cân bằng: 0\u00A0₫' : `Lệch: ${formatVND(sumOfBalances)}`}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th scope="col" className="py-2 pr-1.5">Tên</th>
                <th scope="col" className="py-2 px-1.5 text-right">Đã chi</th>
                <th scope="col" className="py-2 px-1.5 text-right">Phải chịu</th>
                <th scope="col" className="py-2 pl-1.5 pr-1 text-right">Dư / Thiếu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {sortedBalances.map((row) => {
                const member = getMember(row.memberId);
                if (!member) return null;
                const isMe = member.id === currentUserId;
                return (
                  <tr
                    key={row.memberId}
                    className={`transition-colors ${
                      isMe ? 'bg-brand-soft/60 font-medium' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-2.5 pl-1 pr-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <MemberAvatar member={member} size="sm" />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-900">{member.name}</span>
                            {isMe && (
                              <span className="text-[11px] text-brand font-semibold">(Bạn)</span>
                            )}
                          </div>
                          {row.netTransfer !== 0 && (
                            <div className="text-[10px] font-mono text-amber-800 tabular-nums">
                              {row.netTransfer > 0 ? 'Chuyển: +' : 'Nhận: '}
                              {formatVND(row.netTransfer, false)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-1.5 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                      {formatVND(row.paidExpense, false)}
                    </td>
                    <td className="py-2.5 px-1.5 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                      {formatVND(row.owedExpense, false)}
                    </td>
                    <td
                      className={`py-2.5 pl-1.5 pr-1 text-right font-mono font-extrabold tabular-nums whitespace-nowrap ${
                        row.balance > 0
                          ? 'text-emerald-800'
                          : row.balance < 0
                          ? 'text-rose-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {row.balance > 0 ? '+' : ''}
                      {formatVND(row.balance, false)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
