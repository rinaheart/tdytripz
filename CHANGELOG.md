# Changelog

Mọi thay đổi đáng chú ý của dự án **TdyTrip** đều được ghi nhận tại tệp này.

> **Quy ước định dạng phiên bản hệ thống:** `v[yyyy.mm.dd_HH.mm]` theo múi giờ **GMT+7**.

---

## [v2026.11.04_09.15] - 2026-11-04

### Changed
- **Chuyển đổi 100% Icon Báo cáo PDF sang bộ Lucide (`src/utils/pdfLucideIcons.ts`, `src/utils/pdfReport.ts`):**
  - Xây dựng bộ thông dịch SVG Path chuẩn `24x24` (`parseSvgPathToSubpaths` & `drawLucideIcon`) sử dụng trực tiếp dữ liệu hình học gốc của `lucide-react`, hỗ trợ linh hoạt nhiều biến thể trình bày (`duotone-circle`, `rounded-badge`, `solid-badge`, `plain`) để vừa nổi bật vừa đồng bộ tuyệt đối với Web App.
- **Đồng nhất Quy tắc trình bày, Đơn vị `₫`, Avatar thành viên & Ký tự Unicode với Web App (`src/utils/pdfReport.ts`, `src/utils/pdfReportData.ts`):**
  - **Đơn vị `₫`**: Chỉ hiển thị tại các chỉ số chính (thẻ KPI tổng quan/cá nhân, con số quyết toán trọng tâm và kết quả công thức); lược bỏ `₫` lặp lại ở từng mục con và đưa `(₫)` lên tiêu đề chung (`Theo danh mục (₫)`, `Theo ngày (₫)`, `So sánh Đã chi & Phải chịu theo Thành viên (₫)`, `CÂN ĐỐI THU CHI & QUYẾT TOÁN (₫)`, `DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN (₫)`, `Chi phí theo Hạng mục ([username]) (₫)`, `DANH SÁCH CHI TIẾT KHOẢN CHI (₫)`).
  - **Thứ tự trình bày thống kê**: Hiển thị đúng thứ tự của Web App (`[Icon Lucide] Tên hạng mục đầy đủ` ở bên trái — `Tỷ lệ %` màu phụ đứng trước `Số tiền` in đậm ở bên phải, ví dụ: `Vé đi/về (máy bay/tàu xe)   49%   11.021.005`).
  - **Đồng bộ Avatar thành viên**: Bổ sung huy hiệu Avatar tròn (màu thành viên + chữ cái đầu của tên) cho toàn bộ bảng và hộp có danh sách thành viên (Biểu đồ so sánh, Bảng cân đối thu chi, Bảng danh sách chuyển khoản quyết toán, Hộp quyết toán cá nhân và cột Người chi ở Bảng chi tiết khoản chi).
  - **Ký tự Unicode gốc**: Sử dụng trực tiếp ký tự Unicode `→` (`U+2192`) và `•` (`U+2022`) từ bộ font `Plus Jakarta Sans` đã nhúng thay vì vẽ mũi tên vector thủ công.

---

## [v2026.11.03_20.55] - 2026-11-03

### Added
- **Kiểm tra cảnh báo trùng khoản chi trong cùng ngày (`src/utils/format.ts`, `src/components/ExpenseFormModal.tsx`):**
  - Bổ sung hàm `findDuplicateExpenseOnSameDay` kiểm tra xem trước khi lưu khoản chi mới có khoản chi nào chưa xóa mang cùng **Tiêu đề** (không phân biệt hoa/thường và khoảng trắng thừa) và cùng **Số tiền** trong cùng ngày (`spentAt` hoặc `createdAt`) hay không.
  - Hiển thị khung cảnh báo xác nhận trực quan ngay trên biểu mẫu để người dùng kiểm tra và bấm **Xác nhận lưu** nếu thực sự muốn ghi nhận khoản chi thứ hai trùng thông tin trong ngày.

### Changed
- **Đồng bộ Thiết kế Phẳng (Minimalist Flat-Design) & Ký hiệu tiền tệ `₫` trên Báo cáo PDF (`src/utils/pdfReport.ts`):**
  - Cập nhật thẻ bên trái của Phụ lục cá nhân thành nhãn chính xác **`Số tiền cần chuyển`** hoặc **`Số tiền cần nhận`**, đồng bộ cấu trúc khung phẳng với thẻ bên phải **`Chi phí theo Hạng mục ([username])`**: thẻ trái có viền đỏ nhạt + header nền đỏ đậm, thẻ phải có viền xanh nhạt + header nền xanh đậm, lược bỏ dải viền dọc lệch bên trái.
  - Chuyển đổi toàn bộ đơn vị tiền tệ trong báo cáo PDF sang ký hiệu **`₫`** (`U+20AB`).
  - Áp dụng thống nhất phong cách **Hero Header phẳng** và **các thẻ KPI phẳng** (nền pastel dịu, viền mảnh đồng màu, icon vector tròn lớn bên trái, nội dung chữ căn trái bên phải) cho cả **Trang 1 (Tổng quan)** và **Phụ lục cá nhân (3 thẻ KPI: Đã chi, Phải chịu, Số dư cuối)**.

---

## [v2026.11.03_15.50] - 2026-11-03

### Changed
- **Chuyển đổi 100% Icon & Đồ họa PDF sang Vector Gốc (`src/utils/pdfReport.ts`):**
  - Thay thế toàn bộ cơ chế vẽ icon qua thẻ `<canvas>` (`doc.addImage(..., 'PNG')`) bằng các lệnh vẽ vector gốc của PDF (`doc.roundedRect`, `doc.rect`, `doc.circle`, `doc.triangle`, `doc.line`, `doc.lines`) cho cả bộ icon nét mảnh (`drawVectorStrokeIconGeometry`), bộ icon phẳng Minimalist Flat-Design (`drawFlatAppendixIcon`) và nền sóng hình học của Hero Banner (`drawAppendixHeroBannerBackground`).
  - Đảm bảo khi người dùng phóng to báo cáo PDF lên 400%–1600% trên mọi trình đọc PDF, tất cả icon, biểu đồ và chữ đều giữ nguyên độ sắc nét tuyệt đối, không bị vỡ hạt (pixelated).
