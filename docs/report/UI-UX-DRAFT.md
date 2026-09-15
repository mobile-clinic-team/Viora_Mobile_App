# 3.x Thiết kế UI/UX

## 3.x.1 Mục tiêu trải nghiệm

Viora hướng đến trải nghiệm di động ngắn gọn, dễ quét và an toàn cho các luồng tra cứu bệnh nhân, lịch làm việc, lịch hẹn, hồ sơ được cấp quyền và hỗ trợ AI có người xem xét. Mỗi màn hình cần cho người dùng biết mình đang ở workspace nào, dữ liệu đang tải hay không, thao tác tiếp theo là gì, và khi nào cần thử lại hoặc xem lại.

## 3.x.2 Cách tiếp cận thiết kế

Ứng dụng hiện sử dụng Jetpack Compose và Material 3. Thiết kế giữ lại bảng màu xanh lam/xanh teal, các thẻ bo góc, trường nhập dạng outlined, thanh điều hướng bốn tab và các thành phần dùng chung trong `core/ui`. Bản đặc tả Figma đề xuất frame di động 360 × 800dp làm chuẩn và 412 × 915dp để kiểm tra màn hình rộng hơn.

Hệ thống thiết kế dùng các token hiện có trong `Theme.kt`: màu chính `#246E91`, nền `#F7FAFB`, màu chữ chính `#203D4D`, bán kính 12/16/20dp và khoảng cách màn hình 16/24dp. Trạng thái phải có chữ và hành động rõ ràng; màu chỉ là thông tin bổ sung.

## 3.x.3 Liên hệ với kết quả khảo sát

Khảo sát có 61 phản hồi được ghi nhận trong các biểu đồ chính và 60 phản hồi đồng ý tham gia được hiển thị rõ ở câu hỏi Q1. Mẫu là **lấy mẫu thuận tiện**, không đại diện thống kê và không phải xác nhận lâm sàng.

Các kết quả chính ảnh hưởng đến UI/UX gồm:

- 31/61 người (50,8%) gặp khó khăn theo dõi lịch hẹn/lịch khám.
- 28/61 người (45,9%) chọn tìm kiếm bệnh nhân là chức năng ưu tiên hàng đầu trong Q11.
- 26/61 người (42,6%) chọn xem hồ sơ khám.
- 57/61 người (93,4%) muốn có một cơ chế thử lại khi không tải được dữ liệu.
- 60/61 người (98,4%) đánh giá kiểm soát theo vai trò/quyền hạn ở mức 4 hoặc 5.
- 53/61 người (86,9%) đánh giá tóm tắt AI ở mức 4 hoặc 5, nhưng 28/61 (45,9%) lo AI thiếu ngữ cảnh và 27/61 (44,3%) lo thông tin sai.

Vì vậy, MVP ưu tiên tìm kiếm bệnh nhân, hồ sơ, lịch hẹn, trạng thái lỗi có thể phục hồi và phân quyền. AI được giữ ở một use case có giá trị, có nguồn gốc, đánh giá và người xem xét.

## 3.x.4 Luồng chính

Prototype dự kiến đi qua: Đăng nhập → Chọn workspace → Dashboard → Patients → Patient Detail → Appointments → Appointment Detail → Clinical Record → AI Assistant → Human Review. Hiện tại các luồng này chủ yếu là synthetic/local; luồng clinical mutation và AI provider thật chưa được triển khai.

## 3.x.5 Thiết kế trạng thái

Các trạng thái Loading, Empty, Error/Retry, Permission Denied, Conflict, Success và Outcome Unknown được mô tả trong `UI-STATE-MATRIX.md`. Trạng thái lỗi phải phân biệt với dữ liệu rỗng. Thao tác ghi không được tự động gửi lại sau timeout; người dùng phải kiểm tra kết quả hoặc xem lại.

## 3.x.6 Khả năng tiếp cận

Đánh giá tĩnh đã xác nhận nhãn cho các nút biểu tượng chính, semantics cho một số trạng thái loading/error, trường nhập có mô tả và nhiều target tối thiểu 48dp. Kiểm tra TalkBack, cỡ chữ lớn, bàn phím, orientation và contrast trên thiết bị vẫn **PENDING DEVICE CHECK**. Chưa có tuyên bố về tỷ lệ tương phản.

## 3.x.7 Bằng chứng Figma và prototype

Figma file và click-through prototype chưa tồn tại trong repository; trạng thái là **PENDING FIGMA**. Bộ frame, component và luồng tương tác được đặc tả trong `FIGMA-SPEC.md`, `FIGMA-COMPONENTS.md` và `FIGMA-PROTOTYPE-FLOW.md`.

## 3.x.8 Mapping với Android

Mỗi frame được liên kết tới route typed và Compose file trong `FIGMA-ANDROID-MAPPING.md`. Mapping này phân biệt màn hình hiện tại, màn hình partial/synthetic và frame target. Screenshot Android, so sánh Figma–Android và success/error evidence cần được bổ sung từ cùng revision trước khi nộp báo cáo.
