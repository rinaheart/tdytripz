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
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-3xl mx-auto px-2 h-14 grid grid-cols-5 items-center relative">
        {tabs.slice(0, 2).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center rounded-sm transition-colors relative ${
                isActive ? 'text-brand font-bold' : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <span aria-hidden="true">
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
              </span>
              <span className="text-[10px] sm:text-[11px] mt-0.5 whitespace-nowrap">
                {tab.label}
              </span>
              {tab.id === 'expenses' && pendingSyncCount > 0 && (
                <span className="absolute top-1 right-4 min-w-[16px] h-[16px] px-1 rounded-sm bg-amber-700 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
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
            className={`w-11 h-9 rounded-sm flex items-center justify-center transition-[background-color,transform] active:scale-95 ${
              isTripCompleted
                ? 'bg-slate-200 text-slate-600 cursor-not-allowed'
                : 'bg-brand hover:bg-brand-hover text-white shadow-sm'
            }`}
          >
            <Plus aria-hidden="true" className="w-5 h-5 stroke-[2.5]" />
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
              className={`min-h-[44px] flex flex-col items-center justify-center rounded-sm transition-colors ${
                isActive ? 'text-brand font-bold' : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <span aria-hidden="true">
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.9]'}`} />
              </span>
              <span className="text-[10px] sm:text-[11px] mt-0.5 whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
