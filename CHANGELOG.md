# Changelog

Mọi thay đổi quan trọng của dự án **Chia Tiền Nhóm — Hà Nội 3N2Đ** đều được ghi nhận tại file này.

---

## [1.3.0] - 2026-10-22

### Bảo mật (Security Hardening)
- **[SEC-01] Xác thực PIN Admin cho `initSeedData` (`src/assets/Code.gs`, `src/services/syncService.ts`, `src/App.tsx`):**
  - Bắt buộc kiểm tra `verifyPin_(body.adminPin)` trước khi cho phép chạy `initSeedData` trên Google Apps Script, ngăn chặn việc gọi API không xác thực làm ghi đè cấu hình chuyến đi hoặc danh sách số tài khoản thành viên.
- **[SEC-02] Chống dò mã PIN Admin (`Brute-Force Rate Limiting`) (`src/assets/Code.gs`, `src/services/syncService.ts`):**
  - Bổ sung bộ đếm số lần nhập sai PIN trong `CacheService` (`ADMIN_PIN_FAIL_COUNT_V2`). Tự động khóa xác thực 5 phút nếu nhập sai liên tiếp 5 lần.
- **[SEC-03] Định danh thiết bị tạo khoản chi (`creatorToken`) (`src/services/syncService.ts`, `src/assets/Code.gs`, `src/types.ts`):**
  - Sinh mã `deviceToken` lưu cục bộ trên từng trình duyệt và gắn vào `splitMeta.creatorToken` khi tạo mới khoản chi để ngăn chặn người dùng khác giả mạo `actor` sửa/xóa khoản chi không phải do mình tạo.
- **[SEC-04] Chống tấn công công thức bảng tính (`Spreadsheet Formula Injection`) (`src/assets/Code.gs`):**
  - Tự động làm sạch (`sanitizeCellValue_`) mọi chuỗi đầu vào bắt đầu bằng `=`, `+`, `-` (không phải số âm), `@`, `\t`, `\r` bằng tiền tố nháy đơn `'` trước khi ghi vào Google Sheets.
- **[SEC-05] Khóa bảo vệ `DEFAULT_GAS_URL` trước link lạ `?gas=` (`src/services/syncService.ts`):**
  - Kiểm tra định dạng URL GAS hợp lệ (`^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$`) và chặn không cho phép tham số `?gas=...` từ URL bên ngoài tự động ghi đè `localStorage` khi `DEFAULT_GAS_URL` đã được cấu hình cứng trong `src/config.ts`.

### Hiệu năng (Performance Optimization)
- **[PERF-01] Cache trạng thái khởi tạo 5 Sheet (`SCHEMA_READY_V2`) (`src/assets/Code.gs`):**
  - Lưu trạng thái kiểm tra schema và định dạng cột Plain Text (`@`) vào `CacheService` (6 giờ) thay vì chạy lại `setNumberFormat('@')` trên 1.000 dòng ở mỗi request `GET`/`POST`, giúp giảm 3–5 giây độ trễ mỗi lần đồng bộ.
- **[PERF-02] Ghi dữ liệu hàng loạt 2D (`replaceSheetWithBatchRows_`) (`src/assets/Code.gs`):**
  - Thay thế vòng lặp `.forEach(writeRowByHeader_)` (gọi `appendRow` từng dòng) trong `handleSaveAdminSettings_` và `handleInitSeedData_` bằng lệnh ghi ma trận 2 chiều `setValues(matrix)` duy nhất, giảm hơn 50 lệnh gọi I/O xuống còn 3 lệnh.
- **[PERF-03] Read-Through Cache cho `doGet` (`TRIP_SNAPSHOT_V2`) (`src/assets/Code.gs`):**
  - Cache JSON phản hồi của `doGet` trong `CacheService` (45 giây) và tự động xóa cache (`invalidateSnapshotCache_`) ngay khi có bất kỳ thay đổi dữ liệu nào trong `doPost` hoặc khi lưu trữ (`archiveCurrentTripMenu`).
- **[PERF-04] Đồng bộ hàng đợi theo lô (`batchUpsertExpenses`) (`src/assets/Code.gs`, `src/services/syncService.ts`):**
  - Khi thiết bị có từ 2 khoản chi trở lên trong hàng đợi `syncQueue`, tự động gom toàn bộ vào một request `batchUpsertExpenses` duy nhất để chỉ giữ `LockService` 1 lần và đọc bảng `Expenses` 1 lần.

### Tinh gọn tính năng & UI/UX (Mobile-First MVP)
- **Loại bỏ hoàn toàn các thành phần liên quan đến VietQR (`src/components/SettlementTab.tsx`):**
  - Giữ trải nghiệm quyết toán tối giản nhất cho nhóm nhỏ (~5 người): chỉ tính toán chính xác số tiền cần chuyển giữa các thành viên.
  - Cung cấp đúng **2 nút Copy nguyên bản** cho mỗi giao dịch cần chuyển:
    1. **STK:** Chỉ copy số tài khoản thuần túy (ví dụ: `0011004567890`).
    2. **Số tiền:** Chỉ copy số nguyên viết liền (ví dụ: `2500000`).
- **Tập trung Mã PIN Admin về mục Hệ thống & Khóa toàn bộ thao tác quản trị (`src/components/SettingsTab.tsx`, `src/App.tsx`):**
  - Khung nhập/mở khóa và đổi **Mã PIN Admin** chỉ hiển thị trong mục **Cài đặt → Hệ thống**.
  - Bắt buộc mở khóa mã PIN Admin trước khi thực hiện bất kỳ thay đổi cấu hình nào: **Thêm/Xóa thành viên**, **Thêm/Đổi STK & thông tin ngân hàng của thành viên**, **Cài đặt chuyến đi & danh mục**, và **Cài đặt hệ thống**. Thành viên bình thường chỉ xem thông tin và bấm Copy STK / Copy link mời / Đồng bộ.

---

## [1.2.0] - 2026-10-21

### Đã sửa (Fixed)
- Khắc phục lỗi xác thực mã PIN Admin (`1234`) trên Google Sheet bằng cách tách `verifyAdminPin` xử lý trực tiếp từ `ScriptProperties` và tự động đồng bộ lại `DEFAULT_GAS_URL` khi phát hiện link cũ trong `localStorage`.
- Nâng cấp độ tương phản màu sắc cho toàn bộ `MemberAvatar` và chữ phụ đạt chuẩn **WCAG AAA** (tối thiểu `7.1:1`, nền thương hiệu `#000777` Navy `18.1:1`).

---

## [1.1.0] - 2026-10-21

### Thay đổi (Changed)
- Thiết kế lại toàn bộ tab **Cài đặt (`SettingsTab.tsx`)** theo phong cách tối giản chữ, chia thành 3 phân mục gọn gàng (**Thành viên**, **Chuyến đi**, **Hệ thống**) kèm thanh mở khóa PIN Admin trực tiếp trên đầu trang.
- Cấu hình cứng `DEFAULT_GAS_URL` trong `src/config.ts` để chia sẻ link web app ngắn gọn cho nhóm bạn.
