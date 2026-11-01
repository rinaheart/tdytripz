import React from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface PWAInstallModalProps {
  isOpen: boolean;
  isIOS: boolean;
  isInstallable: boolean;
  onInstallNative: () => Promise<boolean>;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  isIOS,
  isInstallable,
  onInstallNative,
  onClose,
}) => {
  const modalRef = useModalAccessibility<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full max-w-sm bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
              <Smartphone aria-hidden="true" className="w-4 h-4" />
            </div>
            <div>
              <h2 id="pwa-install-title" className="text-sm font-bold text-slate-900">
                Cài ứng dụng vào điện thoại
              </h2>
              <p className="text-[11px] text-slate-500">
                Mở toàn màn hình & dùng mượt khi Offline
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 text-xs text-slate-700">
          {isInstallable ? (
            <div className="space-y-3">
              <p className="leading-relaxed">
                Nhấn nút bên dưới để cài đặt trực tiếp ứng dụng ra màn hình chính:
              </p>
              <button
                type="button"
                onClick={async () => {
                  const ok = await onInstallNative();
                  if (ok) onClose();
                }}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download aria-hidden="true" className="w-4 h-4" />
                <span>Cài đặt ngay</span>
              </button>
            </div>
          ) : isIOS ? (
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Nhấn nút <strong>Chia sẻ</strong>{' '}
                    <Share aria-hidden="true" className="w-3.5 h-3.5 inline text-brand mx-0.5" /> ở thanh công cụ Safari.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Cuộn xuống và chọn <strong>Thêm vào MH chính</strong>{' '}
                    <PlusSquare aria-hidden="true" className="w-3.5 h-3.5 inline text-brand mx-0.5" />.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Mở menu trình duyệt <strong>(⋮)</strong> hoặc biểu tượng cài đặt trên thanh địa chỉ.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Chọn <strong>Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>.
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
};
