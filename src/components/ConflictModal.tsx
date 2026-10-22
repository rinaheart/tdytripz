import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { ExpenseRecord, Member, SyncQueueItem } from '../types';
import { formatVND } from '../utils/format';

interface ConflictModalProps {
  conflictItem: SyncQueueItem | null;
  serverRecord: ExpenseRecord | null;
  members: Member[];
  onAcceptServer: (conflictItem: SyncQueueItem, serverRecord: ExpenseRecord) => void;
  onForceKeepClient: (conflictItem: SyncQueueItem, serverRecord: ExpenseRecord) => void;
  onClose: () => void;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  conflictItem,
  serverRecord,
  members,
  onAcceptServer,
  onForceKeepClient,
  onClose,
}) => {
  const [selectedChoice, setSelectedChoice] = useState<'server' | 'client'>('client');

  useEffect(() => {
    if (conflictItem) {
      setSelectedChoice('client');
    }
  }, [conflictItem]);

  useEffect(() => {
    if (!conflictItem || !serverRecord) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conflictItem, serverRecord, onClose]);

  if (!conflictItem || !serverRecord) return null;

  const clientRec = conflictItem.record;
  const getMemberName = (id: string) => members.find((m) => m.id === id)?.name || id;

  const handleConfirm = () => {
    if (selectedChoice === 'server') {
      onAcceptServer(conflictItem, serverRecord);
    } else {
      onForceKeepClient(conflictItem, serverRecord);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full max-w-lg bg-white rounded-t-md sm:rounded-md border border-slate-200 shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="p-4 bg-amber-50/80 border-b border-amber-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle aria-hidden="true" className="w-5 h-5" />
            </div>
            <div>
              <h2 id="conflict-modal-title" className="text-sm font-bold text-slate-900 text-balance">
                Trùng cập nhật (rev #{serverRecord.rev})
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Tick chọn bản muốn giữ rồi bấm Xác nhận:
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-sm text-slate-500 hover:bg-amber-100 transition-colors"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto overscroll-contain grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Option 1: Bản trên Sheet */}
          <button
            type="button"
            onClick={() => setSelectedChoice('server')}
            aria-pressed={selectedChoice === 'server'}
            className={`p-3.5 rounded-md border text-left transition-colors space-y-2 cursor-pointer ${
              selectedChoice === 'server'
                ? 'border-brand bg-brand-soft/60 ring-2 ring-brand'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-sm flex items-center justify-center border shrink-0 transition-colors ${
                    selectedChoice === 'server'
                      ? 'bg-brand border-brand text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedChoice === 'server' && <Check aria-hidden="true" className="w-3 h-3 stroke-[3]" />}
                </div>
                <span className="text-xs font-bold text-slate-800">Bản trên Sheet</span>
              </div>
              <span className="text-xs font-mono font-semibold text-brand">
                rev #{serverRecord.rev}
              </span>
            </div>

            <div className="text-sm font-bold text-slate-900">{serverRecord.title}</div>
            <div className="text-base font-mono font-extrabold text-brand tabular-nums">
              {formatVND(serverRecord.amount)}
            </div>
            <div className="text-xs text-slate-600 pt-1.5 border-t border-slate-200/80">
              Chi: <strong>{getMemberName(serverRecord.payer)}</strong> · Sửa:{' '}
              <strong>{getMemberName(serverRecord.updatedBy)}</strong>
            </div>
          </button>

          {/* Option 2: Bản của bạn */}
          <button
            type="button"
            onClick={() => setSelectedChoice('client')}
            aria-pressed={selectedChoice === 'client'}
            className={`p-3.5 rounded-md border text-left transition-colors space-y-2 cursor-pointer ${
              selectedChoice === 'client'
                ? 'border-brand bg-brand-soft/60 ring-2 ring-brand'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-sm flex items-center justify-center border shrink-0 transition-colors ${
                    selectedChoice === 'client'
                      ? 'bg-brand border-brand text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {selectedChoice === 'client' && <Check aria-hidden="true" className="w-3 h-3 stroke-[3]" />}
                </div>
                <span className="text-xs font-bold text-slate-800">Bản của bạn</span>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-500">
                rev #{conflictItem.baseRev}
              </span>
            </div>

            <div className="text-sm font-bold text-slate-900">{clientRec.title}</div>
            <div className="text-base font-mono font-extrabold text-brand tabular-nums">
              {formatVND(clientRec.amount)}
            </div>
            <div className="text-xs text-slate-600 pt-1.5 border-t border-slate-200/80">
              Chi: <strong>{getMemberName(clientRec.payer)}</strong> · Lúc: {clientRec.spentAt}
            </div>
          </button>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 rounded-sm border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors"
          >
            Để sau
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 min-h-[44px] px-5 py-2 rounded-sm bg-brand hover:bg-brand-hover text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
          >
            <Check aria-hidden="true" className="w-4 h-4 stroke-[2.5]" />
            <span>Xác nhận</span>
          </button>
        </div>
      </div>
    </div>
  );
};
