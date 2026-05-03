# Specification: LLM-based Page Category Detection

## Overview
Cải thiện chất lượng dịch thuật ngữ cảnh bằng cách sử dụng LLM để tự động phân loại danh mục trang web (Page Category), hỗ trợ cả 2 cơ chế Async (không độ trễ) và Blocking (đợi kết quả hoàn hảo).

## Functional Requirements
- Thêm tuỳ chọn `enableLLMPageCategoryDetection: boolean` (Mặc định: `false`) để cấp quyền gọi API nền.
- Thêm tuỳ chọn `llmCategoryDetectionMode: 'async' | 'blocking'` (Mặc định: `'async'`).
- Cache tạm kết quả vào `categoryStore` (chỉ theo phiên làm việc của Tab).
- Background script nhận message và gọi hàm LLM (qua Provider) với metadata trang (Title, Desc, H1).
- Nếu mode = `async`: Dịch đoạn văn đầu ngay lập tức bằng Heuristics, update ngầm kết quả LLM cho các đoạn sau (Progressive Upgrade).
- Nếu mode = `blocking`: Chờ LLM phân tích xong mới cho phép bắt đầu dịch.

## Acceptance Criteria
- [ ] Bật toggle "LLM-based Category Detection" sẽ hiện ra dropdown cấu hình Mode.
- [ ] Khi dịch (Async mode): UI không bị đơ/chờ, chunk đầu tiên dịch xong ngay, chunk thứ 2 trở đi trên cùng Tab tự ăn Category mới.
- [ ] Khi dịch (Blocking mode): UI sẽ khựng lại chờ gọi LLM xong, sau đó tất cả các chunk đều có category chuẩn.
- [ ] Khi reload sang trang khác (cùng Tab nhưng khác domain) hoặc đóng tab, cache category bị xóa.

## Out of Scope
- Lưu tự động category do LLM quyết định vào Site Rules vĩnh viễn (để tránh rác cấu hình).
