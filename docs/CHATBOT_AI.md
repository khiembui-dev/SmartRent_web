# Trợ lý AI SmartRent (admin và khách)

Ngày 13/11/2026. Chatbot dùng LLM + function calling qua API tương thích OpenAI (ví dụ 9router).
Mô hình chỉ **hiểu câu hỏi, chọn công cụ và diễn đạt kết quả**. Máy chủ quyết định danh tính, quyền,
dữ liệu và kiểm tra lại câu trả lời. Trợ lý **chỉ đọc**.

## Luồng một câu hỏi

```
Trình duyệt ──POST /api/v1/(portal/)ai/conversations/{id}/messages──► ChatConversationApi
   │ token Bearer (phiên auth_tokens)                                     │ 1. xác thực token với DB, role phải đúng khu
   │                                                                      │ 2. giới hạn tần suất, khóa hội thoại
   ▼                                                                      ▼
widget chỉ hiển thị                                   ChatOrchestrator ──► LLM (chỉ thấy công cụ của đúng khu)
                                                           │ mô hình đề xuất tool_call
                                                           ▼
                                   mỗi lời gọi: xác thực lại token → kiểm tra tên công cụ theo khu
                                   → kiểm tra tham số (schema chặt, cấm trường lạ, bỏ ID/từ khóa mô hình tự bịa)
                                   → gọi chính controller hiện có
                                   (ExistingApi, cùng SQL/view số dư/kiểm tra quyền như website)
                                                           │
                                   câu trả lời cuối: ẩn khóa → chặn lộ chỉ dẫn → đối chiếu số tiền/ngày
                                   với kết quả công cụ (sai thì bắt sửa một lần, vẫn sai thì không hiển thị số)
```

## File

| File | Vai trò |
|---|---|
| `backend/src/SmartRent.Api/Features/Chatbot/AiConversationsController.cs` | `api/v1/ai/conversations` (admin), `api/v1/portal/ai/conversations` (khách), `ChatConversationApi` |
| `.../Chatbot/ChatOrchestrator.cs` | Vòng gọi LLM, xác thực lại từng lần gọi công cụ, giới hạn, đối chiếu câu trả lời |
| `.../Chatbot/CustomerChatTools.cs`, `AdminChatTools.cs` | Công cụ của từng khu, mỗi công cụ gọi một API hiện có |
| `.../Chatbot/ExistingApi.cs` | Gọi action controller hiện có trong cùng process bằng phiên của người hỏi |
| `.../Chatbot/ToolSchema.cs` | Một khai báo vừa sinh JSON Schema cho mô hình vừa kiểm tra tham số phía máy chủ |
| `.../Chatbot/AnswerGuard.cs` | Đối chiếu số/ngày, phát hiện lộ chỉ dẫn, ẩn khóa, gắn cờ prompt injection |
| `.../Chatbot/ChatPrompts.cs` | Chỉ dẫn hệ thống tiếng Việt |
| `.../Chatbot/ChatConversationStore.cs` | Lịch sử hội thoại phía máy chủ theo chủ sở hữu |
| `.../Chatbot/LlmClient.cs`, `ChatbotOptions.cs`, `ChatbotSetup.cs` | Client OpenAI-compatible, cấu hình, đăng ký DI và giới hạn tần suất |
| `frontend/src/components/chat-widget.js`, `frontend/src/styles/_chat.scss` | Widget nổi cho hai khu |
| `frontend/src/services/api.js` (`aiApi`, `portalAiApi`), mock trong `mocks/handlers/admin.js`, `portal.js` | Gọi API; mock không gọi AI thật |
| `backend/tests/SmartRent.Api.Tests/Chatbot/*` | 100 bài kiểm thử (10 bài chạy trên database local) |

Không thêm bảng database (giữ 13 bảng), không thêm package NuGet/npm, không đổi nghiệp vụ hay controller hiện có.
`Program.cs` chỉ thêm một dòng `AddChatbot`.

## Cấu hình

