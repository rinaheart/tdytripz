/**
 * Nơi duy nhất quản lý thông tin định danh & phiên bản ứng dụng (Single Source of Truth).
 * Định dạng bắt buộc: v[yyyymmdd-HHmm] (GMT+7).
 * Khi chạy dev hoặc build, Vite plugin (vite.config.ts) sẽ tự động đồng bộ APP_VERSION sang:
 * - public/version.json (kiểm tra bản cập nhật tự động)
 * - public/sw.js (CACHE_NAME của PWA Service Worker)
 */
export const APP_NAME = 'TdyTrip';
export const APP_VERSION = 'v20261030-1300';

