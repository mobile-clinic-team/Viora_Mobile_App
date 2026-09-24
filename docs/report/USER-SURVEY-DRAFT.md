# 3.x Khảo sát người dùng

## 3.x.1 Mục tiêu khảo sát

Khảo sát được thực hiện để tìm hiểu những khó khăn khi sử dụng hoặc theo dõi dịch vụ phòng khám, xác định các chức năng được ưu tiên cho phiên bản đầu tiên của Viora, và đánh giá kỳ vọng đối với xử lý lỗi, phân quyền và hỗ trợ tóm tắt bằng AI. Khảo sát nhằm hỗ trợ phân tích yêu cầu sản phẩm, không nhằm xác nhận hiệu quả lâm sàng.

## 3.x.2 Phương pháp khảo sát

Khảo sát được thực hiện bằng Google Forms theo phương pháp **lấy mẫu thuận tiện (convenience sampling)**. Người tham gia được thông báo thời gian trả lời dự kiến khoảng 3–5 phút và việc tham gia là tự nguyện. Biểu mẫu không yêu cầu họ tên, số điện thoại, bệnh án hoặc thông tin sức khỏe cá nhân; không có dữ liệu PHI được thu thập.

Đây là khảo sát khám phá. Kết quả không được xem là đại diện thống kê cho toàn bộ người dùng phòng khám và không phải là xác nhận lâm sàng.

## 3.x.3 Đặc điểm mẫu khảo sát

Có **61 phản hồi hợp lệ**. Ảnh chụp hồ sơ người trả lời cho thấy mẫu có nhiều nhóm bối cảnh, gồm sinh viên, người đã sử dụng dịch vụ phòng khám, nhân viên hành chính/lễ tân, điều dưỡng/y tá, bác sĩ/sinh viên y tế và người làm trong lĩnh vực công nghệ. Do biểu đồ lưu trong repository không hiển thị đầy đủ số lượng của mọi nhóm, báo cáo này không suy diễn thêm tỷ lệ nhân khẩu học.

Ảnh Q1 hiển thị 60 câu trả lời cho riêng câu hỏi đồng ý tham gia, trong khi phần tổng hợp biểu mẫu và các biểu đồ phân tích chính hiển thị 61. Vì vậy, 61 là số mẫu được sử dụng thống nhất trong phân tích.

## 3.x.4 Kết quả khảo sát

### Khó khăn trong quy trình phòng khám

Theo Q4, **31/61 người (50,8%)** gặp khó khăn theo dõi lịch hẹn/lịch khám và **31/61 người (50,8%)** quan tâm đến thời gian chờ. **23/61 người (37,7%)** gặp khó khăn khi tra cứu thông tin đã cung cấp trước đó; **20/61 người (32,8%)** khó biết trạng thái hiện tại của quy trình.

### Vấn đề ưu tiên và chức năng MVP

Theo Q7, tra cứu bệnh nhân nhanh và quản lý lịch hẹn cùng đạt **16/61 người (26,2%)**. Truy cập lịch sử/hồ sơ khi được phép và giảm thao tác nhập liệu lặp lại cùng đạt **7/61 người (11,5%)**.

Theo Q11, các chức năng được chọn nhiều nhất là tìm kiếm bệnh nhân **28/61 (45,9%)**, xem hồ sơ khám **26/61 (42,6%)**, xem bác sĩ và lịch làm việc **24/61 (39,3%)**, đăng nhập và phân quyền **23/61 (37,7%)**, xem thông tin bệnh nhân **23/61 (37,7%)**, và quản lý lịch hẹn **21/61 (34,4%)**. Hỗ trợ AI tóm tắt/soạn bản nháp đạt **13/61 (21,3%)**.

### Xử lý lỗi và thử lại

Theo Q14, **40/61 người (65,6%)** muốn hiển thị thông báo lỗi kèm nút thử lại, còn **17/61 người (27,9%)** muốn tự động thử lại nhưng vẫn được thông báo. Tổng cộng **57/61 người (93,4%)** chọn một hình thức có cơ chế thử lại.

### AI và phân quyền

Theo Q15, **53/61 người (86,9%)** đánh giá tính hữu ích của tóm tắt AI ở mức 4 hoặc 5 trên 5; điểm trung bình xấp xỉ **4,48/5**. Tuy nhiên, Q11 cho thấy AI không phải chức năng được ưu tiên cao nhất cho phiên bản đầu tiên.

Theo Q17, các mối lo chính là AI thiếu ngữ cảnh với **28/61 người (45,9%)** và cung cấp thông tin sai với **27/61 người (44,3%)**. Theo Q18, **60/61 người (98,4%)** đánh giá tầm quan trọng của việc chỉ cho phép đúng vai trò/quyền hạn truy cập thông tin ở mức 4 hoặc 5; điểm trung bình xấp xỉ **4,77/5**.

## 3.x.5 Ảnh hưởng của kết quả khảo sát đến yêu cầu hệ thống

Kết quả củng cố việc ưu tiên một luồng thực có xác thực, phân quyền phía máy chủ, cơ sở dữ liệu bền vững và CRUD cho bệnh nhân, lịch hẹn và hồ sơ lâm sàng. Các yêu cầu FR-005–FR-013 được gắn với Q4, Q7 và Q11; FR-018–FR-019 được gắn với Q14; FR-014–FR-016 được gắn với Q15 và Q17; FR-003, FR-004 và FR-017 được gắn với Q18.

Về sản phẩm, Viora nên hoàn thiện luồng tra cứu bệnh nhân → lịch hẹn/lịch làm việc → hồ sơ được cấp quyền trước khi mở rộng sang các module bệnh viện. AI nên được triển khai cho một ca sử dụng tóm tắt có giá trị, thông qua backend, có đánh giá, nguồn gốc, giới hạn, và con người xem xét trước khi chấp nhận bản nháp. Phản hồi Q14 yêu cầu giao diện phân biệt lỗi, dữ liệu rỗng và kết quả chưa xác định, đồng thời hỗ trợ thử lại an toàn.

## 3.x.6 Hạn chế của khảo sát

- Đây là mẫu thuận tiện và có thể chịu ảnh hưởng của sai lệch tuyển chọn.
- Mẫu có nhiều bối cảnh khác nhau; không được khẳng định là đại diện cho nhân viên y tế hoặc người dùng phòng khám nói chung.
- Khảo sát không phải là xác nhận lâm sàng, không có xác nhận của bác sĩ, đối tác phòng khám hoặc kết luận về hiệu quả y tế.
- Các tỷ lệ chỉ mô tả 61 phản hồi này và không dùng để suy luận cho toàn bộ dân số.
- Q19 có 21 phản hồi dạng văn bản trong Google Forms, nhưng repository chỉ có biểu đồ tổng hợp và chưa có nội dung thô. Phân tích định tính Q19 đang **PENDING RAW RESPONSES**.
- Khảo sát đo nhận thức và ưu tiên tự báo cáo, không đo trực tiếp hiệu suất quy trình, mức độ an toàn hoặc hiệu quả bảo mật.
