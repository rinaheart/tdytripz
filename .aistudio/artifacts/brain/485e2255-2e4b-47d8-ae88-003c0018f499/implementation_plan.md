# Kế hoạch Phát triển Giai đoạn Tiếp theo — TdyTrip (Production-Ready & Zero-Demo Onboarding)

## 1. Tóm tắt định hướng đã thống nhất

Sau khi hoàn thiện MVP với đầy đủ luồng ghi chép, chia tiền, phân quyền Admin PIN và đồng bộ Google Sheets 2 chiều, **TdyTrip** chuyển sang giai đoạn **Production-Ready (Sử dụng thực tế)**:
1. **Loại bỏ hoàn toàn dữ liệu Demo mặc định**: Khi mở ứng dụng lần đầu, không còn danh sách 5 thành viên mẫu hay 6 khoản chi mẫu dễ gây nhầm lẫn với dữ liệu thật. Giữ lại bộ **6 danh mục chi tiêu chuẩn** (`Ăn uống`, `Di chuyển tại chỗ`, `Khách sạn / Lưu trú`, `Vé tham quan`, `Vé đi/về`, `Khác`).
2. **Luồng màn hình đầu tiên (First-Run / Zero-State)**:
   - **Trường hợp 1 (Có sẵn liên kết Google Sheet qua URL `?gas=...` hoặc cấu hình mặc định)**: Tự động kéo dữ liệu chuyến đi từ Sheet; nếu Sheet đã có chuyến đi và thành viên thì vào thẳng màn hình chính (chỉ hỏi *"Bạn là ai trong chuyến đi?"*).
   - **Trường hợp 2 (Chưa có dữ liệu trên máy & Sheet trống/chưa kết nối)**: Hiển thị **Wizard khởi tạo nhanh 2 bước** (Bước 1: Thông tin chuyến đi hoặc Dán link Sheet có sẵn → Bước 2: Thêm thành viên & Chọn "Bạn là ai").
3. **Mô hình quản lý vòng đời chuyến đi**: Tập trung tối đa vào **1 chuyến đi đang hoạt động (Active Trip)** để giữ giao diện tốc độ, tinh gọn. Khi kết thúc chuyến đi, hỗ trợ **Lưu trữ (Xuất bản sao lưu JSON / Copy tổng kết) & Đặt lại chuyến đi mới (Archive / Reset Trip)** ngay trong thẻ Cài đặt.
4. **Ba tính năng nâng cao ưu tiên (từ nghiên cứu các ứng dụng dẫn đầu)**:
   - **Đánh dấu đã trả nợ 1 chạm (1-Tap Mark as Paid)** tại thẻ `Chia tiền`.
   - **Copy nhanh bản tóm tắt quyết toán (Zalo / Messenger Format)** tại thẻ `Chia tiền`.
   - **Bộ lọc nhanh "Của tôi" (My Expenses)** tại thẻ `Chi tiêu`.

---

## 2. Nghiên cứu đối sánh các ứng dụng chia tiền nhóm phổ biến nhất

Để tối ưu hóa trải nghiệm của **TdyTrip** cho nhóm du lịch bạn bè/gia đình/đồng nghiệp tại Việt Nam, dưới đây là phân tích các điểm mạnh cốt lõi từ 3 ứng dụng chia tiền nhóm hàng đầu thế giới và cách chọn lọc đưa vào TdyTrip:

