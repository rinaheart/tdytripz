# TdyTrip — Ứng dụng Chia Tiền & Quản Lý Chi Tiêu Nhóm

**TdyTrip** là ứng dụng web (PWA) thiết kế theo hướng **Mobile-first** và **Offline-first**, giúp nhóm bạn ghi chép khoản chi chung, tự động tối ưu hóa giao dịch quyết toán và đồng bộ hai chiều với **Google Sheets**.

---

## 1. Tính năng cốt lõi

- **Ghi chép & Chia tiền linh hoạt:**
  - Hỗ trợ 3 chế độ chia: **Chia đều (`equal`)**, **Theo hệ số/cổ phần (`shares`)**, và **Nhập số tiền cụ thể (`exact`)**.
  - Làm tròn số nguyên VND và tự động phân bổ phần dư (`remainder`) minh bạch, đảm bảo tổng tiền chia khớp 100% với khoản chi gốc.
- **Quyết toán tối ưu (Debt Simplification):**
  - Thuật toán Greedy Matching rút gọn số lượng giao dịch chuyển khoản giữa các thành viên xuống mức tối thiểu.
  - Bảng đối soát chi tiết từng thành viên (**Đã chi**, **Phải trả**, **Chênh lệch**) và tạo nội dung tin nhắn tổng hợp kết quả + số tài khoản ngân hàng chỉ với 1 chạm.
- **Mô hình Nhóm Tin Cậy (Trusted Group):**
  - Không yêu cầu đăng nhập tài khoản cá nhân phức tạp.
  - Phân biệt rõ **Người trả tiền (`payer`)** và **Người tạo khoản chi (`createdBy`)**.
  - Cho phép chuyển ngữ cảnh thành viên 1 chạm (**"Chuyển sang [Tên] & Sửa ngay"**) để hỗ trợ nhau chỉnh sửa nhanh trên mọi thiết bị.
- **Offline-first & Đồng bộ Google Sheets an toàn:**
  - Lưu trữ cục bộ (`localStorage`) kết hợp hàng đợi `syncQueue` tuần tự có khóa chống ghi đè (`LockService` trên Google Apps Script).
  - Tự động chống trùng lặp giao dịch khi mạng chập chờn (`Idempotent Retry` qua `operationId`) và bảo vệ dữ liệu đang sửa (`In-flight Edit Protection`).
- **Quản trị chuyến đi & Xuất báo cáo PDF:**
  - **Admin PIN** (băm SHA-256 trên Google Sheets `ScriptProperties`) dùng để cấu hình chuyến đi và **Khóa sổ (`completed`)** khi kết thúc hành trình.
  - Khi chuyến đi đã khóa sổ, mọi thao tác thêm/sửa/xóa đều bị chặn ở cả Client lẫn Server; các khoản chi ngoại tuyến bị từ chối sẽ được giữ nguyên trong danh sách kèm cảnh báo rõ ràng để không mất dữ liệu.
  - Xuất báo cáo quyết toán **PDF tiếng Việt** trực tuyến (tải động thư viện `pdfmake` qua CDN khi người dùng bấm xuất file, giữ dung lượng tải trang ban đầu siêu nhẹ).

---

## 2. Cấu trúc thư mục

