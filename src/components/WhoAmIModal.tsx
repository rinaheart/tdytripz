import React from 'react';
import { Check, UserCheck, X } from 'lucide-react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import type { Member } from '../types';
import { MemberAvatar } from './MemberAvatar';

interface WhoAmIModalProps {
  isOpen: boolean;
  members: Member[];
  currentUserId: string | null;
  tripName: string;
  onSelectMember: (memberId: string) => void;
  onClose?: () => void;
}

export const WhoAmIModal: React.FC<WhoAmIModalProps> = ({
  isOpen,
  members,
  currentUserId,
  tripName,
  onSelectMember,
  onClose,
}) => {
  const modalRef = useModalAccessibility<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  const activeMembers = [...members]
    .filter((m) => m.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whoami-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand mb-0.5">
              <UserCheck aria-hidden="true" className="w-4 h-4" />
              <span>{tripName}</span>
            </div>
            <h2 id="whoami-modal-title" className="text-lg font-bold text-slate-900 text-balance">
              Bạn là ai?
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Chọn tên để tự động gán người trả khi thêm khoản mới.
            </p>
          </div>
          {currentUserId && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              <X aria-hidden="true" className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain grid grid-cols-1 gap-2.5">
          {activeMembers.map((member) => {
            const isSelected = member.id === currentUserId;
            return (
              <button
                key={member.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectMember(member.id)}
                className={`w-full min-h-[54px] px-4 py-2.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'border-2 border-brand bg-brand-soft/60 text-slate-900 shadow-sm shadow-brand/5'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MemberAvatar member={member} size="lg" />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">
                      {member.name}
                    </div>
                  </div>
                </div>

                <div
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-brand text-white' : 'border border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <Check aria-hidden="true" className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
