# Kế hoạch Phát triển Giai đoạn Tiếp theo — TdyTrip (Production-Ready & Zero-Demo Onboarding)

> Tài liệu lưu trữ kế hoạch giai đoạn tiếp theo (Zero-Demo Onboarding, Wizard 2 bước, Đánh dấu đã trả 1 chạm, Copy quyết toán Zalo, Bộ lọc Của tôi & Archive/Reset chuyến đi) để triển khai sau.

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

### Màn hình 1B: Wizard Khởi tạo Chuyến đi Mới 2 Bước (Khi chưa có dữ liệu)

#### Bước 1/2: Thông tin chuyến đi (Hoặc kết nối Sheet có sẵn)

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

### Màn hình 2: Trạng thái trống (Empty State) sau khi tạo chuyến đi (`0 ₫`)

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

### Màn hình 3: Thẻ "Chi tiêu" với Bộ lọc nhanh "Của tôi"

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

### Màn hình 4: Thẻ "Chia tiền" với Nút "Đã trả" 1 chạm & "Copy quyết toán Zalo"

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

### Màn hình 5: Quản lý Vòng đời Chuyến đi trong Thẻ "Cài đặt" (Archive / Reset)

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
