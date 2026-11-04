import type { ExpenseReportData } from './pdfReportData';
import {
  buildPdfDocument,
  type BuildPdfOptions,
} from './pdf/buildDocument';
import { loadPlusJakartaFonts } from './pdf/fonts';

export * from './pdfReportData';
export * from './pdf/buildDocument';
export * from './pdf/primitives';
export * from './pdf/fonts';
export * from './pdf/theme';

export async function exportExpenseReportPdf(
  report: ExpenseReportData,
  options?: BuildPdfOptions
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Cần Internet để xuất PDF');
  }

  const fonts = await loadPlusJakartaFonts();
  const doc = buildPdfDocument(report, fonts, options);
  const blob = doc.output('blob');
  const fileName = report.suggestedFileName || 'report_trip.pdf';

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  ) {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: report.tripName });
        return;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
  }

  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