```text
/
├── public/
│   ├── sw.js                  # Service Worker (Tiered Precache + Stale-While-Revalidate)
│   ├── manifest.json          # Cấu hình cài đặt PWA
│   └── version.json           # Tự động đồng bộ từ src/version.ts khi build
├── src/
│   ├── assets/
│   │   └── gasCode.ts         # Mã nguồn Google Apps Script (Code.gs) nhúng sẵn trong ứng dụng
│   ├── components/
│   │   ├── OverviewTab.tsx        # Tab Tổng quan (Bento Grid, thống kê chi tiêu)
│   │   ├── ExpensesTab.tsx        # Tab Chi tiết khoản chi (Lazy-loaded, Progressive Rendering)
│   │   ├── SettlementTab.tsx      # Tab Chia tiền & Quyết toán (Lazy-loaded)
│   │   ├── SettingsTab.tsx        # Tab Cài đặt, Quản trị & Xuất PDF (Lazy-loaded)
│   │   ├── ExpenseFormModal.tsx   # Modal thêm/sửa khoản chi & lưu nháp tự động
│   │   ├── ConflictModal.tsx      # Modal xử lý xung đột phiên bản (rev)
│   │   ├── WhoAmIModal.tsx        # Modal chọn thành viên đang thao tác
│   │   ├── PWAInstallModal.tsx    # Hướng dẫn cài đặt PWA trên iOS/Android
│   │   ├── Navbar.tsx             # Thanh điều hướng dưới cùng (Bottom Navigation)
│   │   └── MemberAvatar.tsx       # Avatar thành viên
│   ├── services/
│   │   ├── syncService.ts         # Đồng bộ 2 chiều, hàng đợi Offline, Merge & Idempotency
│   │   └── syncService.test.ts    # Unit & Contract tests cho đồng bộ, khóa sổ và phân quyền
│   ├── utils/
│   │   ├── math.ts                # Thuật toán chia tiền, quyết toán & cân đối
│   │   ├── math.test.ts           # Unit tests cho thuật toán chia tiền & quyết toán
│   │   ├── pdfReport.ts           # Xuất báo cáo PDF (Online-only qua CDN)
│   │   ├── pdfReportData.ts       # Chuẩn bị dữ liệu báo cáo PDF
│   │   └── pdfReport.test.ts      # Unit tests dữ liệu báo cáo PDF
│   ├── types.ts                   # Định nghĩa TypeScript interfaces
│   ├── version.ts                 # Nơi duy nhất khai báo APP_VERSION: v[yyyymmdd_HHmm] (GMT+7)
│   └── App.tsx                    # Điều phối trạng thái, ChunkErrorBoundary & luồng tương tác chính
└── vite.config.ts                 # Cấu hình Vite + Plugin tự động đồng bộ version & Precache SW
```

---

## 3. Cài đặt & Phát triển (Local Development)

**Yêu cầu:** Node.js `>= 18.x`

```bash
# 1. Cài đặt dependencies
npm install

# 2. Chạy môi trường phát triển (http://localhost:3000)
npm run dev

# 3. Kiểm tra kiểu dữ liệu TypeScript
npm run lint

# 4. Chạy bộ kiểm thử tự động (Unit & Contract Tests)
npx tsx --test src/utils/math.test.ts src/utils/pdfReport.test.ts src/services/syncService.test.ts

# 5. Đóng gói bản Production
npm run build
```

> **Quy tắc định dạng Version hệ thống:**
> Mọi bản cập nhật trong `src/version.ts` và tài liệu phải tuân thủ định dạng **`v[yyyymmdd_HHmm]`** theo múi giờ **GMT+7** (ví dụ: `v20261101_2008`). Khi chạy `dev` hoặc `build`, `vite.config.ts` sẽ tự động cập nhật sang `public/version.json` và `public/sw.js`.

---

## 4. Hướng dẫn kết nối Google Sheets (3 bước)

1. **Lấy mã Google Apps Script (`Code.gs`):**
   - Mở ứng dụng **TdyTrip** → vào tab **Cài đặt** → mục **Hệ thống** → bấm **"Sao chép mã Code.gs"**.
2. **Triển khai Web App trên Google Sheets:**
   - Tạo một file Google Sheets mới → chọn **Tiện ích mở rộng (Extensions)** → **Apps Script**.
   - Dán toàn bộ mã vừa sao chép vào `Code.gs` và lưu lại.
   - Bấm **Triển khai (Deploy)** → **Tùy chọn triển khai mới (New deployment)** → Chọn loại **Ứng dụng web (Web app)**:
     - *Thực thi dưới dạng (Execute as):* **Tôi (Me)**
     - *Ai có quyền truy cập (Who has access):* **Bất kỳ ai (Anyone)**
   - Bấm **Triển khai**, cấp quyền truy cập và sao chép đường dẫn **Web App URL** (`https://script.google.com/macros/s/.../exec`).
3. **Kết nối vào ứng dụng:**
   - Quay lại tab **Cài đặt** trong TdyTrip → dán **Web App URL** → bấm **Lưu & Kiểm tra kết nối**.
   - **Mã PIN Quản trị mặc định:** `2026` (dùng khi mở khóa quyền Quản trị lần đầu; có thể đổi mã PIN mới ngay trong tab Cài đặt).
