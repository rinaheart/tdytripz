# Changelog

Mọi thay đổi đáng chú ý của dự án **TdyTrip** đều được ghi nhận tại tệp này.

> **Quy ước định dạng phiên bản hệ thống:** `v[yyyymmdd_HHmm]` theo múi giờ **GMT+7**.

---

## [v20261101_2008] - 2026-11-01

### Added
- **Bảo vệ toàn vẹn khi Khóa sổ chuyến đi (`tripStatus: 'completed'`):**
  - Chặn toàn bộ thao tác tạo mới, chỉnh sửa, xóa khoản chi và cập nhật cấu hình ở cả giao diện lẫn hàm xử lý dữ liệu khi chuyến đi đã khóa sổ.
  - Khi đồng bộ hàng đợi ngoại tuyến (`syncQueue`) gặp trạng thái `TRIP_COMPLETED` từ Google Sheets, đánh dấu bản ghi là `syncStatus: 'error'` và giữ mục hàng đợi ở trạng thái `nonRetryable: true` để tránh vòng lặp tự động gửi lại vô tận mà không làm mất dữ liệu cục bộ của người dùng.
  - Bổ sung cảnh báo trực quan khi có khoản chi ngoại tuyến bị từ chối do chuyến đi đã khóa sổ.
- **Chống trùng lặp & Chống ghi đè khi đồng bộ (`Idempotency & In-flight Race Protection`):**
  - Gắn mã định danh duy nhất `operationId` cho từng mục trong `syncQueue` và đối chiếu `splitMeta.lastOperationId` trên Google Apps Script (`Code.gs`) để đảm bảo an toàn khi mạng timeout hoặc gửi lại (`Idempotent Retry`).
  - Bảo vệ khoản chi đang được chỉnh sửa trong lúc tiến trình đồng bộ nền đang chạy (`In-flight Edit Protection`).
- **Kiểm thử tự động toàn diện (21 Unit & Contract Tests):**
  - Bổ sung bộ kiểm thử `src/services/syncService.test.ts` bên cạnh `src/utils/math.test.ts` và `src/utils/pdfReport.test.ts` để xác minh quy tắc chỉnh sửa, khóa sổ chuyến đi, hợp nhất dữ liệu (`mergeRemoteAndLocalExpenses`) và xử lý hàng đợi ngoại tuyến.
- **Chịu lỗi tải gói (Chunk Error Recovery) & Lưu nháp tự động:**
  - Thêm `ChunkErrorBoundary` và cơ chế tự động khôi phục bản nháp biểu mẫu (`sessionStorage`) nếu trình duyệt cần tải lại khi cập nhật phiên bản mới.

### Changed
- **Thống nhất bố cục số tiền & Thông báo (UI/UX):**
  - Tại tab **Tổng quan (`OverviewTab.tsx`)**, căn phải (`text-right`) hai con số lớn về tiền (**Tổng chi toàn đoàn** và **Tổng tiền cần nhận/trả của thành viên đang chọn**) cùng mức bình quân/người để đồng nhất quy tắc căn phải cho mọi con số tiền tệ.
  - Căn giữa (`justify-center text-center`) cho các thanh thông báo/toast quan trọng như thông báo **Chuyến đi đã kết thúc — Chế độ chỉ xem** và hệ thống toast nổi.
- **Đơn giản hóa mô hình Nhóm Tin Cậy (Trusted Group):**
  - Loại bỏ cơ chế khóa quyền sửa theo thiết bị (`deviceToken` / `creatorToken`) gây bất tiện khi đổi máy hoặc dùng chung thiết bị.
  - Phân biệt rõ **Người tạo khoản chi (`createdBy`)** và **Người trả tiền (`payer`)**: quyền chỉnh sửa mặc định thuộc về `createdBy` (hoặc Admin), đồng thời hỗ trợ nút **"Chuyển sang [Tên] & Sửa ngay"** chỉ với 1 chạm.
- **Tối ưu hóa PWA Service Worker & Xuất PDF trực tuyến:**
  - Chuyển sang cơ chế **Tiered Precache**: chỉ precache các tài nguyên giao diện thiết yếu (Core Shell & Tabs), loại trừ các gói chỉ dùng trực tuyến (`gasCode`, `pdfReport`).
  - Tính năng xuất báo cáo PDF (`pdfmake` qua CDN) được giới hạn chỉ hoạt động khi có kết nối mạng kèm cơ chế timeout 12 giây và thông báo rõ ràng.
- **Chuẩn hóa định dạng phiên bản:**
  - Áp dụng quy tắc phiên bản thống nhất `v[yyyymmdd_HHmm]` (GMT+7) trên toàn hệ thống (`src/version.ts`, `public/version.json`, `public/sw.js`).

---

## [v20261101_1430] - 2026-11-01

### Added
- **Quản lý phiên bản tập trung (`src/version.ts`):**
  - Tạo Single Source of Truth cho `APP_NAME` và `APP_VERSION`.
  - Bổ sung Vite plugin trong `vite.config.ts` tự động đồng bộ `APP_VERSION` sang `public/version.json`, `public/sw.js` và tự động chèn danh sách tài nguyên vào `dist/sw.js` khi đóng gói.
- **Thông báo cập nhật phiên bản mới (`Update Banner`):**
  - Tự động kiểm tra phiên bản mới và hiển thị thanh thông báo cập nhật an toàn (chờ hàng đợi đồng bộ hoàn tất trước khi tải lại trang).

### Changed
- **Nâng cấp Dependencies:** Cập nhật React 19, Vite 6, Tailwind CSS v4 và TypeScript lên phiên bản ổn định mới nhất.
- **Dọn dẹp Codebase:** Loại bỏ các thư viện và tệp tin dư thừa không sử dụng để tối ưu tốc độ đóng gói.

---

## [v20260402_2200] - 2026-04-02

### Added
- **Quản trị chuyến đi & Bảo mật PIN trên Server:**
  - Hỗ trợ trạng thái chuyến đi (`active` / `completed`) và xác thực mã PIN Quản trị thông qua băm SHA-256 lưu trong `ScriptProperties` của Google Apps Script (PIN mặc định: `2026`).
- **Tối ưu hiệu năng hiển thị:**
  - Bổ sung Progressive Rendering (phân trang hiển thị tăng dần) và debounced search cho danh sách chi tiêu lớn.

---

## [v20260401_1200] - 2026-04-01

### Added
- **Phát hành phiên bản nền tảng (Core Release):**
  - Quản lý danh sách chi tiêu nhóm với 3 chế độ chia tiền (`equal`, `shares`, `exact`) và phân bổ phần dư chính xác.
  - Bảng quyết toán công nợ tối ưu hóa số lần chuyển khoản và sao chép nội dung thanh toán nhanh.
  - Đồng bộ hai chiều với Google Sheets kèm hàng đợi ngoại tuyến (`syncQueue`) và xử lý xung đột phiên bản (`rev`).
  - Hỗ trợ giao diện Sáng/Tối (Dark Mode) và cài đặt ứng dụng PWA trên thiết bị di động.
