# AGENT DIRECTIVES & GUIDELINES

## CRITICAL SCOPE RESTRICTION (BẮT BUỘC TUÂN THỦ)

### 1. Phạm vi chỉnh sửa cho phép
- AI **CHỈ DỰỢC PHÉP** chỉnh sửa, nâng cấp giao diện (UI/UX) cho route:
  - **`http://localhost:3060/runtime/hrm`**
  - Và các **route con** của HRM (ví dụ: `/runtime/hrm/*`, `/runtime/hrm/...` nếu có).
- **TUYỆT ĐỐI KHÔNG** được tự ý chỉnh sửa bất kỳ route nào khác trong dự án (như `/admin`, `/runtime/[khác_hrm]`, v.v.).

### 2. Quy trình khi cần sửa đổi ngoài phạm vi
- Nếu có yêu cầu hoặc phát sinh bắt buộc phải chỉnh sửa file/route ngoài phạm vi `/runtime/hrm` (hoặc các route con của nó), AI **MUST ASK FOR CONFIRMATION** (Phải dừng lại và hỏi ý kiến/xác nhận từ người dùng trước khi tiến hành).

### 3. Nguyên tắc chung khi làm việc với UI/UX
- Đảm bảo tính thẩm mỹ, hiện đại, phản hồi linh hoạt (responsive) và trải nghiệm người dùng tối ưu.
- Giữ nguyên các logic API / Data contract hiện có, chỉ tập trung vào trình bày thị giác và tương tác người dùng trừ khi có chỉ định khác.