| Tiêu chí | **Tricount** (by bunq) | **Spliit.app** (Open-source) | **Splitwise** | **Chiến lược áp dụng cho TdyTrip** |
| :--- | :--- | :--- | :--- | :--- |
| **Triết lý cốt lõi** | Tập trung theo từng chuyến đi, không bắt tạo tài khoản. | Web-first, chia sẻ bằng link, tối giản, tốc độ cao. | Mạng xã hội sổ nợ dài hạn nhiều nhóm, bắt buộc đăng nhập. | **Web-first + Google Sheets Sync**: Mở link là dùng ngay, không cần tạo tài khoản, minh bạch dữ liệu trên Sheet của nhóm. |
| **Màn hình đầu tiên (Onboarding)** | Wizard cực gọn: Nhập tên chuyến đi → Nhập danh sách tên người tham gia → Chọn "Bạn là ai?". | Tạo nhóm trong 15 giây, chọn tiền tệ, thêm tên thành viên. | Phải đăng ký email, xác thực, kết bạn rồi mới tạo nhóm (nặng nề). | **2-Step Setup Wizard + Auto Sheet Sync**: Tạo mới trong 20 giây hoặc tự nạp từ Google Sheet chỉ bằng 1 chạm. |
| **Trạng thái trống (Empty State)** | Hiển thị chuyến đi `0 ₫` kèm nút lớn mời ghi khoản chi đầu tiên. | Giao diện sạch, hướng dẫn chia sẻ link nhóm cho bạn bè. | Nhiều banner quảng cáo Pro và gợi ý phức tạp. | **Zero-State Card gọn gàng**: Nút nổi bật `+ Thêm khoản chi đầu tiên` và nút `Chia sẻ cho nhóm` ngay khi vừa tạo xong chuyến đi. |
| **Quyết toán & Thanh toán nợ** | Gợi ý tối giản số lần chuyển khoản + nút *"Mark as paid"* tạo ngay giao dịch chuyển trả. | Danh sách gợi ý chuyển khoản kèm nút đánh dấu hoàn tất 1 chạm. | Có nút *"Settle up"* nhưng nhiều bước xác nhận. | **1-Tap "Đã trả"**: Bấm nút `Đã trả` trên dòng gợi ý chuyển tiền (`A → B`) sẽ tự động tạo bản ghi `Chuyển trả` để khấu trừ công nợ tức thì. |
| **Chia sẻ kết quả quyết toán** | Xuất PDF/Link ứng dụng. | Chia sẻ URL nhóm. | Gửi email nhắc nợ. | **Copy văn bản chuẩn Zalo/Messenger**: Một chạm copy bảng tổng chi, ai chuyển cho ai bao nhiêu tiền với bố cục rõ ràng để dán thẳng vào nhóm chat Zalo. |
| **Tra cứu khoản chi cá nhân** | Lọc theo người trả hoặc người tham gia. | Tìm kiếm & lọc nhanh theo thành viên. | Xem theo từng người bạn. | **Chip lọc nhanh "Của tôi"**: Bấm 1 chạm tại thẻ `Chi tiêu` để lọc ngay mọi khoản mình đã ứng trả hoặc có tham gia chia tiền. |

---

## 3. Kiến trúc Luồng Khởi tạo & Vòng đời Dữ liệu (System Flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       NGƯỜI DÙNG MỞ WEB APP TDYTRIP                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │ Có dữ liệu chuyến đi hợp lệ   │
                     │ trong LocalStorage?           │
                     └───────┬───────────────┬───────┘
                         CÓ  │               │ KHÔNG (Lần đầu / Sau khi Reset)
                             ▼               ▼
             ┌───────────────────┐   ┌────────────────────────────────────┐
             │ Đã chọn "Bạn là   │   │ Có URL Google Sheet (?gas=...      │
             │ ai" (CurrentUser)?│   │ hoặc cấu hình sẵn)?                │
             └───┬───────────┬───┘   └───────┬────────────────────┬───────┘
             CÓ  │           │ KHÔNG     CÓ  │                    │ KHÔNG
                 ▼           ▼               ▼                    ▼
     ┌───────────────┐ ┌───────────┐ ┌────────────────────┐ ┌─────────────┐
     │ MÀN HÌNH CHÍNH│ │ Modal     │ │ Tự động tải dữ liệu│ │ HIỂN THỊ    │
     │ (4 Thẻ: Tổng  │ │ Chọn      │ │ từ Google Sheet    │ │ WIZARD      │
     │ quan, Chi tiêu│ │ "Bạn là   │ └───────┬────────────┘ │ KHỞI TẠO    │
     │ Chia tiền,    │ │ ai?"      │         │              │ 2 BƯỚC      │
     │ Cài đặt)      │ └─────┬─────┘         ▼              └──────┬──────┘
     └───────────────┘       │       ┌────────────────────┐        │
             ▲               │       │ Sheet đã có        │        │
             │               │       │ Thành viên?        │        │
             │               │       └───┬────────────┬───┘        │
             │               │       CÓ  │            │ KHÔNG      │
             └───────────────┴───────────┘            └────────────┘
