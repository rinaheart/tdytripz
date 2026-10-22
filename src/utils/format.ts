const vndNumberFormatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

/**
 * Định dạng số nguyên thành chuỗi tiền tệ VND (ví dụ: 350.000 ₫ hoặc -125.000 ₫)
 */
export function formatVND(amount: number, showSymbol = true): string {
  const clean = Math.round(amount || 0);
  const formatted = vndNumberFormatter.format(clean);
  return showSymbol ? `${formatted}\u00A0₫` : formatted;
}

/**
 * Định dạng rút gọn cho biểu đồ / thẻ nhỏ (ví dụ: 1,25tr hoặc 350k)
 */
export function formatCompactVND(amount: number): string {
  const clean = Math.round(amount || 0);
  const abs = Math.abs(clean);
  const sign = clean < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 2).replace('.', ',').replace(/,0$/, '');
    return `${sign}${val}tr`;
  }
  if (abs >= 1_000) {
    const val = Math.round(abs / 1_000);
    return `${sign}${val}k`;
  }
  return `${sign}${abs}₫`;
}

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readThreeDigits(num: number, showZeroHundred: boolean): string {
  const hundred = Math.floor(num / 100);
  const ten = Math.floor((num % 100) / 10);
  const unit = num % 10;
  const parts: string[] = [];

  if (hundred > 0 || showZeroHundred) {
    parts.push(`${DIGITS[hundred]} trăm`);
  }

  if (ten === 0 && unit > 0) {
    if (hundred > 0 || showZeroHundred) {
      parts.push('lẻ');
    }
    parts.push(DIGITS[unit]);
  } else if (ten === 1) {
    parts.push('mười');
    if (unit === 5) {
      parts.push('lăm');
    } else if (unit > 0) {
      parts.push(DIGITS[unit]);
    }
  } else if (ten > 1) {
    parts.push(`${DIGITS[ten]} mươi`);
    if (unit === 1) {
      parts.push('mốt');
    } else if (unit === 4) {
      parts.push('tư');
    } else if (unit === 5) {
      parts.push('lăm');
    } else if (unit > 0) {
      parts.push(DIGITS[unit]);
    }
  }

  return parts.join(' ');
}

/**
 * Đọc số tiền VND thành chữ tiếng Việt chuẩn xác
 * Ví dụ: 350000 -> "Ba trăm năm mươi nghìn đồng"
 *        125000 -> "Một trăm hai mươi lăm nghìn đồng"
 */
export function readVietnameseNumber(amount: number): string {
  const clean = Math.round(Math.abs(amount || 0));
  if (clean === 0) return 'Không đồng';
  if (clean > 999_999_999_999) return 'Số tiền quá lớn';

  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups: number[] = [];
  let temp = clean;

  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const textParts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp > 0) {
      const showZeroHundred = i < groups.length - 1;
      const grpWords = readThreeDigits(grp, showZeroHundred);
      const unitLabel = units[i] ? ` ${units[i]}` : '';
      textParts.push(`${grpWords}${unitLabel}`);
    }
  }

  const fullText = textParts.join(' ').trim();
  const capitalized = fullText.charAt(0).toUpperCase() + fullText.slice(1);
  return `${capitalized} đồng`;
}

/**
 * Trả về thời gian hiện tại theo múi giờ cố định GMT+7 (Asia/Ho_Chi_Minh)
 * Định dạng: "yyyy-MM-dd HH:mm" hoặc "yyyy-MM-dd HH:mm:ss"
 */
export function getNowGMT7(includeSeconds = false): string {
  const now = new Date();
  return formatDateToGMT7(now, includeSeconds);
}

export function formatDateToGMT7(date: Date, includeSeconds = false): string {
  // Chuyển sang UTC ms rồi cộng +7 giờ
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const gmt7 = new Date(utcMs + 7 * 3600000);

  const yyyy = gmt7.getFullYear();
  const MM = String(gmt7.getMonth() + 1).padStart(2, '0');
  const dd = String(gmt7.getDate()).padStart(2, '0');
  const HH = String(gmt7.getHours()).padStart(2, '0');
  const mm = String(gmt7.getMinutes()).padStart(2, '0');
  const ss = String(gmt7.getSeconds()).padStart(2, '0');

  return includeSeconds ? `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}` : `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
}

/**
 * Trả về chuỗi "yyyy-MM-dd HH:mm" của ngày hôm qua (giữ nguyên giờ phút)
 */
export function getYesterdayGMT7(currentSpentAt?: string): string {
  const nowStr = getNowGMT7(false);
  const timePart = currentSpentAt && currentSpentAt.length >= 16 ? currentSpentAt.slice(11, 16) : nowStr.slice(11, 16);
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const yesterdayGmt7 = new Date(utcMs + 7 * 3600000 - 24 * 3600000);

  const yyyy = yesterdayGmt7.getFullYear();
  const MM = String(yesterdayGmt7.getMonth() + 1).padStart(2, '0');
  const dd = String(yesterdayGmt7.getDate()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd} ${timePart}`;
}