`.env` và `frontend/.env.local` nằm trong repo công khai: **không đặt khóa AI vào đó**, không đặt vào `appsettings.json`
hay biến `VITE_*`. Dùng .NET User Secrets (máy dev) hoặc biến môi trường (server):

```powershell
dotnet user-secrets set "Chatbot:BaseUrl" "https://<router-cua-ban>/v1" --project backend/src/SmartRent.Api
dotnet user-secrets set "Chatbot:ApiKey"  "<khoa-api>"                  --project backend/src/SmartRent.Api
dotnet user-secrets set "Chatbot:Model"   "cx/gpt-6-luna"              --project backend/src/SmartRent.Api
# Chỉ khi router chỉ có http (khóa và dữ liệu đi qua mạng không mã hóa):
dotnet user-secrets set "Chatbot:AllowInsecureHttp" "true"             --project backend/src/SmartRent.Api
```

Server: `Chatbot__BaseUrl`, `Chatbot__ApiKey`, `Chatbot__Model`. BaseUrl là gốc `/v1`, client tự thêm `/chat/completions`.
Model phải hỗ trợ `tools`; danh sách model của 9router xem bằng `GET {BaseUrl}/models`. Ngày 13/11/2026 đã chạy cùng bộ
34 câu hỏi thật: `cx/gpt-6-luna` đúng 34/34, trung bình khoảng 5 giây/câu; `cx/gpt-6.1-sol` cũng đúng hết nhưng chậm hơn
(khoảng 6–7 giây/câu).
Thiếu cấu hình thì API trả `503 ai_not_configured`, widget báo "Chưa kết nối dịch vụ trợ lý AI", phần còn lại của web không đổi.

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `TimeoutSeconds` / `TurnTimeoutSeconds` | 60 / 150 | Chờ mỗi lần gọi AI / cả câu hỏi |
| `MaxToolRounds` / `MaxToolCallsPerTurn` | 5 / 12 | Giới hạn vòng và số lần gọi công cụ mỗi câu hỏi |
| `MessagesPerMinute` / `MessagesPerDay` | 8 / 300 | Giới hạn theo tài khoản, quá thì 429 |
| `MaxInputChars` | 2000 | Độ dài câu hỏi |
| `HistoryMessages` | 12 | Số tin gần nhất gửi kèm làm ngữ cảnh |
| `ConversationIdleHours` / `MaxConversationsPerUser` | 12 / 20 | Hết hạn và số hội thoại giữ lại |
| `MaxOutputTokens`, `Temperature` | 1500, không gửi | Tham số gửi cho mô hình |

## Bảo mật

- **Danh tính chỉ từ phiên.** Controller và *mỗi* lần gọi công cụ đều tra lại token trong `auth_tokens`/`users`
  (`AuthSessionService.FindUserAsync`). Phiên bị thu hồi, đổi role hay khác chủ hội thoại giữa chừng thì dừng ngay (401/403).
- **Không có tham số danh tính.** Công cụ khách không nhận `userId`/`tenantId`; schema đặt `additionalProperties: false`
  và máy chủ từ chối mọi trường lạ trước khi chạy công cụ.
- **Phân quyền ở API hiện có.** Công cụ khách gọi `/api/v1/portal/*` (SQL lọc `user_id` của chính khách), công cụ admin gọi
  API admin (`BeginAsync(admin: true)`). ID hồ sơ người khác → "không tìm thấy hoặc không có quyền" (không lộ có tồn tại).
  Kể cả khi ép chạy công cụ admin bằng phiên khách, API admin vẫn trả 403 (có test).
- **Phạm vi admin.** Hệ thống có một admin quản lý mọi cơ sở (`propertyScope = "all"`). `propertyId` phải nằm trong danh sách
  cơ sở mà API trả cho chính tài khoản đó; nếu sau này phân quyền theo cơ sở, kiểm tra tự hẹp theo API.