- **Đồng nhất Font chữ Báo cáo PDF với Web App (`Plus Jakarta Sans`):**
  - Tải và nhúng trực tiếp bộ font TrueType **`Plus Jakarta Sans`** (`Medium 500` cho kiểu chữ thường và `Bold 700` cho kiểu chữ đậm, hỗ trợ đầy đủ dấu tiếng Việt Unicode) vào tệp PDF, giúp kiểu dáng chữ và độ đậm nhạt trên PDF đồng nhất hoàn toàn với giao diện Web App.
- **Đơn giản hóa quy tắc đặt tên file báo cáo PDF (`src/utils/pdfReportData.ts`):**
  - Đổi định dạng tên file xuất ra thành `report-[địa-điểm]-[yyyymmdd-HHmm].pdf` (ví dụ: `report-Hà-Nội-20261103-1515.pdf`), lấy giá trị `[địa-điểm]` từ trường Địa điểm (`config.location`) do Admin thiết lập trong thẻ Cài đặt.

---

## [v2026.11.02_10.52] - 2026-11-02

### Changed
- **Thiết kế lại Phụ lục Cá nhân PDF theo phong cách Minimalist Flat-Design (`src/utils/pdfReport.ts`):**
  - **Hero Banner Hình học Tối giản (`drawAppendixHeroBannerBackground`):** Nền xanh Navy đậm kết hợp hai mảng sóng hình học phẳng ở góc phải, đồng bộ với badge avatar tròn và tiêu đề in hoa sắc nét.
  - **Hệ thống Icon Phẳng (`renderFlatAppendixIconDataUrl`):** Vẽ trực tiếp các biểu tượng hình học phẳng (`Wallet`, `Users`, `CheckSolid` nền tím đặc, `RefreshCw`, `PieChartHeader`, `Plane`, `Utensils`, `Hotel`, `MoreDots` 3 chấm ngang cho hạng mục Khác, `Car` chính diện, `Calculator`) có độ phân giải cao.
  - **Lưới 4 thẻ KPI (`drawAppendixFourKpiGrid`):** Bổ sung thanh màu nhấn phía trên (`Top Colored Accent Bar`), đặt badge icon tròn kích thước lớn (`8.4mm`) ở bên trái ôm trọn chiều cao của Nhãn + Chỉ số chính bên phải, và căn giữa dòng mô tả phụ ở đáy thẻ.
  - **Khối Quyết toán Cá nhân & Chi phí Hạng mục (Grid 50/50):** Bổ sung thanh nhấn dọc bên trái (`Left Vertical Accent Bar`) cho thẻ `SỐ TIỀN CẦN CHUYỂN TRẢ` / `SỐ TIỀN ĐƯỢC NHẬN VỀ`, phóng lớn con số quyết toán trọng tâm (`25pt`), hộp pill `Loan → Nhi`, dòng `TK nhận` ngăn cách bằng ký hiệu chấm tròn rỗng (`◦`) và dòng công thức tính nhanh kèm icon máy tính ở đáy thẻ.

---

## [v2026.11.02_08.25] - 2026-11-02

### Added
- **Bản đồ Tính năng & Luồng Nghiệp vụ (`docs/FEATURE_MAP.md`):**
  - Xây dựng tài liệu Feature Map trực quan theo chuẩn `markphelps-feature-map`, bao gồm sơ đồ kiến trúc tổng thể (Mermaid), bảng điều hướng (Navigation Sitemap) và chi tiết 8 phân hệ tính năng cốt lõi (Workflow, Selectors điều khiển, Kết quả kỳ vọng và Quy tắc bất biến/Gotchas).

---

## [v2026.11.01_20.08] - 2026-11-01

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
  - Áp dụng quy tắc phiên bản thống nhất `v[yyyy.mm.dd_HH.mm]` (GMT+7) trên toàn hệ thống (`src/version.ts`, `public/version.json`, `public/sw.js`).

---

## [v2026.11.01_14.30] - 2026-11-01

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

## [v2026.04.02_22.00] - 2026-04-02

### Added
- **Quản trị chuyến đi & Bảo mật PIN trên Server:**
  - Hỗ trợ trạng thái chuyến đi (`active` / `completed`) và xác thực mã PIN Quản trị thông qua băm SHA-256 lưu trong `ScriptProperties` của Google Apps Script (PIN mặc định: `2026`).
- **Tối ưu hiệu năng hiển thị:**
  - Bổ sung Progressive Rendering (phân trang hiển thị tăng dần) và debounced search cho danh sách chi tiêu lớn.

---

## [v2026.04.01_12.00] - 2026-04-01

### Added
- **Phát hành phiên bản nền tảng (Core Release):**
  - Quản lý danh sách chi tiêu nhóm với 3 chế độ chia tiền (`equal`, `shares`, `exact`) và phân bổ phần dư chính xác.
  - Bảng quyết toán công nợ tối ưu hóa số lần chuyển khoản và sao chép nội dung thanh toán nhanh.
  - Đồng bộ hai chiều với Google Sheets kèm hàng đợi ngoại tuyến (`syncQueue`) và xử lý xung đột phiên bản (`rev`).
  - Hỗ trợ giao diện Sáng/Tối (Dark Mode) và cài đặt ứng dụng PWA trên thiết bị di động.
