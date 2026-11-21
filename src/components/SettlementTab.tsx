import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Play,
} from 'lucide-react';
import type {
  DebtTransaction,
  ExpenseRecord,
  Member,
  MemberBalance,
  TripConfig,
} from '../types';
import {
  copyToClipboard,
  formatSettlementReportForChat,
  formatVND,
} from '../utils/format';
import {
  calculatePairwiseDebts,
  getMemberGroupSize,
  simplifyDebts,
  splitPerGroupMember,
} from '../utils/math';
import { MemberAvatar } from './MemberAvatar';

interface SettlementTabProps {
  config?: TripConfig;
  members: Member[];
  expenses: ExpenseRecord[];
  balances: MemberBalance[];
  currentUserId: string | null;
  onShowToast: (msg: string) => void;
}

export const SettlementTab: React.FC<SettlementTabProps> = React.memo(({
  config,
  members,
  expenses,
  balances,
  currentUserId,
  onShowToast,
}) => {
  const [viewMode, setViewMode] = useState<'simplified' | 'pairwise'>('simplified');
  const [reportDetailMode, setReportDetailMode] = useState<'compact' | 'full'>('compact');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showZaloPanel, setShowZaloPanel] = useState(false);
  const [showQuickReportPreview, setShowQuickReportPreview] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const scheduleClearCopied = (ms = 1800) => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedKey(null), ms);
  };

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
      scheduleClearCopied(1800);
    }
  };

  /**
   * Copy chỉ duy nhất Số tiền viết liền nguyên bản (ví dụ: "2500000"), không dấu chấm/phẩy hay ký hiệu tiền tệ
   */
  const handleCopyRawAmount = async (txKey: string, amount: number, labelPrefix?: string) => {
    const rawIntegerString = String(Math.round(amount));
    const ok = await copyToClipboard(rawIntegerString);
    if (ok) {
      setCopiedKey(`amt_${txKey}`);
      onShowToast(
        labelPrefix
          ? `Đã copy ${labelPrefix}: ${rawIntegerString}`
          : `Đã copy số tiền: ${rawIntegerString}`
      );
      scheduleClearCopied(1800);
    }
  };

  const quickReportText = useMemo(
    () =>
      formatSettlementReportForChat({
        config,
        members,
        expenses,
        balances,
        transactions: activeTransactions,
        viewMode,
        includeBalances: reportDetailMode === 'full',
      }),
    [config, members, expenses, balances, activeTransactions, viewMode, reportDetailMode]
  );

  const handleCopyQuickReport = async () => {
    if (!quickReportText) return;
    const ok = await copyToClipboard(quickReportText);
    if (ok) {
      setCopiedKey('quick_report');
      onShowToast('Đã sao chép quyết toán — sẵn sàng dán Zalo');
      scheduleClearCopied(2000);
    } else {
      setShowZaloPanel(true);
      setShowQuickReportPreview(true);
      onShowToast('Không thể sao chép tự động — hãy copy từ khung xem trước');
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Thanh hành động nhanh "Gửi Zalo" thu gọn/mở rộng để tiện chụp ảnh màn hình */}
      <section className="px-3 py-2 rounded-2xl bg-white/95 backdrop-blur-xs border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowZaloPanel((prev) => !prev)}
            aria-expanded={showZaloPanel}
            aria-controls="settlement-zalo-panel"
            className="flex-1 min-w-0 min-h-[36px] flex items-center gap-2 text-left cursor-pointer group"
          >
            <FileText aria-hidden="true" className="w-4 h-4 text-brand shrink-0" />
            <span className="text-xs font-bold text-slate-800 truncate">Gửi Zalo</span>
            <span className="text-[11px] font-medium text-slate-400 shrink-0">
              · {reportDetailMode === 'compact' ? 'Ngắn gọn' : 'Đầy đủ'}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                showZaloPanel ? 'rotate-180 text-brand' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={handleCopyQuickReport}
            className="min-h-[34px] px-3 py-1 rounded-xl bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            {copiedKey === 'quick_report' ? (
              <>
                <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>Đã chép</span>
              </>
            ) : (
              <>
                <Copy aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                <span>Copy quyết toán</span>
              </>
            )}
          </button>
        </div>

        {showZaloPanel && (
          <div id="settlement-zalo-panel" className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-2 p-0.5 bg-slate-100 rounded-lg shrink-0">
                <button
                  type="button"
                  aria-pressed={reportDetailMode === 'compact'}
                  onClick={() => setReportDetailMode('compact')}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                    reportDetailMode === 'compact'
                      ? 'bg-white text-brand shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ngắn gọn
                </button>
                <button
                  type="button"
                  aria-pressed={reportDetailMode === 'full'}
                  onClick={() => setReportDetailMode('full')}
                  className={`min-h-[30px] px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                    reportDetailMode === 'full'
                      ? 'bg-white text-brand shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Đầy đủ
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowQuickReportPreview((prev) => !prev)}
                aria-expanded={showQuickReportPreview}
                aria-label={showQuickReportPreview ? 'Ẩn xem trước quyết toán' : 'Xem trước quyết toán'}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  showQuickReportPreview
                    ? 'border-brand/40 bg-brand-soft text-brand'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-600'
                }`}
              >
                {showQuickReportPreview ? (
                  <>
                    <EyeOff aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Ẩn xem trước</span>
                  </>
                ) : (
                  <>
                    <Eye aria-hidden="true" className="w-3.5 h-3.5" />
                    <span>Xem trước</span>
                  </>
                )}
              </button>
            </div>

            {showQuickReportPreview && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold">
                    Xem trước ({viewMode === 'simplified' ? 'Tối giản' : 'Từng cặp'} ·{' '}
                    {reportDetailMode === 'compact' ? 'Ngắn gọn' : 'Đầy đủ'})
                  </span>
                  <span>Chạm giữ hoặc bấm copy</span>
                </div>
                <pre className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] leading-relaxed font-mono text-slate-700 whitespace-pre-wrap break-words select-all max-h-64 overflow-y-auto">
                  {quickReportText}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Phần 1 (Thông tin chính): Danh sách các khoản cần chuyển theo phong cách TdyTime Cards */}
      <div className="space-y-2">
        <div className="px-0.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand">
            <Play aria-hidden="true" className="w-3 h-3 fill-current" />
            <span>CẦN CHUYỂN ({activeTransactions.length} DÒNG)</span>
          </div>

          <div className="grid grid-cols-2 p-0.5 bg-slate-200/70 rounded-xl shrink-0">
            <button
              type="button"
              aria-pressed={viewMode === 'simplified'}
              onClick={() => setViewMode('simplified')}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
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
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
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
          <div className="p-6 rounded-2xl bg-white border-2 border-brand shadow-sm shadow-brand/5 text-center space-y-1">
            <CheckCircle2 aria-hidden="true" className="w-7 h-7 text-emerald-600 mx-auto" />
            <div className="text-sm font-bold text-slate-800">Không có khoản nợ nào</div>
            <div className="text-xs text-slate-500">Mọi thành viên đã quyết toán cân bằng.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTransactions.map((tx) => {
              const sender = getMember(tx.fromMemberId);
              const recipient = getMember(tx.toMemberId);
              if (!sender || !recipient) return null;

              const senderGroupSize = getMemberGroupSize(sender);
              const recipientGroupSize = getMemberGroupSize(recipient);
              const senderSplit =
                senderGroupSize > 1 ? splitPerGroupMember(tx.amount, senderGroupSize) : null;
              const recipientSplit =
                recipientGroupSize > 1
                  ? splitPerGroupMember(tx.amount, recipientGroupSize)
                  : null;
              const copyTargetAmount = senderSplit ? senderSplit.perPerson : tx.amount;

              const txKey = `${tx.fromMemberId}_${tx.toMemberId}`;
              const isInvolvingMe =
                tx.fromMemberId === currentUserId || tx.toMemberId === currentUserId;
              const isMyDebt = tx.fromMemberId === currentUserId;
              const cleanAccountNo = String(recipient.accountNo || '')
                .replace(/\s+/g, '')
                .replace(/^'+/, '');
              const bankMetaParts = [
                recipient.bankName?.trim(),
                recipient.accountHolder?.trim(),
              ].filter(Boolean);
              const hasAccountNo = cleanAccountNo.length > 0;
              const hasBankMeta = bankMetaParts.length > 0;

              return (
                <div
                  key={txKey}
                  className={`px-3.5 py-2.5 rounded-2xl bg-white transition-all ${
                    isInvolvingMe
                      ? 'border-2 border-brand shadow-xs shadow-brand/5'
                      : 'border border-slate-200/90 shadow-2xs'
                  }`}
                >
                  {/* Hàng chính: Ai chuyển cho ai + Số tiền (nếu không có STK thì nút Copy tiền nằm gọn ngay trên hàng này) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-[13.5px] leading-snug min-w-0">
                        <span className="font-bold text-rose-600 truncate">{sender.name}</span>
                        <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-bold text-emerald-700 truncate">{recipient.name}</span>
                        {isInvolvingMe && (
                          <span
                            className={`text-[9.5px] font-bold uppercase tracking-tight shrink-0 px-1.5 py-0.5 rounded-md ${
                              isMyDebt
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {isMyDebt ? 'Bạn trả' : 'Bạn nhận'}
                          </span>
                        )}
                      </div>

                      {senderSplit && (
                        <div className="text-[11px] font-medium text-slate-500 tabular-nums">
                          Tổng {senderGroupSize} người:{' '}
                          <span className="font-mono font-semibold text-slate-700">
                            {formatVND(tx.amount)}
                          </span>
                        </div>
                      )}

                      {!senderSplit && recipientSplit && (
                        <div className="text-[11px] font-medium text-slate-500 tabular-nums">
                          Mỗi người nhận (÷{recipientGroupSize}):{' '}
                          <span className="font-mono font-semibold text-emerald-700">
                            {recipientSplit.isExact ? '' : '~'}
                            {formatVND(recipientSplit.perPerson)}
                          </span>
                        </div>
                      )}

                      {!hasAccountNo && hasBankMeta && (
                        <div className="text-[11px] text-slate-500 truncate">
                          {bankMetaParts.join(' · ')}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        {senderSplit ? (
                          <>
                            <div className="text-[15px] sm:text-base font-mono font-extrabold text-brand tabular-nums leading-tight">
                              {senderSplit.isExact ? '' : '~'}
                              {formatVND(senderSplit.perPerson)}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-500 leading-tight mt-0.5">
                              / người (÷{senderGroupSize})
                            </div>
                          </>
                        ) : (
                          <div className="text-[15px] sm:text-base font-mono font-extrabold text-brand tabular-nums leading-tight">
                            {formatVND(tx.amount)}
                          </div>
                        )}
                      </div>

                      {!hasAccountNo && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyRawAmount(
                              txKey,
                              copyTargetAmount,
                              senderSplit ? 'số tiền mỗi người' : undefined
                            )
                          }
                          aria-label={`Copy số tiền ${sender.name} chuyển ${recipient.name}`}
                          title={senderSplit ? 'Copy số tiền mỗi người' : 'Copy số tiền'}
                          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                            copiedKey === `amt_${txKey}`
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                              : 'bg-slate-100/90 hover:bg-brand-soft text-slate-600 hover:text-brand'
                          }`}
                        >
                          {copiedKey === `amt_${txKey}` ? (
                            <Check aria-hidden="true" className="w-3.5 h-3.5" />
                          ) : (
                            <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chỉ hiển thị dải STK + 2 nút Copy tinh gọn khi người nhận có khai báo STK */}
                  {hasAccountNo && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                      <div className="text-[11.5px] font-mono text-slate-600 leading-snug break-words min-w-0 flex-1">
                        <strong className="text-slate-900 select-all">{cleanAccountNo}</strong>
                        {hasBankMeta && (
                          <span className="text-slate-500 font-sans">
                            {' · '}
                            {bankMetaParts.join(' · ')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyAccountNo(txKey, recipient)}
                          aria-label={`Copy STK của ${recipient.name}`}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-[11px] font-bold text-slate-700 inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {copiedKey === `stk_${txKey}` ? (
                            <Check aria-hidden="true" className="w-3 h-3 text-emerald-600 shrink-0" />
                          ) : (
                            <Copy aria-hidden="true" className="w-3 h-3 text-slate-500 shrink-0" />
                          )}
                          <span>STK</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleCopyRawAmount(
                              txKey,
                              copyTargetAmount,
                              senderSplit ? 'số tiền mỗi người' : undefined
                            )
                          }
                          aria-label={`Copy số tiền ${sender.name} chuyển ${recipient.name}`}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-hover text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {copiedKey === `amt_${txKey}` ? (
                            <Check aria-hidden="true" className="w-3 h-3 text-emerald-300 shrink-0" />
                          ) : (
                            <Copy aria-hidden="true" className="w-3 h-3 shrink-0" />
                          )}
                          <span>{senderSplit ? 'Tiền /ng' : 'Số tiền'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Phần 2: Bảng cân đối chi tiêu */}
      <div className="space-y-1.5">
        <div className="px-0.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            <Play aria-hidden="true" className="w-3 h-3 fill-current text-slate-400" />
            <span>BẢNG CÂN ĐỐI (₫)</span>
          </div>
          {sumOfBalances !== 0 && (
            <span className="text-xs font-semibold text-amber-700">
              Lệch: {formatVND(sumOfBalances)}
            </span>
          )}
        </div>

        <section className="px-2.5 py-2.5 sm:p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse table-auto">
            <caption className="sr-only">Bảng cân đối thu chi theo từng thành viên</caption>
            <thead>
              <tr className="border-b border-slate-100 text-[10px] sm:text-[11px] uppercase tracking-tight sm:tracking-wider font-bold text-slate-400">
                <th scope="col" className="pb-2 pr-1">Thành viên</th>
                <th scope="col" className="pb-2 px-1 text-right whitespace-nowrap">Đã chi</th>
                <th scope="col" className="pb-2 px-1 text-right whitespace-nowrap">Phải chịu</th>
                <th scope="col" className="pb-2 pl-1 text-right whitespace-nowrap">Dư/Thiếu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px] sm:text-xs">
              {sortedBalances.map((row) => {
                const member = getMember(row.memberId);
                if (!member) return null;
                const isMe = member.id === currentUserId;
                const groupSize = getMemberGroupSize(member);
                const owedPerPerson =
                  groupSize > 1 ? splitPerGroupMember(row.owedExpense, groupSize) : null;
                const balancePerPerson =
                  groupSize > 1 ? splitPerGroupMember(row.balance, groupSize) : null;
                return (
                  <tr
                    key={row.memberId}
                    className={`transition-colors ${
                      isMe ? 'bg-brand-soft/50 font-medium' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-2 pr-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MemberAvatar member={member} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-bold text-slate-800 truncate max-w-[78px] sm:max-w-none">
                              {member.name}
                            </span>
                            {isMe && (
                              <span className="text-[10px] text-brand font-bold shrink-0">
                                •
                              </span>
                            )}
                          </div>
                          {groupSize > 1 && (
                            <div className="text-[9.5px] sm:text-[10px] font-semibold text-brand whitespace-nowrap">
                              Nhóm ÷{groupSize}
                            </div>
                          )}
                          {row.netTransfer !== 0 && (
                            <div className="text-[9.5px] sm:text-[10px] font-mono text-amber-700 tabular-nums tracking-tight whitespace-nowrap">
                              {row.netTransfer > 0
                                ? `Đã CK: ${formatVND(row.netTransfer, false)}`
                                : `Đã nhận: ${formatVND(Math.abs(row.netTransfer), false)}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-1 text-right font-mono text-slate-700 tabular-nums tracking-tight whitespace-nowrap align-top">
                      <div>{formatVND(row.paidExpense, false)}</div>
                    </td>
                    <td className="py-2 px-1 text-right font-mono text-slate-700 tabular-nums tracking-tight whitespace-nowrap align-top">
                      <div>{formatVND(row.owedExpense, false)}</div>
                      {owedPerPerson && row.owedExpense > 0 && (
                        <div className="text-[9.5px] sm:text-[10px] text-slate-500">
                          {owedPerPerson.isExact ? '' : '~'}
                          {formatVND(owedPerPerson.perPerson, false)}/ng
                        </div>
                      )}
                    </td>
                    <td
                      className={`py-2 pl-1 text-right font-mono font-extrabold tabular-nums tracking-tight whitespace-nowrap align-top ${
                        row.balance > 0
                          ? 'text-emerald-700'
                          : row.balance < 0
                          ? 'text-rose-600'
                          : 'text-slate-500'
                      }`}
                    >
                      <div>
                        {row.balance > 0 ? '+' : ''}
                        {formatVND(row.balance, false)}
                      </div>
                      {balancePerPerson && row.balance !== 0 && (
                        <div className="text-[9.5px] sm:text-[10px] font-bold opacity-85">
                          {balancePerPerson.isExact ? '' : '~'}
                          {balancePerPerson.perPerson > 0 ? '+' : ''}
                          {formatVND(balancePerPerson.perPerson, false)}/ng
                        </div>
                      )}
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
});

