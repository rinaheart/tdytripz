# Chia Tiền Nhóm — Hà Nội 3N2Đ (Mobile-First MVP)

Ứng dụng web (SPA / Mobile-First) quản lý chi tiêu và quyết toán chia tiền tinh gọn cho nhóm nhỏ (~5 người) trong các chuyến đi ngắn ngày (~3 ngày 2 đêm). Hỗ trợ hoạt động **Offline-First** và đồng bộ hai chiều với **Google Sheets** qua **Google Apps Script (`Code.gs`)**.

---

## 1. Điểm nổi bật (MVP Tinh gọn & Mobile-First)

- **Thiết kế tối ưu cho nhóm ~5 người, chuyến đi 3N2Đ:**
  - Giao diện 1 cột ưu tiên thao tác một tay trên điện thoại, độ tương phản đạt chuẩn **WCAG AAA** (bảng màu `#000777` Navy, chữ và số tiền `tabular-nums` rõ nét ngoài trời).
  - Chọn nhanh danh tính thành viên (**"Bạn là ai?"**) ngay khi mở app, không bắt buộc đăng nhập phức tạp.
- **Số học nguyên VND tuyệt đối (`100% Integer Math`):**
  - Mọi phép chia đều (`equal`), chia theo hệ số/suất (`shares`), hoặc nhập số chính xác (`exact`) đều tính bằng số nguyên `₫`.
  - Phần dư (`1₫ – 4₫`) được phân bổ deterministically (cố định theo `hash(expenseId + memberId)`), đảm bảo **Tổng các phần chia === Tổng tiền gốc** và **Tổng số dư toàn nhóm === 0 ₫**.
- **Quyết toán tối giản (Không phụ thuộc VietQR):**
  - Tự động rút gọn số lần chuyển khoản giữa các thành viên (chế độ **Tối giản** hoặc **Từng cặp**).
  - Mỗi khoản cần chuyển chỉ gồm **2 nút Copy nguyên bản**:
    1. **STK:** Chỉ copy đúng chuỗi số tài khoản (ví dụ: `0011004567890`), không kèm chữ hay ký tự phụ.
    2. **Số tiền:** Chỉ copy đúng số nguyên viết liền (ví dụ: `2500000`), dán thẳng vào ứng dụng ngân hàng.
- **Đồng bộ hai chiều với Google Sheets (Offline-First & Kiểm soát xung đột `rev`):**
  - Lưu trữ tức thì trên `localStorage` kèm hàng đợi `syncQueue`, tự động gom nhóm (**Batch Upsert**) khi có mạng trở lại.
  - Cơ chế khóa đồng bộ `LockService` + kiểm tra phiên bản `baseRev` chống ghi đè dữ liệu khi nhiều thành viên nhập liệu cùng lúc.

---

## 2. Cấu trúc thư mục

```text
├── src/
│   ├── assets/
│   │   ├── Code.gs               # Mã nguồn Google Apps Script (Backend trên Google Sheet)
│   │   └── gasCode.ts            # Export chuỗi raw Code.gs để copy nhanh trong tab Cài đặt
│   ├── components/
│   │   ├── OverviewTab.tsx       # Tab Tổng quan: Tổng chi, Số dư cá nhân, Theo danh mục & ngày
│   │   ├── ExpensesTab.tsx       # Tab Khoản chi: Tìm kiếm, lọc danh mục/người trả, nhóm theo ngày
│   │   ├── SettlementTab.tsx     # Tab Quyết toán: Danh sách cần chuyển (2 nút Copy STK & Số tiền) + Bảng cân đối
│   │   ├── SettingsTab.tsx       # Tab Cài đặt: Thành viên/STK, Chuyến đi, Hệ thống & Mở khóa Admin PIN
│   │   ├── ExpenseFormModal.tsx  # Form thêm/sửa khoản chi & chuyển trả riêng (kèm gợi ý bội số 000)
│   │   ├── ConflictModal.tsx     # Hộp thoại giải quyết xung đột phiên bản (rev) với Google Sheet
│   │   ├── WhoAmIModal.tsx       # Chọn thành viên đang sử dụng thiết bị
│   │   ├── MemberAvatar.tsx      # Avatar chữ cái đầu đạt chuẩn tương phản WCAG AAA
│   │   └── Navbar.tsx            # Thanh điều hướng cố định dưới đáy màn hình (Mobile Bottom Bar)
│   ├── services/
│   │   └── syncService.ts        # Hàng đợi Offline, Batch Sync, Cache & giao tiếp Google Apps Script
│   ├── utils/
│   │   ├── math.ts               # Thuật toán chia tiền số nguyên VND & tối giản nợ (Greedy Net Balance)
│   │   └── format.ts             # Định dạng tiền tệ, ngày giờ GMT+7, đọc số tiền bằng chữ tiếng Việt
│   ├── config.ts                 # Cấu hình cứng DEFAULT_GAS_URL, danh sách 5 thành viên & dữ liệu mẫu
│   ├── types.ts                  # Định nghĩa TypeScript interfaces
│   └── App.tsx                   # Điều phối trạng thái ứng dụng, đồng bộ tự động & thông báo
```

