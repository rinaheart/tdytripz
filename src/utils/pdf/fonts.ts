import type { jsPDF } from 'jspdf';

export interface PdfFontData {
  regular: string;
  bold: string;
}

const FONT_REGULAR_PATH = '/fonts/PlusJakartaSans-Medium.ttf';
const FONT_BOLD_PATH = '/fonts/PlusJakartaSans-Bold.ttf';

let cachedFonts: PdfFontData | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

async function fetchFontAsBase64(url: string, timeoutMs = 10000): Promise<string> {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} khi tải ${url}`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 1000) {
      throw new Error(`Dữ liệu font không hợp lệ (${url})`);
    }
    return arrayBufferToBase64(buf);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/**
 * Nạp cặp font Plus Jakarta Sans (Medium & Bold) tự host ở `public/fonts/`.
 * Nếu lỗi sẽ throw thông báo rõ ràng, tuyệt đối không fallback sang helvetica hay Roboto.
 */
export async function loadPlusJakartaFonts(): Promise<PdfFontData> {
  if (cachedFonts) {
    return cachedFonts;
  }

  try {
    const [regular, bold] = await Promise.all([
      fetchFontAsBase64(FONT_REGULAR_PATH),
      fetchFontAsBase64(FONT_BOLD_PATH),
    ]);
    cachedFonts = { regular, bold };
    return cachedFonts;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Lỗi mạng';
    throw new Error(`Không thể tải font Plus Jakarta Sans để tạo PDF (${detail}).`);
  }
}

/**
 * Đăng ký font Plus Jakarta Sans vào thực thể jsPDF (hàm thuần không I/O).
 */
export function registerPlusJakartaFonts(doc: jsPDF, fonts: PdfFontData): string {
  if (!fonts || !fonts.regular || !fonts.bold) {
    throw new Error(
      'Thiếu dữ liệu font Plus Jakarta Sans (regular/bold). Không thể kết xuất báo cáo PDF.'
    );
  }

  doc.addFileToVFS('PlusJakartaSans-Medium.ttf', fonts.regular);
  doc.addFont('PlusJakartaSans-Medium.ttf', 'PlusJakartaSans', 'normal');
  doc.addFont('PlusJakartaSans-Medium.ttf', 'PlusJakartaSans', 'italic');

  doc.addFileToVFS('PlusJakartaSans-Bold.ttf', fonts.bold);
  doc.addFont('PlusJakartaSans-Bold.ttf', 'PlusJakartaSans', 'bold');
  doc.addFont('PlusJakartaSans-Bold.ttf', 'PlusJakartaSans', 'bolditalic');

  doc.setFont('PlusJakartaSans', 'normal');
  return 'PlusJakartaSans';
}
