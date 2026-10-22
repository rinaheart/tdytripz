import React from 'react';
import { LayoutGrid, ReceiptText, Scale, Settings, Plus } from 'lucide-react';

export type ActiveTab = 'overview' | 'expenses' | 'settlement' | 'settings';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenAddModal: () => void;
  pendingSyncCount: number;
  isTripCompleted: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onOpenAddModal,
  pendingSyncCount,
  isTripCompleted,
}) => {
  const tabs: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutGrid },
    { id: 'expenses', label: 'Chi tiêu', icon: ReceiptText },
    { id: 'settlement', label: 'Chia tiền', icon: Scale },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-2px_10px_rgba(15,23,42,0.04)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-3xl mx-auto px-2 h-16 sm:h-17 grid grid-cols-5 items-center relative">
        {tabs.slice(0, 2).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[52px] flex flex-col items-center justify-center rounded-md transition-colors relative touch-manipulation ${
                isActive
                  ? 'text-brand font-bold bg-brand-soft/45'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <span aria-hidden="true">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.9]'}`} />
              </span>
              <span className="text-[11px] sm:text-xs mt-1 whitespace-nowrap leading-none">
                {tab.label}
              </span>
              {tab.id === 'expenses' && pendingSyncCount > 0 && (
                <span className="absolute top-1.5 right-3.5 min-w-[18px] h-[18px] px-1 rounded-sm bg-amber-700 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {pendingSyncCount}
                </span>
              )}
            </button>
          );
        })}

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onOpenAddModal}
            disabled={isTripCompleted}
            aria-label="Thêm khoản chi"
            title={isTripCompleted ? 'Đã khóa chuyến đi' : 'Thêm khoản chi'}
            className={`w-14 h-13 sm:w-15 sm:h-14 -mt-3.5 rounded-xl ring-4 ring-white flex items-center justify-center transition-[background-color,transform,box-shadow] active:scale-95 touch-manipulation ${
              isTripCompleted
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                : 'bg-brand hover:bg-brand-hover text-white shadow-md shadow-brand/25'
            }`}
          >
            <Plus aria-hidden="true" className="w-7 h-7 stroke-[2.8]" />
          </button>
        </div>

        {tabs.slice(2, 4).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[52px] flex flex-col items-center justify-center rounded-md transition-colors touch-manipulation ${
                isActive
                  ? 'text-brand font-bold bg-brand-soft/45'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <span aria-hidden="true">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.9]'}`} />
              </span>
              <span className="text-[11px] sm:text-xs mt-1 whitespace-nowrap leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
