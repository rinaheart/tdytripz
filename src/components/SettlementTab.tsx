import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Play,
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
    <div className="space-y-5">
      {/* Phần 1 (Thông tin chính): Danh sách các khoản cần chuyển theo phong cách TdyTime Cards */}
      <div className="space-y-2.5">
        <div className="px-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand">
            <Play aria-hidden="true" className="w-3 h-3 fill-current" />
            <span>CẦN CHUYỂN KHOẢN ({activeTransactions.length} KHOẢN)</span>
          </div>

          <div className="grid grid-cols-2 p-1 bg-slate-200/70 rounded-xl shrink-0">
            <button
              type="button"
              aria-pressed={viewMode === 'simplified'}
              onClick={() => setViewMode('simplified')}
              className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                viewMode === 'simplified'
                  ? 'bg-white text-brand shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tối giản
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'pairwise'}
              onClick={() => setViewMode('pairwise')}
              className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                viewMode === 'pairwise'
                  ? 'bg-white text-brand shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Từng cặp
            </button>
          </div>
        </div>

        {activeTransactions.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border-2 border-brand shadow-md shadow-brand/5 text-center space-y-1.5">
            <CheckCircle2 aria-hidden="true" className="w-8 h-8 text-emerald-600 mx-auto" />
            <div className="text-sm font-bold text-slate-800">Không có khoản nợ nào</div>
            <div className="text-xs text-slate-500">Mọi thành viên đã quyết toán cân bằng.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTransactions.map((tx) => {
              const sender = getMember(tx.fromMemberId);
              const recipient = getMember(tx.toMemberId);
              if (!sender || !recipient) return null;

              const txKey = `${tx.fromMemberId}_${tx.toMemberId}`;
              const isInvolvingMe =
                tx.fromMemberId === currentUserId || tx.toMemberId === currentUserId;
              const isMyDebt = tx.fromMemberId === currentUserId;
              const cleanAccountNo = String(recipient.accountNo || '')
                .replace(/\s+/g, '')
                .replace(/^'+/, '');

              return (
                <div
                  key={txKey}
                  className={`p-4 rounded-2xl bg-white transition-all space-y-3 ${
                    isInvolvingMe
                      ? 'border-2 border-brand shadow-md shadow-brand/5'
                      : 'border border-slate-200/90 shadow-2xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 text-sm min-w-0">
                        <span className="font-bold text-rose-600 truncate">{sender.name}</span>
                        <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-bold text-emerald-700 truncate">{recipient.name}</span>
                      </div>
                      <div className="text-xs font-mono text-slate-500 truncate">
                        {recipient.bankName ? (
                          <strong className="text-slate-700">{recipient.bankName}</strong>
                        ) : (
                          'Ngân hàng'
                        )}
                        <span className="mx-1.5 text-slate-300">•</span>
                        <span>{cleanAccountNo || 'Chưa có STK'}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base sm:text-lg font-mono font-extrabold text-brand tabular-nums">
                        {formatVND(tx.amount)}
                      </div>
                      {isInvolvingMe && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isMyDebt
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isMyDebt ? 'Bạn chuyển' : 'Bạn nhận'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chỉ duy nhất 2 nút Copy tinh gọn: STK (raw) & Số tiền (raw integer) */}
                  <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyAccountNo(txKey, recipient)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
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
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-xs"
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
      </div>

      {/* Phần 2: Bảng cân đối chi tiêu */}
      <div className="space-y-2">
        <div className="px-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            <Play aria-hidden="true" className="w-3 h-3 fill-current text-slate-400" />
            <span>BẢNG CÂN ĐỐI (ĐƠN VỊ: ₫)</span>
          </div>

          <div
            className={`inline-flex items-center gap-1 text-xs font-semibold ${
              sumOfBalances === 0 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
            <span>
              {sumOfBalances === 0 ? 'Cân bằng: 0\u00A0₫' : `Lệch: ${formatVND(sumOfBalances)}`}
            </span>
          </div>
        </div>

        <section className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider font-bold text-slate-400">
                <th scope="col" className="pb-2.5 pr-1.5">Thành viên</th>
                <th scope="col" className="pb-2.5 px-1.5 text-right">Đã chi</th>
                <th scope="col" className="pb-2.5 px-1.5 text-right">Phải chịu</th>
                <th scope="col" className="pb-2.5 pl-1.5 pr-1 text-right">Dư / Thiếu</th>
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
                      isMe ? 'bg-brand-soft/50 font-medium' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 pl-1 pr-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <MemberAvatar member={member} size="sm" />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-800">{member.name}</span>
                            {isMe && (
                              <span className="text-[11px] text-brand font-bold">(Bạn)</span>
                            )}
                          </div>
                          {row.netTransfer !== 0 && (
                            <div className="text-[10px] font-mono text-amber-700 tabular-nums">
                              {row.netTransfer > 0 ? 'Chuyển: +' : 'Nhận: '}
                              {formatVND(row.netTransfer, false)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-1.5 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {formatVND(row.paidExpense, false)}
                    </td>
                    <td className="py-3 px-1.5 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {formatVND(row.owedExpense, false)}
                    </td>
                    <td
                      className={`py-3 pl-1.5 pr-1 text-right font-mono font-extrabold tabular-nums whitespace-nowrap ${
                        row.balance > 0
                          ? 'text-emerald-700'
                          : row.balance < 0
                          ? 'text-rose-600'
                          : 'text-slate-500'
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
        </section>
      </div>
    </div>
  );
};
