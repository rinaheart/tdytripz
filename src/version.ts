/**
 * Nơi duy nhất quản lý thông tin định danh & phiên bản ứng dụng (Single Source of Truth).
 * QUY TẮC BẮT BUỘC: Định dạng version luôn ghi theo mẫu v[yyyy.mm.dd_HH.mm] theo múi giờ GMT+7 (dùng dấu chấm '.' ngăn cách các thành phần ngày/giờ và dấu gạch dưới '_' ngăn cách ngày với giờ).
 * Khi chạy dev hoặc build, Vite plugin (vite.config.ts) sẽ tự động đồng bộ APP_VERSION sang:
 * - public/version.json (kiểm tra bản cập nhật tự động)
 * - public/sw.js (CACHE_NAME của PWA Service Worker)
 */
export const APP_NAME = 'TdyTrip';
export const APP_VERSION = 'v2026.11.04_10.30';