```

---

## 4. Thiết kế Wireframe ASCII Chi tiết (Mobile-First 375px–430px)

### Màn hình 1A: Tự động kiểm tra & tải dữ liệu từ Google Sheet (Khi mở link nhóm)
Khi thành viên trong nhóm mở link web app có gắn sẵn Google Sheet (hoặc lần đầu mở app có kết nối Sheet), hệ thống hiển thị màn hình nạp dữ liệu cực gọn thay vì hiện dữ liệu ảo:

```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│              ┌────────┐              │
│              │  Logo  │              │
│              └────────┘              │
│               TdyTrip                │
│     Quản lý & chia tiền chuyến đi    │
│                                      │
│   ┌──────────────────────────────┐   │
│   │      ⟳ Đang đồng bộ...       │   │
│   │  Đang tải dữ liệu chuyến đi  │   │
│   │     từ Google Sheets...      │   │
│   └──────────────────────────────┘   │
│                                      │
│     [ Bỏ qua & Tạo chuyến mới ]      │
│                                      │
└──────────────────────────────────────┘
```

---

### Màn hình 1B: Wizard Khởi tạo Chuyến đi Mới 2 Bước (Khi chưa có dữ liệu)

#### Bước 1/2: Thông tin chuyến đi (Hoặc kết nối Sheet có sẵn)
Thiết kế tối giản trong 1 màn hình điện thoại không cần cuộn dài, tập trung vào Tên chuyến đi và Ngày đi/về:

```
┌──────────────────────────────────────┐
│ [Logo] TdyTrip            Bước 1 / 2 │
│ ████████████████░░░░░░░░░░░░░░░░░░░░ │
├──────────────────────────────────────┤
│ Bắt đầu chuyến đi mới                │
│ Nhập thông tin cơ bản để tạo sổ chi  │
│ tiêu chung cho cả nhóm.              │
│                                      │
│ TÊN CHUYẾN ĐI *                      │
│ ┌──────────────────────────────────┐ │
│ │ VD: Đà Lạt 3N2Đ, Phú Quốc 2026...│ │
│ └──────────────────────────────────┘ │
│                                      │
│ ĐỊA ĐIỂM (TÙY CHỌN)                  │
│ ┌──────────────────────────────────┐ │
│ │ VD: Đà Lạt, Lâm Đồng             │ │
│ └──────────────────────────────────┘ │
│                                      │
│ NGÀY BẮT ĐẦU        NGÀY KẾT THÚC    │
│ ┌─────────────────┐ ┌──────────────┐ │
│ │ 25/10/2026   📅 │ │ 27/10/2026 📅│ │
│ └─────────────────┘ └──────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │       Tiếp tục: Thành viên >     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ─────────── HOẶC ĐÃ CÓ SỔ ────────── │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ☁ Kết nối Google Sheet có sẵn    │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

#### Bước 2/2: Thêm thành viên & Chọn "Bạn là ai?"
Hỗ trợ nhập nhanh từng người (bấm `Enter` hoặc nút `+` để thêm liên tiếp) và chọn ngay bản thân trong danh sách để vào thẳng ứng dụng mà không cần hỏi lại qua popup thứ 2:

```
┌──────────────────────────────────────┐
│ < Quay lại                Bước 2 / 2 │
│ ████████████████████████████████████ │
├──────────────────────────────────────┤
│ Thành viên tham gia                  │
│ Thêm tên các thành viên trong nhóm   │
│ để chia tiền nhanh chóng.            │
│                                      │
│ THÊM THÀNH VIÊN (Đã thêm: 4)         │
│ ┌───────────────────────────┐ ┌────┐ │
│ │ Nhập tên (VD: Minh)...    │ │Thêm│ │
│ └───────────────────────────┘ └────┘ │
│                                      │
│ DANH SÁCH & CHỌN "BẠN LÀ AI?"        │
│ (Chạm vào tên của bạn để đánh dấu)   │
│ ┌──────────────────────────────────┐ │
│ │ ◉ [D] Dương          [Là tôi ✓] │ │
│ ├──────────────────────────────────┤ │
│ │ ○ [H] Hùng                   [×] │ │
│ ├──────────────────────────────────┤ │
│ │ ○ [L] Lan                    [×] │ │
│ ├──────────────────────────────────┤ │
│ │ ○ [M] Minh                   [×] │ │
│ └──────────────────────────────────┘ │
│                                      │
│ MÃ PIN ADMIN (4 SỐ - TÙY CHỌN)       │
│ ┌──────────────────────────────────┐ │
│ │ 1111 (Mặc định: 1111)            │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │    Hoàn tất & Vào chuyến đi >    │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

### Màn hình 2: Trạng thái trống (Empty State) sau khi tạo chuyến đi (`0 ₫`)
Khi vừa hoàn tất Wizard (chưa có khoản chi nào), thẻ **Tổng quan** hiển thị thông tin chuyến đi thật của nhóm cùng hướng dẫn bắt đầu trực quan:

```
┌──────────────────────────────────────┐
│ [Logo] Đà Lạt 3N2Đ           🔄  [D] │
│        25–27/10 · 4 người · ● Đã lưu │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ TỔNG CHI · 0 KHOẢN   Đà Lạt      │ │
│ │ 0 ₫                              │ │
│ │ Chưa có khoản chi tiêu nào       │ │
│ │ ──────────────────────────────── │ │
│ │ Bình quân/người  │ Thành viên    │ │
│ │ 0                │ 04 người      │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │        Chuyến đi đã sẵn sàng!    │ │
│ │   Hãy ghi lại khoản chi đầu tiên │ │
│ │   (vé xe, cọc phòng, ăn uống...) │ │
│ │                                  │ │
│ │  ┌────────────────────────────┐  │ │
│ │  │  + Thêm khoản chi đầu tiên │  │ │
│ │  └────────────────────────────┘  │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│  Tổng quan  Chi tiêu  [+]  Chia tiền │
└──────────────────────────────────────┘
```

---

### Màn hình 3: Thẻ "Chi tiêu" với Bộ lọc nhanh "Của tôi"
Bổ sung thanh **Quick Filter Chips** ngay dưới ô tìm kiếm tại thẻ `Chi tiêu` để người dùng chuyển nhanh giữa `Tất cả`, `Của tôi (Đã chi / Tham gia)` và lọc theo Danh mục mà không cần mở nhiều lớp menu:

```
┌──────────────────────────────────────┐
│ [Logo] Đà Lạt 3N2Đ           🔄  [D] │
├──────────────────────────────────────┤
│ ┌─────────────────────────┐ ┌──────┐ │
│ │ 🔍 Tìm khoản chi...     │ │ Lọc  │ │
│ └─────────────────────────┘ └──────┘ │
│                                      │
│ [ Tất cả (12) ] [★ Của tôi (5)]      │
│ [ Tôi ứng trả (3) ] [ Chuyển trả ]   │
│                                      │
│ Chủ Nhật, 25/10/2026     1.450.000 ₫ │
│ ┌──────────────────────────────────┐ │
│ │ 🍜 Ăn trưa lẩu gà lá é   650.000 │ │
│ │    Dương trả · Chia 4 người      │ │
│ ├──────────────────────────────────┤ │
│ │ 🚕 Grab từ sân bay       300.000 │ │
│ │    Dương trả · Chia 4 người      │ │
│ ├──────────────────────────────────┤ │
│ │ ☕ Cà phê Tùng           500.000 │ │
│ │    Hùng trả · Có bạn tham gia    │ │
│ └──────────────────────────────────┘ │
├──────────────────────────────────────┤
│  Tổng quan  Chi tiêu  [+]  Chia tiền │
└──────────────────────────────────────┘
```

---

### Màn hình 4: Thẻ "Chia tiền" với Nút "Đã trả" 1 chạm & "Copy quyết toán Zalo"
Tối ưu hóa khâu cuối cùng của chuyến đi:
1. **Nút `Copy gửi nhóm`**: Tạo ngay văn bản quyết toán định dạng rõ ràng (Tổng chi, Bình quân, Danh sách ai cần chuyển cho ai bao nhiêu tiền) để dán vào Zalo/Messenger.
2. **Nút `Đã trả` trên từng dòng chuyển tiền**: Khi bấm `Đã trả` ở dòng `Hùng → Dương: 450.000`, hệ thống hiện xác nhận nhanh (1 chạm) và tự động tạo giao dịch `Chuyển trả` (`transfer`) từ Hùng sang Dương đúng bằng số tiền đó, cập nhật bảng cân đối về `0` ngay lập tức.

```
┌──────────────────────────────────────┐
│ [Logo] Đà Lạt 3N2Đ           🔄  [D] │
├──────────────────────────────────────┤
│ GỢI Ý CHUYỂN KHOẢN (2)  [📋 Copy Zalo]│
│ ┌──────────────────────────────────┐ │
│ │ [H] Hùng → [D] Dương             │ │
│ │     450.000 ₫          [✓ Đã trả]│ │
│ ├──────────────────────────────────┤ │
│ │ [L] Lan  → [D] Dương             │ │
│ │     220.000 ₫          [✓ Đã trả]│ │
│ └──────────────────────────────────┘ │
│                                      │
│ BẢNG CÂN ĐỐI CHI TIẾT         ĐV: ₫  │
│ ┌──────────────────────────────────┐ │
│ │ THÀNH VIÊN  ĐÃ CHI  CHỊU  CÂN ĐỐI│ │
│ ├──────────────────────────────────┤ │
│ │ [D] Dương   1,2tr  530k  +670.000│ │
│ │ [H] Hùng      80k  530k  -450.000│ │
│ │ [L] Lan      310k  530k  -220.000│ │
│ │ [M] Minh     530k  530k         0│ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Mẫu văn bản khi bấm `[📋 Copy Zalo]`:**
```text
📊 QUYẾT TOÁN CHUYẾN ĐI: ĐÀ LẠT 3N2Đ
📍 Địa điểm: Đà Lạt (25/10 - 27/10/2026)
💰 Tổng chi tiêu: 2.120.000 ₫ (4 thành viên)
👤 Bình quân: ~530.000 ₫/người

💸 GỢI Ý CHUYỂN KHOẢN:
• Hùng → Dương: 450.000 ₫
• Lan → Dương: 220.000 ₫

✅ Minh: Đã cân bằng (0 ₫)
```