---

## 3. Hướng dẫn cài đặt & Chạy dự án (Local Development)

1. **Cài đặt dependencies:**
   ```bash
   npm install
   ```
2. **Chạy máy chủ phát triển (Port 3000):**
   ```bash
   npm run dev
   ```
3. **Kiểm tra lỗi TypeScript & Build Production:**
   ```bash
   npm run lint
   npm run build
   ```

---

## 4. Hướng dẫn kết nối Google Sheets & Cập nhật `Code.gs`

### Bước 1: Cấu hình cứng Link GAS cho cả nhóm
Mở file `src/config.ts` và đặt URL Web App của bạn tại hằng số `DEFAULT_GAS_URL`:
```ts
export const DEFAULT_GAS_URL: string =
  metaEnv?.VITE_GAS_URL ||
  'https://script.google.com/macros/s/<DEPLOYMENT_ID_CỦA_BẠN>/exec';
```
Khi `DEFAULT_GAS_URL` đã được cấu hình trong `src/config.ts`:
- Mọi thành viên mở link web app sẽ **tự động kết nối thẳng vào Google Sheet** mà không cần truyền `?gas=...` trên URL mời.
- Ứng dụng tự động khóa bảo vệ, không cho phép tham số `?gas=...` lạ từ bên ngoài tự ý ghi đè kết nối Sheet.

### Bước 2: Cài đặt hoặc nâng cấp `Code.gs` trên Google Sheets
1. Mở file Google Sheets của nhóm → chọn **Tiện ích mở rộng (Extensions)** → **Apps Script**.
2. Trong ứng dụng web, vào tab **Cài đặt** → mục **Hệ thống** → mở khóa **PIN Admin** (mặc định: `1234`) → bấm **Copy Code.gs** (hoặc copy từ file `src/assets/Code.gs`).
3. Dán đè toàn bộ nội dung vào file `Code.gs` trên trình soạn thảo Apps Script và bấm **Lưu (Ctrl+S)**.
4. Bấm **Triển khai (Deploy)** → **Quản lý các bản triển khai (Manage deployments)** → bấm biểu tượng cây bút (Chỉnh sửa) → tại mục **Phiên bản (Version)** chọn **Phiên bản mới (New version)** → bấm **Triển khai (Deploy)**.
   - *Thực thi dưới dạng (Execute as):* **Tôi (Me)**
   - *Ai có quyền truy cập (Who has access):* **Bất kỳ ai (Anyone)**

### Bước 3: Quản lý mã PIN Admin & Phân quyền Cài đặt
- Mã PIN Admin chỉ hiển thị tại mục **Cài đặt → Hệ thống** (mặc định: **`1234`**, lưu trong `ScriptProperties` của Google Apps Script).
- Mọi thao tác cấu hình không dành cho thành viên bình thường — bao gồm **thêm/xóa thành viên**, **thêm/sửa STK thành viên**, **cài đặt chuyến đi & danh mục**, và **cài đặt hệ thống** — đều yêu cầu mở khóa mã PIN Admin trước. Thành viên bình thường chỉ xem danh sách, copy STK, copy link mời và bấm đồng bộ.
- Để đổi mã PIN: Vào **Cài đặt → Hệ thống** → mở khóa PIN hiện tại → bấm **Đổi PIN** → nhập PIN cũ & PIN mới (tối thiểu 4 ký tự) → bấm **Lưu**.
- **Bảo vệ chống dò mã PIN (Brute-Force Lockout):** Nếu nhập sai PIN quá **5 lần liên tiếp**, hệ thống tự động tạm khóa xác thực PIN trong **5 phút**.
