# Kế hoạch Thiết kế lại UI Thẻ "Tổng quan", Header & Thanh điều hướng (Mobile-First Minimal Finance)

## 1. Mục tiêu & Nguyên tắc thiết kế
Áp dụng các đề xuất cải tiến UX/UI theo phong cách **Minimal Finance Dashboard** tối ưu cho màn hình điện thoại (mobile-first), đồng thời tuân thủ các lựa chọn của bạn:
- **Giữ nguyên hệ màu và độ bo góc hiện tại**: Màu chủ đạo (`#000777`), nền trung tính (`slate-50` / `white`), độ bo góc thẻ `8px` (`rounded-md`), nút/input `4px` (`rounded-sm`).
- **Giữ nguyên đầy đủ thông tin**: Giữ lại dòng đọc số tiền bằng chữ (thu gọn cỡ chữ vừa phải để không chiếm quá nhiều diện tích dọc) và giữ lại mục thống kê **Theo ngày** bên cạnh mục **Theo danh mục**.
- **Giảm khung lồng khung (cards-within-cards)**: Thay các hộp viền con bằng đường phân cách mảnh (`border-slate-100`, `border-white/15`) và khoảng trắng hợp lý để ưu tiên chiều ngang hiển thị số tiền trên điện thoại.
- **Đơn vị tiền tệ (`₫`)**: Chỉ xuất hiện ở các chỉ số trọng tâm (Tổng chi tại thẻ Hero và Số dư ròng nổi bật tại thẻ Của bạn), các chỉ số phụ dùng số nguyên phân cách hàng nghìn (`tabular-nums`) để gọn gàng.

---

## 2. Chi tiết thay đổi theo từng thành phần

### A. Header (`src/App.tsx`)
- **Gộp thông tin chuyến đi vào một cụm gọn gàng**:
  - Dòng chính: Tên chuyến đi + thời lượng ngắn (ví dụ: `Hà Nội 3N2Đ` hoặc tên chuyến đi kết hợp badge thời lượng tinh gọn).
  - Dòng phụ (`11px–12px`, màu `slate-500`): Hiển thị khoảng ngày và số thành viên ngăn cách bằng dấu chấm giữa (`23–25/10/2026 · 5 thành viên`), kèm chấm/icon trạng thái đồng bộ nhỏ gọn.
- **Tinh giản cụm thao tác góc phải**:
  - Chuyển nút tải lại (đồng bộ) thành nút icon phụ nhẹ nhàng (không viền dày chiếm chỗ).
  - Nút chọn người dùng thu gọn thành **Avatar tròn** hiển thị chữ cái đầu tên (ví dụ: `D`) hoặc kèm tên ngắn gọn để giải phóng không gian ngang trên màn hình 375px–390px.

### B. Thẻ Tổng chi — Hero Card (`src/components/OverviewTab.tsx`)
- **Điểm nhấn màu đậm duy nhất trên màn hình**:
  - Nhãn phụ phía trên: `TỔNG CHI · {N} KHOẢN` (chữ in hoa nhỏ `11px`, `tracking-wider`, màu sáng dịu).
  - Số tiền tổng chi: Cỡ chữ lớn (`30px–34px`, `font-extrabold`, `tabular-nums`) kèm ký hiệu `₫`.
  - Dòng chữ đọc số tiền: Giữ nguyên bên dưới với cỡ chữ nhỏ gọn (`11px–12px`, màu `blue-100/85`), kết hợp hiển thị địa điểm (`Hoàn Kiếm, Hà Nội`) gọn gàng.
- **Hàng thống kê phụ không đóng khung lồng**:
  - Bỏ 2 hộp viền nền mờ (`bg-white/10 border`), thay bằng 1 hàng ngang 2 cột phân tách bởi đường kẻ mảnh (`border-t border-white/15` và `divide-x divide-white/15`):
    - Cột 1: **Bình quân/người** (`~4.113.600`)
    - Cột 2: **Thành viên** (`05 người`)

### C. Thẻ "Số liệu của bạn" (`src/components/OverviewTab.tsx`)
- **Đảo thứ bậc thị giác — Đưa Số dư ròng lên làm tâm điểm**:
  - Header thẻ: Avatar tròn + tiêu đề **Số liệu của bạn** (`Tên thành viên`) và liên kết điều hướng nhanh `Chi tiết →` mở tab **Chia tiền**.
  - **Khối chính (Số dư ròng)**:
    - Hiển thị số tiền lớn (`24px–28px`, `font-extrabold`, `tabular-nums`) với màu ngữ nghĩa rõ ràng: Xanh (`#087F5B` / `emerald-700`) khi dương (`+`), Đỏ (`rose-600`) khi âm (`-`), Xám khi cân bằng.
    - Nhãn trạng thái giải thích rõ ràng ngay bên dưới để tránh hiểu nhầm:
      - Nếu số dư `> 0`: *"Bạn cần nhận lại"*
      - Nếu số dư `< 0`: *"Bạn cần trả thêm"*
      - Nếu số dư `= 0`: *"Đã cân bằng chi tiêu"*
  - **Hàng phụ (2 cột ngang bên dưới đường kẻ mảnh)**:
    - Cột trái: **Đã chi** (số tiền `tabular-nums`, không kèm `₫`).
    - Cột phải: **Phải chịu** (số tiền `tabular-nums`, không kèm `₫`).
    - Nếu có khoản chuyển/nhận trả trước (`netTransfer !== 0`), hiển thị dòng phụ gọn gàng phía dưới.

### D. Thẻ "Chi tiêu theo danh mục" & "Theo ngày" (`src/components/OverviewTab.tsx`)
- **Chi tiêu theo danh mục**:
  - Header thẻ: Tiêu đề `Chi tiêu theo danh mục` + nút chữ `Xem tất cả →` chuyển sang tab **Chi tiêu**.
  - Mỗi danh mục là một hàng dữ liệu sạch sẽ:
    - Hàng trên: Icon nhỏ nhẹ + Tên danh mục (bên trái) và Số tiền `tabular-nums` căn phải.
    - Hàng dưới: Nhãn phụ `{pct}% tổng chi · {count} khoản` kết hợp thanh tiến độ siêu mảnh (`h-1`, `4px`) màu chủ đạo.
- **Chi tiêu theo ngày (Giữ nguyên và đồng bộ phong cách tối giản)**:
  - Thiết kế đồng bộ cùng cấp độ thị giác với bảng danh mục: liệt kê từng ngày (hoặc Trước chuyến đi), số khoản chi, số tiền căn phải (`tabular-nums`) và tỷ lệ `% tổng chi` kèm thanh tiến độ mảnh hoặc đường phân cách nhẹ (`divide-y divide-slate-100`).

### E. Thanh điều hướng dưới — Bottom Navbar (`src/components/Navbar.tsx`)
- **Giảm chiều cao & giảm cạnh tranh thị giác**:
  - Giảm chiều cao thanh điều hướng từ `h-16` (64px) xuống `h-14` (56px) để nhường diện tích cho nội dung chính trên điện thoại.
  - 4 mục điều hướng (`Tổng quan`, `Chi tiêu`, `Chia tiền`, `Cài đặt`) sử dụng icon `18px` và nhãn `10px–11px` tinh gọn, chỉ tô đậm màu chủ đạo cho tab đang chọn.
  - Nút hành động chính `+` ở giữa được cân chỉnh kích thước hài hòa (`w-11 h-9` hoặc `w-10 h-10`, bo góc `4px`/`8px` đồng bộ), giữ vai trò điểm nhấn thao tác thêm khoản chi mà không làm lấn át thanh điều hướng.