---

### Màn hình 5: Quản lý Vòng đời Chuyến đi trong Thẻ "Cài đặt" (Archive / Reset)
Khi kết thúc chuyến đi và muốn dùng TdyTrip cho chuyến tiếp theo:
- Cung cấp mục **"Kết thúc & Tạo chuyến đi mới"** trong thẻ `Cài đặt` (yêu cầu mở khóa Admin PIN).
- Cho phép **Tải file sao lưu `.json` của chuyến đi hiện tại** về máy trước khi làm trống danh sách chi tiêu để bắt đầu chuyến đi mới.

```
┌──────────────────────────────────────┐
│ QUẢN LÝ DỮ LIỆU CHUYẾN ĐI            │
│ ┌──────────────────────────────────┐ │
│ │ 📥 Xuất file sao lưu (.json)     │ │
│ │ 📤 Khôi phục từ file sao lưu     │ │
│ ├──────────────────────────────────┤ │
│ │ 🔄 Kết thúc & Tạo chuyến đi mới  │ │
│ │    (Lưu trữ & mở lại Wizard)     │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

---

## 5. Lộ trình Triển khai Kỹ thuật (Implementation Steps)

1. **Làm sạch dữ liệu mặc định & Chuẩn hóa trạng thái khởi tạo**:
   - Xóa bỏ danh sách thành viên mẫu và khoản chi mẫu; chỉ giữ lại 6 danh mục chi tiêu mặc định.
   - Bổ sung cờ nhận diện trạng thái chuyến đi đã khởi tạo hay chưa (dựa trên sự tồn tại của thành viên/tên chuyến đi trong dữ liệu lưu trữ hoặc từ Google Sheet).
2. **Xây dựng Luồng First-Run Onboarding (Auto Sheet Sync + 2-Step Wizard)**:
   - Nếu phát hiện URL Google Sheet hợp lệ khi mở lần đầu, tự động đồng bộ dữ liệu về trước; nếu Sheet có sẵn chuyến đi thì vào thẳng ứng dụng.
   - Nếu chưa có dữ liệu, hiển thị **Wizard 2 bước** (Bước 1: Tên chuyến đi, Địa điểm, Ngày đi/về hoặc Kết nối Sheet có sẵn; Bước 2: Thêm thành viên + Chọn "Bạn là ai?" + Mã PIN Admin).
   - Thiết kế Empty State cho thẻ `Tổng quan` và `Chi tiêu` khi chuyến đi mới tạo (`0 khoản chi`).
3. **Nâng cấp Thẻ "Chi tiêu" với Bộ lọc nhanh "Của tôi"**:
   - Thêm hàng nút lọc nhanh (`Tất cả`, `Của tôi`, `Tôi ứng trả`, `Chuyển trả`) giúp thành viên kiểm tra tức thì các khoản liên quan đến mình.
4. **Nâng cấp Thẻ "Chia tiền" với "Đã trả 1 chạm" & "Copy quyết toán Zalo/Messenger"**:
   - Nút `Đã trả` trên từng gợi ý chuyển khoản kèm hộp thoại xác nhận gọn để tự động ghi nhận giao dịch chuyển tiền (`type: 'transfer'`).
   - Nút `Copy gửi nhóm` định dạng sẵn bản tin tổng kết quyết toán kèm phản hồi `Đã sao chép!`.
5. **Bổ sung tính năng "Kết thúc & Tạo chuyến đi mới" (Archive / Reset)**:
   - Cho phép Admin xuất bản sao lưu chuyến đi cũ và khởi tạo lại Wizard cho chuyến đi tiếp theo.
6. **Cập nhật Version & Kiểm thử toàn diện**:
   - Cập nhật chỉ số phiên bản `v[yyyymmdd-HHmm]` và kiểm tra biên dịch, hiển thị responsive trên khung nhìn di động.