/**
 * Chuyển đổi giữa "yyyy-MM-dd HH:mm" và giá trị của <input type="datetime-local"> ("yyyy-MM-ddTHH:mm")
 */
export function toDatetimeLocalValue(spentAt: string): string {
  if (!spentAt) return getNowGMT7(false).replace(' ', 'T');
  return spentAt.trim().slice(0, 16).replace(' ', 'T');
}

export function fromDatetimeLocalValue(val: string): string {
  if (!val) return getNowGMT7(false);
  return val.trim().slice(0, 16).replace('T', ' ');
}

/**
 * Kiểm tra xem spentAt có nằm ở tương lai hoặc ngoài khoảng [startDate, endDate] của chuyến đi không.
 */
export function checkSpentAtRange(
  spentAt: string,
  startDate: string,
  endDate: string
): { isWarning: boolean; reason: string } {
  const cleanSpent = (spentAt || '').trim();
  const datePart = cleanSpent.slice(0, 10);
  const nowGMT7 = getNowGMT7(false);

  if (cleanSpent > nowGMT7) {
    return {
      isWarning: true,
      reason: 'Thời gian chi tiêu đang nằm ở tương lai so với giờ hiện tại (GMT+7).',
    };
  }

  if (startDate && datePart < startDate) {
    return {
      isWarning: true,
      reason: `Ngày chi tiêu (${formatShortDateVN(datePart)}) nằm trước ngày bắt đầu chuyến đi (${formatShortDateVN(startDate)}). Khoản này sẽ được xếp vào mục "Trước chuyến đi".`,
    };
  }

  if (endDate && datePart > endDate) {
    return {
      isWarning: true,
      reason: `Ngày chi tiêu (${formatShortDateVN(datePart)}) nằm sau ngày kết thúc chuyến đi (${formatShortDateVN(endDate)}).`,
    };
  }

  return { isWarning: false, reason: '' };
}

export function formatShortDateVN(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateRangeVN(startDate: string, endDate: string): string {
  if (!startDate || startDate.length < 10 || !endDate || endDate.length < 10) {
    return `${formatShortDateVN(startDate)} - ${formatShortDateVN(endDate)}`;
  }
  const [y1, m1, d1] = startDate.slice(0, 10).split('-');
  const [y2, m2, d2] = endDate.slice(0, 10).split('-');
  if (y1 === y2 && m1 === m2) {
    return `${d1}–${d2}/${m2}/${y2}`;
  }
  if (y1 === y2) {
    return `${d1}/${m1}–${d2}/${m2}/${y2}`;
  }
  return `${d1}/${m1}/${y1}–${d2}/${m2}/${y2}`;
}

export function getTripDurationShort(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return '';
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  if (days <= 0) return '';
  const nights = Math.max(0, days - 1);
  return nights > 0 ? `${days}N${nights}Đ` : `${days}N`;
}

const WEEKDAYS_VN = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/**
 * Tạo tiêu đề nhóm ngày:
 * - Nếu dateStr < startDate => "Trước chuyến đi"
 * - Nếu trong chuyến đi => "Thứ Sáu, 24/10 · Ngày 1"
 */
export function formatDayGroupHeader(
  dateStr: string,
  startDate: string,
  endDate: string
): string {
  if (!dateStr || dateStr.length < 10) return 'Khác';
  const cleanDate = dateStr.slice(0, 10);

  if (startDate && cleanDate < startDate) {
    return 'Trước chuyến đi';
  }

  const [y, m, d] = cleanDate.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const weekday = WEEKDAYS_VN[dateObj.getUTCDay()];
  const ddmm = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;

  if (startDate) {
    const [sy, sm, sd] = startDate.slice(0, 10).split('-').map(Number);
    const startObj = new Date(Date.UTC(sy, sm - 1, sd));
    const diffDays = Math.floor((dateObj.getTime() - startObj.getTime()) / (24 * 3600000)) + 1;

    if (endDate && cleanDate <= endDate && diffDays >= 1) {
      return `${weekday}, ${ddmm} · Ngày ${diffDays}`;
    }
    if (endDate && cleanDate > endDate) {
      return `${weekday}, ${ddmm} · Sau chuyến đi`;
    }
  }

  return `${weekday}, ${ddmm}`;
}

/**
 * Copy văn bản vào Clipboard đa nền tảng (HTTPS navigator.clipboard + Fallback textarea cho iOS/Android webview)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback bên dưới
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Sinh UUID v4 chuẩn cho từng khoản chi
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