- **Không SQL tùy ý.** Mô hình chỉ gọi được danh sách công cụ cố định; tham số đi qua kiểm tra kiểu, enum, mẫu mã chứng từ.
- **Tham số do mô hình tự nghĩ ra không được dùng.** Schema gửi cho mô hình theo kiểu *strict* (mọi ô có trong `required`,
  ô tùy chọn nhận `null`). 9router ép strict, nên nếu khai báo tùy chọn kiểu thường thì mô hình buộc phải điền mọi ô và
  điền `""`, `0` hoặc giá trị bịa. Phía máy chủ còn một lớp chặn nữa:
  - `""`, `0`, `false` và UUID toàn số 0 được coi là không truyền.
  - UUID chỉ được dùng khi đã xuất hiện trong kết quả công cụ của lượt đó hoặc trong lời người dùng; UUID khác bị bỏ qua.
  - Từ khóa tìm kiếm (`q`) phải là cụm người dùng thật sự gõ: tối đa 5 từ, không chỉ gồm từ chung như "hợp đồng".
  - Mã dính ký tự rác (ví dụ `HD-001C6B5…`) được khôi phục về đúng mã người dùng đã gõ.
  - Tên cơ sở trong câu hỏi admin ("khu Nhà trọ mẫu") được máy chủ tự đổi thành cơ sở tương ứng; kết quả ghi rõ `propertyFilter`.
  - Lời gọi lặp lại y hệt trong một câu hỏi không chạy lại API mà buộc mô hình trả lời luôn.

  Đây chỉ là chống nhầm. Quyền truy cập vẫn do API kiểm tra: ID người dùng tự dán vào câu hỏi vẫn đi tới API và bị chặn
  nếu không thuộc quyền (có test).
- **Prompt injection.** Kết quả công cụ được gói như dữ liệu kèm ghi chú "không phải chỉ dẫn"; tin nhắn có dấu hiệu vượt quyền
  được gắn cờ, ghi log và thêm lời nhắc. Không có công cụ ghi dữ liệu nên injection không thể gây thay đổi.
- **Không bịa số.** Số tiền, tỷ lệ, số ≥ 1000 và ngày trong câu trả lời phải có trong kết quả công cụ *của lượt đó*
  (hoặc trong câu hỏi). Sai thì mô hình phải viết lại; vẫn sai thì trả thông báo "chưa thể xác minh" thay cho số.
  Số cột `numeric` được bỏ số 0 thừa (`100.000` → `100`) để chỉ số công tơ không bị đọc thành trăm nghìn.
- **Không lộ bí mật.** Khóa API chỉ nằm trong header request ra ngoài, không vào prompt hay log; câu trả lời chứa chuỗi giống khóa
  bị ẩn; câu trả lời lặp lại chỉ dẫn (mã canary hoặc nhiều đoạn trùng) bị thay bằng lời từ chối.
- **Không link ngoài.** Widget escape toàn bộ câu trả lời, không render link/ảnh do mô hình viết. Nút mở trang chỉ lấy từ `actions`
  máy chủ tạo, phải là đường dẫn nội bộ đúng khu (kiểm tra ở cả máy chủ và trình duyệt).
- **Chỉ đọc.** Muốn gửi yêu cầu hỗ trợ, báo chuyển khoản, đặt lịch…, trợ lý hiện nút mở trang tương ứng; người dùng tự xác nhận
  trên form, và API của form kiểm tra quyền như bình thường.
- **Dữ liệu gửi ra ngoài.** Kết quả công cụ (tên, số điện thoại khách với admin, số tiền) được gửi tới dịch vụ AI. Giấy tờ tùy thân,
  ghi chú nội bộ hồ sơ khách, mật khẩu, token không bao giờ có trong kết quả công cụ.

## API

Cùng cấu trúc cho hai khu (thêm `/portal` cho khách), theo `docs/api/openapi.yaml`:

| Thao tác | Ghi chú |
|---|---|
| `GET /api/v1/ai/conversations` | Hội thoại của chính người hỏi |
| `POST /api/v1/ai/conversations` | Tạo; 503 nếu chưa cấu hình AI |
| `GET /api/v1/ai/conversations/{id}` | 404 nếu không phải của mình hoặc đã hết hạn |
| `DELETE /api/v1/ai/conversations/{id}` | Xóa |
| `POST /api/v1/ai/conversations/{id}/messages` `{content}` | Trả hội thoại kèm câu trả lời; lỗi 409 `conversation_busy`, 422, 429 `rate_limited`, 503 `ai_unavailable`, 504 `ai_timeout` |

