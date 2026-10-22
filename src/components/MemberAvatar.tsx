import React from 'react';
import type { Member } from '../types';

interface AvatarPaletteItem {
  hex: string;
  bgClass: string;
}

/**
 * Bảng màu Avatar đạt chuẩn tương phản WCAG AAA (>= 7.1:1) với chữ trắng (#ffffff)
 */
export const HIGH_CONTRAST_AVATAR_PALETTE: AvatarPaletteItem[] = [
  { hex: '#000777', bgClass: 'bg-[#000777]' }, // Brand Navy (18.1:1)
  { hex: '#065f46', bgClass: 'bg-emerald-800' }, // Emerald 800 (7.7:1)
  { hex: '#92400e', bgClass: 'bg-amber-800' }, // Amber 800 (7.1:1)
  { hex: '#1e40af', bgClass: 'bg-blue-800' }, // Blue 800 (8.7:1)
  { hex: '#9f1239', bgClass: 'bg-rose-800' }, // Rose 800 (8.3:1)
  { hex: '#5b21b6', bgClass: 'bg-violet-800' }, // Violet 800 (8.4:1)
  { hex: '#155e75', bgClass: 'bg-cyan-800' }, // Cyan 800 (7.5:1)
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Chuẩn hóa màu đại diện của thành viên để luôn có độ tương phản cao với chữ trắng (#ffffff)
 * và phân biệt màu sắc giữa các thành viên ngay cả khi Google Sheet để trống hoặc trùng màu mặc định.
 */
export function resolveMemberAvatarPalette(
  member: Pick<Member, 'id' | 'name' | 'avatarColor'>,
  indexFallback?: number
): AvatarPaletteItem {
  const rawColor = (member.avatarColor || '').trim().toLowerCase();

  // Nếu thành viên có màu riêng hợp lệ trong bảng màu (không phải màu mặc định #000777 bị lặp cho mọi người)
  if (rawColor && rawColor !== '#000777') {
    const matched = HIGH_CONTRAST_AVATAR_PALETTE.find(
      (p) => p.hex.toLowerCase() === rawColor
    );
    if (matched) return matched;

    // Map các mã màu cũ sang bảng màu tương phản cao WCAG AAA
    const legacyMap: Record<string, AvatarPaletteItem> = {
      '#2563eb': HIGH_CONTRAST_AVATAR_PALETTE[3],
      '#d97706': HIGH_CONTRAST_AVATAR_PALETTE[2],
      '#7c3aed': HIGH_CONTRAST_AVATAR_PALETTE[5],
      '#db2777': HIGH_CONTRAST_AVATAR_PALETTE[4],
      '#059669': HIGH_CONTRAST_AVATAR_PALETTE[1],
      '#0d9488': HIGH_CONTRAST_AVATAR_PALETTE[6],
      '#ea580c': HIGH_CONTRAST_AVATAR_PALETTE[2],
    };
    if (legacyMap[rawColor]) return legacyMap[rawColor];
  }

  // Nếu màu trống, không hợp lệ, hoặc tất cả đang trùng #000777 từ Sheet:
  // Phân bổ màu cố định dựa theo id/tên để mỗi thành viên có màu riêng biệt, rõ nét
  const key = (member.id || member.name || '').trim().toLowerCase();
  if (key === 'mem_duy' || key === 'm1') return HIGH_CONTRAST_AVATAR_PALETTE[0];
  if (key === 'mem_duc' || key === 'm2') return HIGH_CONTRAST_AVATAR_PALETTE[3];
  if (key === 'mem_duong' || key === 'm3') return HIGH_CONTRAST_AVATAR_PALETTE[1];
  if (key === 'mem_lan' || key === 'm4') return HIGH_CONTRAST_AVATAR_PALETTE[4];
  if (key === 'mem_minh' || key === 'm5') return HIGH_CONTRAST_AVATAR_PALETTE[5];

  const idx =
    typeof indexFallback === 'number'
      ? indexFallback % HIGH_CONTRAST_AVATAR_PALETTE.length
      : hashString(key) % HIGH_CONTRAST_AVATAR_PALETTE.length;

  return HIGH_CONTRAST_AVATAR_PALETTE[idx];
}

interface MemberAvatarProps {
  member: Pick<Member, 'id' | 'name' | 'avatarColor'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<MemberAvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-6 h-6 text-[11px]',
  md: 'w-7 h-7 text-xs',
  lg: 'w-9 h-9 text-sm',
};

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  member,
  size = 'md',
  className = '',
}) => {
  const palette = resolveMemberAvatarPalette(member);
  const initial = (member.name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      aria-hidden="true"
      className={`${SIZE_CLASSES[size]} ${palette.bgClass} text-white rounded-full flex items-center justify-center font-extrabold shrink-0 select-none ring-1 ring-inset ring-black/15 shadow-2xs ${className}`}
      style={{
        backgroundColor: palette.hex,
        color: '#ffffff',
      }}
    >
      <span className="leading-none" style={{ color: '#ffffff' }}>
        {initial}
      </span>
    </div>
  );
};