Tin nhắn trợ lý có `sources` (nguồn dữ liệu đã dùng) và `actions` (`{label, path}` nội bộ).

## Công cụ

Khách: `search_available_rooms`, `get_room_listing`, `get_listing_overview`, `get_contact_info`, `get_my_account_summary`,
`list_my_invoices`, `get_my_invoice_detail`, `get_invoice_payment_instructions`, `list_my_payments`, `get_my_rentals`,
`get_my_contract_detail`, `list_my_support_requests`, `get_my_support_request`, `list_my_viewing_requests`, `suggest_app_page`.

Admin: `get_dashboard_summary`, `list_properties`, `list_rooms`, `get_room_detail`, `list_invoices`, `get_invoice_detail`,
`list_tenants`, `get_tenant_detail`, `list_contracts`, `get_contract_detail`, `list_payments`, `list_tickets`,
`get_ticket_detail`, `list_viewing_requests`, `get_meter_readings`, `suggest_admin_page`.

"Doanh thu tháng" của trợ lý admin là `revenueThisMonth` = tiền thu vào hóa đơn, không gồm cọc, giống thẻ Doanh thu ở trang Tổng quan.

## Kiểm thử

```powershell
# Toàn bộ test .NET (đơn vị chạy không cần DB)
dotnet test backend/tests/SmartRent.Api.Tests

# Thêm 10 test tích hợp trên database local đã có dữ liệu (tạo phiên tạm trong auth_tokens rồi tự xóa)
$env:SMARTRENT_TEST_CONNECTION_STRING = "<connection string của smartrent_app>"
dotnet test backend/tests/SmartRent.Api.Tests --filter "FullyQualifiedName~Chatbot"

cd frontend; node scripts/check-contract.mjs
```

Test dùng mô hình giả theo kịch bản để mô phỏng trường hợp xấu nhất (mô hình đã bị injection): gọi công cụ admin từ khu khách,
giả `userId`/`tenantId`/`role`, SQL trong tham số, phiên bị thu hồi giữa chừng, đổi role giữa chừng, bịa số tiền, lộ chỉ dẫn/khóa,
vượt số lần gọi. Test DB so số liệu công cụ với `v_invoice_balances`, thử khách B đọc hóa đơn của khách A bằng ID và mã
(phải không tìm thấy), hồ sơ không tồn tại (phải báo không thể xác minh).

Kiểm tra tay sau khi chạy backend và frontend: mở `/admin` và trang khách, bấm nút **Trợ lý** ở góc phải dưới.
Mỗi câu hỏi ghi một dòng log `Chatbot turn ...` gồm số lần gọi mô hình, các công cụ đã gọi, cờ (`made_up_argument_ignored`,
`repeated_call`, `ungrounded_retry`, `injection_signal`...) và thời gian, đủ để biết vì sao một câu trả lời chưa đúng.

## Giới hạn đã biết

- Lịch sử nằm trong bộ nhớ của một tiến trình API: khởi động lại thì mất (widget tự mở cuộc mới), nhiều instance cần store chung.
- Đối chiếu số kiểm tra số tiền, tỷ lệ %, số ≥ 1000 và ngày; số nhỏ không đơn vị (số phòng, số ngày) không kiểm tra.
- Mô hình vẫn có thể chọn sai bộ lọc dạng lựa chọn (ví dụ trạng thái) mà máy chủ không đoán được ý. Khi đó câu trả lời có thể
  thiếu dữ liệu, nhưng số liệu nào hiển thị cũng lấy từ dữ liệu thật. Nếu gặp, xem dòng log `Chatbot turn` của câu đó.
- `npm run test:mock` đang dừng ở bước đặt lịch xem phòng ("Phòng ở tối đa 2 người") từ trước thay đổi này; các route mock mới
  của trợ lý đã được thêm vào kịch bản đó.
