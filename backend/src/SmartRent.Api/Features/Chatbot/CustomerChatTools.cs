using System.Text.Json.Nodes;
using SmartRent.Api.Features.Contracts;
using SmartRent.Api.Features.Invoices;
using SmartRent.Api.Features.Payments;
using SmartRent.Api.Features.PublicSite;
using SmartRent.Api.Features.Tickets;
using SmartRent.Api.Features.Viewings;
using static SmartRent.Api.Features.Chatbot.ChatJson;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>
/// Công cụ của khu khách. Không công cụ nào nhận userId/tenantId: danh tính là phiên đăng nhập đã xác thực lại,
/// và mỗi lời gọi đi qua API /api/v1/portal/* vốn đã lọc theo chủ sở hữu trong SQL. Đưa ID hồ sơ của người
/// khác vào chỉ nhận kết quả "không tìm thấy hoặc không có quyền".
/// </summary>
internal static class CustomerChatTools
{
    private const ChatAudience Customer = ChatAudience.Customer;

    public static IEnumerable<IChatTool> All() =>
    [
        SearchRooms(), RoomListing(), ListingOverview(), ContactInfo(),
        AccountSummary(), MyInvoices(), MyInvoiceDetail(), PaymentInstructions(), MyPayments(),
        MyContracts(), MyContractDetail(), MyTickets(), MyTicketDetail(), MyViewings(), OpenPage()
    ];

    // ------------------------------------------------------------------ dữ liệu công khai

    private static ChatTool SearchRooms() => new("search_available_rooms", Customer, "Phòng đang cho thuê",
        "Tìm phòng còn trống đang đăng trên trang SmartRent (giá thuê, diện tích, sức chứa, tiền cọc, tiện ích, các khoản phí). " +
        "Hỏi về một phòng cụ thể thì truyền roomCode (ví dụ A102), không đưa mã phòng vào locality.",
        new ToolSchema()
            .Text("roomCode", "Mã phòng cần xem, ví dụ A102.", 20, ToolPatterns.Code())
            .Text("locality", "Phường/xã hoặc quận/huyện, đúng như tên trong dữ liệu (xem get_listing_overview).", 80)
            .Text("roomType", "Mã loại phòng lấy từ get_listing_overview.", 40, ToolPatterns.Key())
            .Integer("minRent", "Giá thuê tối thiểu (VND/tháng).", 0, 1_000_000_000)
            .Integer("maxRent", "Giá thuê tối đa (VND/tháng).", 0, 1_000_000_000)
            .Enum("sort", "Sắp xếp theo giá tăng (price) hoặc giảm (-price).", "price", "-price")
            .Integer("limit", "Số phòng trả về, mặc định 6.", 1, 10),
        async (ctx, a, ct) =>
        {
            var limit = a.Int("limit") ?? 6;
            var roomCode = a.Text("roomCode");
            // Tìm theo mã phòng: lấy cả trang tin đang đăng rồi lọc đúng mã (API công khai chưa có tham số mã phòng).
            // Mã phòng đã xác định một phòng; bộ lọc khác mô hình điền kèm (khu vực "T0631", giá 631...) chỉ làm trượt.
            var outcome = roomCode is not null
                ? await ctx.Get<PublicController>((c, t) => c.List(null, null, null, null, "price", 1, 200, ct: t), ct)
                : await ctx.Get<PublicController>((c, t) => c.List(a.Text("locality"), a.Text("roomType"),
                    a.Long("minRent"), a.Long("maxRent"), a.Text("sort") ?? "price", 1, limit, ct: t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            var items = Items(outcome.Data)
                .Where(r => roomCode is null || string.Equals(S(r, "roomCode"), roomCode, StringComparison.OrdinalIgnoreCase))
                .Take(limit).ToList();
            if (roomCode is not null && items.Count == 0)
                return ChatToolResult.Fail("not_listed", $"Phòng {roomCode} hiện không có trong danh sách phòng còn trống đang đăng. " + ChatToolResult.Unverifiable);
            return ChatToolResult.Success(Obj(
                ("totalMatching", roomCode is null ? V(outcome.Data, "totalItems") : JsonValue.Create(items.Count)),
                ("rooms", Arr(items.Select(r => (JsonNode?)PublicRoom(r, false))))),
                items.Take(3).Select(r => RoomAction(ctx, r)).Append(ctx.Action("Xem tất cả phòng", "/rooms")));
        });

    private static ChatTool RoomListing() => new("get_room_listing", Customer, "Tin đăng phòng",
        "Xem chi tiết một tin phòng đang đăng theo slug (lấy từ search_available_rooms): mô tả, nội quy, phí, tiện ích.",
        new ToolSchema().Text("slug", "Slug của tin đăng.", 120, ToolPatterns.Slug(), required: true),
        async (ctx, a, ct) =>
        {
            var outcome = await ctx.Get<PublicController>((c, t) => c.Get(a.Text("slug")!, t), ct);
            return outcome.Ok
                ? ChatToolResult.Success(PublicRoom(outcome.Data!, true), [RoomAction(ctx, outcome.Data!)])
                : ChatToolResult.FromError(outcome, Customer);
        });

    private static ChatTool ListingOverview() => new("get_listing_overview", Customer, "Tổng quan phòng đang cho thuê",
        "Tổng quan các phòng còn trống: số tin, khu vực, loại phòng, khoảng giá từng khoản phí, khoảng tiền cọc.",
        ToolSchema.Empty,
        async (ctx, _, ct) =>
        {
            var outcome = await ctx.Get<PublicController>((c, t) => c.Filters(t), ct);
            return outcome.Ok ? ChatToolResult.Success(outcome.Data) : ChatToolResult.FromError(outcome, Customer);
        });

    private static ChatTool ContactInfo() => new("get_contact_info", Customer, "Thông tin liên hệ",
        "Thông tin liên hệ chủ trọ (tên, điện thoại, email) và địa chỉ các khu nhà đang hoạt động.",
        ToolSchema.Empty,
        async (ctx, _, ct) =>
        {
            var outcome = await ctx.Get<PublicController>((c, t) => c.Contact(t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            var org = Items(outcome.Data, "organizations").FirstOrDefault();
            return ChatToolResult.Success(Obj(
                ("businessName", V(org, "name")),
                ("contactName", V(org, "contactName")),
                ("phone", V(org, "phone")),
                ("email", V(org, "email")),
                ("properties", Arr(Items(org, "properties").Select(p => (JsonNode?)Obj(
                    ("name", V(p, "name")), ("addressLine", V(p, "addressLine")),
                    ("locality", V(p, "locality")), ("province", V(p, "province"))))))),
                [ctx.Action("Trang liên hệ", "/contact")]);
        });

    // ------------------------------------------------------------------ dữ liệu của chính khách

    private static ChatTool AccountSummary() => new("get_my_account_summary", Customer, "Tổng quan tài khoản",
        "Tổng quan của khách đang đăng nhập: phòng đang thuê, tổng còn nợ và nợ quá hạn (do hệ thống tính), hóa đơn còn nợ, " +
        "khoản chuyển khoản đang chờ xác minh, sự cố đang mở, yêu cầu chờ duyệt.",
        ToolSchema.Empty,
        async (ctx, _, ct) =>
        {
            var outcome = await ctx.Get<PortalOverviewController>((c, t) => c.Get(t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            var d = outcome.Data;
            var openInvoices = Items(d, "openInvoices").ToList();
            return ChatToolResult.Success(Obj(
                ("fullName", V(d, "fullName")),
                ("rentals", Arr(Items(d, "tenancies").Select(x => (JsonNode?)Obj(
                    ("room", V(x, "room", "code")),
                    ("property", V(x, "property", "name")),
                    ("role", Label(S(x, "role"), ChatLabels.TenancyRole)),
                    ("status", Label(S(x, "status"), ChatLabels.TenancyStatus)),
                    ("plannedMoveIn", V(x, "plannedMoveIn")),
                    ("actualMoveIn", V(x, "actualMoveIn")),
                    ("requiredDeposit", B(x, "financeVisible") ? V(x, "requiredDeposit") : null),
                    ("depositHeld", B(x, "financeVisible") ? V(x, "depositHeld") : null))))),
                ("totalOutstanding", V(d, "outstandingTotal")),
                ("totalOverdue", V(d, "overdueTotal")),
                ("openInvoices", Arr(openInvoices.Select(i => (JsonNode?)ChatProjections.InvoiceSummary(i, false)))),
                ("pendingReportedPayments", Arr(Items(d, "pendingPayments").Select(p => (JsonNode?)Obj(
                    ("code", V(p, "code")), ("amount", V(p, "amount")), ("reportedAt", V(p, "receivedAt")),
                    ("status", "Chờ chủ trọ xác minh"))))),
                ("openSupportTickets", Arr(Items(d, "openTickets").Select(t => (JsonNode?)Obj(
                    ("code", V(t, "code")), ("title", Clip(S(t, "title"), 160)),
                    ("status", Label(S(t, "status"), ChatLabels.TicketStatus)))))),
                ("pendingRequests", V(d, "pendingRequests")),
                ("unreadNotifications", V(d, "unreadNotifications"))),
                [openInvoices.Count > 0 ? ctx.Action("Xem hóa đơn", "/invoices") : null, ctx.Action("Hợp đồng của tôi", "/contract")]);
        });

    private static ChatTool MyInvoices() => new("list_my_invoices", Customer, "Hóa đơn của tôi",
        "Danh sách hóa đơn đã phát hành của khách đang đăng nhập, kỳ mới nhất trước: kỳ tính tiền, tổng tiền, đã trả, còn nợ, hạn thanh toán, trạng thái. " +
        "Dùng cho \"hóa đơn gần nhất\", \"hóa đơn tháng X\", \"hóa đơn của tôi\" (bỏ trống only). Hóa đơn nháp chưa phát hành thì khách không thấy.",
        new ToolSchema()
            .Enum("only", "Chỉ khi khách hỏi riêng: unpaid = còn nợ; paid = đã trả đủ; void = đã hủy. Bỏ trống = tất cả.", "unpaid", "paid", "void")
            .Integer("limit", "Số hóa đơn trả về, mặc định 10.", 1, 20),
        async (ctx, a, ct) =>
        {
            var limit = a.Int("limit") ?? 10;
            var (status, paymentStatus) = a.Text("only") switch
            {
                "unpaid" => ("open", (string?)null),
                "paid" => (null, "paid"),
                "void" => ("void", null),
                _ => ((string?)null, (string?)null)
            };
            var outcome = await ctx.Get<PortalInvoicesController>((c, t) => c.List(1, limit, "-serviceFrom",
                null, status, paymentStatus, null, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            var items = Items(outcome.Data).ToList();
            var data = Obj(
                ("filter", a.Text("only") switch { "unpaid" => "Còn nợ", "paid" => "Đã trả đủ", "void" => "Đã hủy", _ => "Tất cả" }),
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("invoices", Arr(items.Select(i => (JsonNode?)ChatProjections.InvoiceSummary(i, false)))));
            // Lọc không ra gì: kèm hóa đơn gần nhất mọi trạng thái để trả lời đúng "không còn nợ, hóa đơn gần nhất là ..."
            // thay vì kết luận khách không có hóa đơn.
            if (items.Count == 0 && (status ?? paymentStatus) is not null)
            {
                var latest = await ctx.Get<PortalInvoicesController>((c, t) => c.List(1, Math.Min(limit, 5), "-serviceFrom",
                    null, null, null, null, t), ct);
                if (latest.Ok)
                    data["latestInvoicesAnyStatus"] = Arr(Items(latest.Data).Select(i => (JsonNode?)ChatProjections.InvoiceSummary(i, false)));
            }
            return ChatToolResult.Success(data, [ctx.Action("Mở trang hóa đơn", "/invoices")]);
        });

    private static ChatTool MyInvoiceDetail() => new("get_my_invoice_detail", Customer, "Chi tiết hóa đơn",
        "Chi tiết một hóa đơn của khách: từng khoản (tiền phòng, điện, nước, dịch vụ), chỉ số điện nước đầu/cuối, " +
        "số đã thanh toán, còn nợ. Truyền invoiceCode (ví dụ HD-00000012) hoặc invoiceId lấy từ list_my_invoices.",
        new ToolSchema()
            .Text("invoiceCode", "Mã hóa đơn.", 40, ToolPatterns.Code())
            .Uuid("invoiceId", "ID hóa đơn lấy từ công cụ khác."),
        async (ctx, a, ct) =>
        {
            var id = await ResolveInvoice(ctx, a, ct);
            if (id.Error is not null)
                return id.Error;
            var outcome = await ctx.Get<PortalInvoicesController>((c, t) => c.Get(id.Value, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            return ChatToolResult.Success(ChatProjections.InvoiceDetail(outcome.Data!, false),
                [ctx.Action("Mở hóa đơn " + S(outcome.Data, "code"), "/invoices/" + id.Value)]);
        });

    private static ChatTool PaymentInstructions() => new("get_invoice_payment_instructions", Customer, "Thông tin chuyển khoản",
        "Thông tin chuyển khoản cho một hóa đơn còn nợ: ngân hàng, số tài khoản, tên tài khoản, số tiền còn nợ, nội dung chuyển khoản.",
        new ToolSchema()
            .Text("invoiceCode", "Mã hóa đơn.", 40, ToolPatterns.Code())
            .Uuid("invoiceId", "ID hóa đơn lấy từ công cụ khác."),
        async (ctx, a, ct) =>
        {
            var id = await ResolveInvoice(ctx, a, ct);
            if (id.Error is not null)
                return id.Error;
            var outcome = await ctx.Get<PortalInvoicesController>((c, t) => c.GetPaymentQr(id.Value, t), ct);
            if (!outcome.Ok)
                return outcome.Status == 400
                    ? ChatToolResult.Fail("already_paid", "Hóa đơn này đã được thanh toán đủ.")
                    : ChatToolResult.FromError(outcome, Customer);
            var d = outcome.Data;
            return ChatToolResult.Success(Obj(
                ("invoiceCode", V(d, "invoiceCode")),
                ("amountToTransfer", V(d, "amount")),
                ("transferContent", V(d, "transferContent")),
                ("bankName", V(d, "bankName")),
                ("accountNumber", V(d, "accountNumber")),
                ("accountName", V(d, "accountName")),
                ("note", "Sau khi chuyển khoản, khách báo đã chuyển trên trang hóa đơn; khoản này chỉ trừ công nợ khi chủ trọ xác nhận.")),
                [ctx.Action("Báo đã chuyển khoản", "/invoices/" + id.Value)]);
        });

    private static ChatTool MyPayments() => new("list_my_payments", Customer, "Lịch sử thanh toán",
        "Các khoản thanh toán/tiền cọc của khách: số tiền, loại, phương thức, trạng thái xác minh, lý do bị từ chối.",
        new ToolSchema().Integer("limit", "Số giao dịch, mặc định 10.", 1, 20),
        async (ctx, a, ct) =>
        {
            var outcome = await ctx.Get<PortalPaymentsController>((c, t) => c.List(1, a.Int("limit") ?? 10, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            return ChatToolResult.Success(Obj(
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("payments", Arr(Items(outcome.Data).Select(p => (JsonNode?)ChatProjections.Payment(p))))));
        });

    private static ChatTool MyContracts() => new("get_my_rentals", Customer, "Hợp đồng của tôi",
        "Các phòng khách đang/sắp/đã thuê: vai trò, giá thuê theo hợp đồng, tiền cọc yêu cầu và đang giữ, mã và hạn hợp đồng.",
        ToolSchema.Empty,
        async (ctx, _, ct) =>
        {
            var outcome = await ctx.Get<PortalTenanciesController>((c, t) => c.List(t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            return ChatToolResult.Success(Obj(("rentals", Arr(Items(outcome.Data).Select(x => (JsonNode?)Obj(
                ("rentalId", V(x, "id")),
                ("status", Label(S(x, "status"), ChatLabels.TenancyStatus)),
                ("role", Label(S(x, "role"), ChatLabels.TenancyRole)),
                ("room", V(x, "room", "code")),
                ("property", V(x, "property", "name")),
                ("address", V(x, "property", "addressLine")),
                ("monthlyRent", V(x, "rent")),
                ("requiredDeposit", V(x, "requiredDeposit")),
                ("depositHeld", V(x, "depositHeld")),
                ("contract", At(x, "contract") is null ? (JsonNode?)JsonValue.Create("Chưa có hợp đồng đã ký") : Obj(
                    ("code", V(x, "contract", "code")),
                    ("status", Label(S(x, "contract", "status"), ChatLabels.ContractStatus)),
                    ("lastDay", V(x, "contract", "displayEndOn")),
                    ("daysLeft", V(x, "contract", "daysLeft"))))))))),
                [ctx.Action("Hợp đồng của tôi", "/contract")]);
        });

    private static ChatTool MyContractDetail() => new("get_my_contract_detail", Customer, "Chi tiết hợp đồng",
        "Điều khoản tiền của hợp đồng: các phiên bản đã ký, đơn giá từng khoản (phòng, điện, nước, dịch vụ), tiền cọc, ngày lập hóa đơn, " +
        "người ở cùng, chỉ số điện nước lúc nhận/trả phòng. rentalId lấy từ get_my_rentals; bỏ trống thì dùng phòng mới nhất.",
        new ToolSchema().Uuid("rentalId", "rentalId lấy từ get_my_rentals."),
        async (ctx, a, ct) =>
        {
            var id = a.Uuid("rentalId");
            if (id is null)
            {
                var list = await ctx.Get<PortalTenanciesController>((c, t) => c.List(t), ct);
                if (!list.Ok)
                    return ChatToolResult.FromError(list, Customer);
                var first = Items(list.Data).FirstOrDefault();
                if (first is null)
                    return ChatToolResult.Fail("no_rental", "Tài khoản chưa có phòng thuê nào nên chưa có hợp đồng.");
                id = Guid.Parse(S(first, "id")!);
            }
            var outcome = await ctx.Get<PortalTenanciesController>((c, t) => c.Get(id.Value, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            var contract = Items(outcome.Data, "contracts").FirstOrDefault();
            return ChatToolResult.Success(Obj(
                ("contractCode", V(contract, "code")),
                ("status", Label(S(contract, "status"), ChatLabels.ContractStatus)),
                ("versions", Arr(Items(contract, "versions").Select(v => (JsonNode?)ChatProjections.ContractVersion(v)))),
                ("residents", Arr(Items(outcome.Data, "residents").Select(r => (JsonNode?)Obj(
                    ("fullName", V(r, "fullName")), ("joinedOn", V(r, "joinedOn")), ("leftOn", V(r, "leftOn")))))),
                ("handovers", Arr(Items(outcome.Data, "handovers").Select(h => (JsonNode?)Obj(
                    ("kind", S(h, "kind") == "checkin" ? "Nhận phòng" : "Trả phòng"),
                    ("on", V(h, "occurredAt")),
                    ("readings", Arr(Items(h, "readings").Select(r => (JsonNode?)Obj(
                        ("meter", S(r, "meterKind") == "electricity" ? "Điện" : S(r, "meterKind") == "water" ? "Nước" : S(r, "meterKind")),
                        ("reading", V(r, "readingValue"))))))))))),
                [ctx.Action("Hợp đồng của tôi", "/contract")]);
        });

    private static ChatTool MyTickets() => new("list_my_support_requests", Customer, "Yêu cầu hỗ trợ",
        "Các yêu cầu hỗ trợ/sự cố khách đã gửi hoặc thuộc phòng khách đang thuê, kèm trạng thái xử lý.",
        new ToolSchema()
            .Enum("status", "open = đang mở; hoặc một trạng thái cụ thể.", "open", "new", "accepted", "in_progress", "waiting", "resolved", "closed")
            .Integer("limit", "Số yêu cầu, mặc định 10.", 1, 20),
        async (ctx, a, ct) =>
        {
            var query = new TicketListQuery { Status = a.Text("status"), PageSize = a.Int("limit") ?? 10 };
            var outcome = await ctx.Get<PortalTicketsController>((c, t) => c.List(query, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            return ChatToolResult.Success(Obj(
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("requests", Arr(Items(outcome.Data).Select(t => (JsonNode?)ChatProjections.TicketSummary(t))))),
                [ctx.Action("Xem yêu cầu hỗ trợ", "/tickets"), ctx.Action("Gửi yêu cầu mới", "/tickets/new")]);
        });

    private static ChatTool MyTicketDetail() => new("get_my_support_request", Customer, "Chi tiết yêu cầu hỗ trợ",
        "Chi tiết một yêu cầu hỗ trợ: mô tả, tiến độ, ghi chú xử lý, tin nhắn gần nhất. Truyền ticketCode hoặc ticketId.",
        new ToolSchema()
            .Text("ticketCode", "Mã yêu cầu hỗ trợ.", 40, ToolPatterns.Code())
            .Uuid("ticketId", "ID yêu cầu lấy từ list_my_support_requests."),
        async (ctx, a, ct) =>
        {
            var (id, error) = await ChatResolve.ByCodeOrId(ctx, a.Text("ticketCode"), a.Uuid("ticketId"),
                code => ctx.Get<PortalTicketsController>((c, t) => c.List(new TicketListQuery { Q = code, PageSize = 20 }, t), ct), "yêu cầu hỗ trợ");
            if (error is not null)
                return error;
            var outcome = await ctx.Get<PortalTicketsController>((c, t) => c.Get(id, t), ct);
            return outcome.Ok
                ? ChatToolResult.Success(ChatProjections.TicketDetail(outcome.Data!), [ctx.Action("Mở yêu cầu " + S(outcome.Data, "code"), "/tickets/" + id)])
                : ChatToolResult.FromError(outcome, Customer);
        });

    private static ChatTool MyViewings() => new("list_my_viewing_requests", Customer, "Lịch xem phòng",
        "Các yêu cầu xem phòng khách đã gửi: phòng, trạng thái, giờ hẹn đã chốt hoặc giờ khách mong muốn.",
        ToolSchema.Empty,
        async (ctx, _, ct) =>
        {
            var outcome = await ctx.Get<PortalInquiriesController>((c, t) => c.List(t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Customer);
            return ChatToolResult.Success(Obj(("requests", Arr(Items(outcome.Data).Take(20).Select(b => (JsonNode?)Obj(
                ("code", V(b, "code")),
                ("room", V(b, "room", "code")),
                ("property", V(b, "room", "propertyName")),
                ("status", Label(S(b, "status"), ChatLabels.Booking)),
                ("scheduledAt", V(b, "scheduledAt")),
                ("preferredAt", V(b, "preferredViewingAt")),
                ("createdAt", V(b, "createdAt"))))))));
        });

    /// <summary>
    /// Trợ lý chỉ đọc. Muốn tạo/sửa dữ liệu (gửi yêu cầu hỗ trợ, báo chuyển khoản, đặt lịch), khách mở trang
    /// tương ứng và tự xác nhận trên form; API của trang đó kiểm tra quyền như bình thường.
    /// </summary>
    private static ChatTool OpenPage() => new("suggest_app_page", Customer, "Trang trong ứng dụng",
        "Gợi ý nút mở trang để khách tự thực hiện thao tác (trợ lý không tự tạo/sửa dữ liệu).",
        new ToolSchema().RequiredEnum("page", "Trang cần mở.", "rooms", "invoices", "new_support_request", "support_requests", "contract", "account", "contact"),
        (ctx, a, _) =>
        {
            var (label, path) = a.Text("page") switch
            {
                "rooms" => ("Tìm phòng", "/rooms"),
                "invoices" => ("Hóa đơn của tôi", "/invoices"),
                "new_support_request" => ("Gửi yêu cầu hỗ trợ", "/tickets/new"),
                "support_requests" => ("Yêu cầu hỗ trợ", "/tickets"),
                "contract" => ("Hợp đồng của tôi", "/contract"),
                "account" => ("Tài khoản", "/account"),
                _ => ("Liên hệ", "/contact")
            };
            return Task.FromResult(ChatToolResult.Success(Obj(("page", label), ("shownAsButton", true)), [ctx.Action(label, path)]));
        });

    // ------------------------------------------------------------------ hỗ trợ

    private static JsonObject PublicRoom(JsonNode r, bool detail) => Obj(
        ("slug", V(r, "slug")),
        ("title", V(r, "title")),
        ("roomCode", V(r, "roomCode")),
        ("property", V(r, "property", "name")),
        ("addressLine", V(r, "property", "addressLine")),
        ("locality", V(r, "locality")),
        ("province", V(r, "province")),
        ("roomType", V(r, "roomType", "name")),
        ("monthlyRent", V(r, "rent")),
        ("areaM2", V(r, "areaM2")),
        ("capacity", V(r, "capacity")),
        ("requiredDeposit", V(r, "requiredDeposit")),
        ("floor", detail ? V(r, "floorLabel") : null),
        ("amenities", Arr(Items(r, "amenities").Select(x => (JsonNode?)(S(x, "name") ?? S(x, "code"))))),
        ("fees", Arr(Items(r, "fees").Select(f => (JsonNode?)Obj(
            ("name", V(f, "name")), ("unitPrice", V(f, "unitPrice")), ("unit", V(f, "unitLabel")), ("cycle", V(f, "billingCycle")))))),
        ("availability", Label(S(r, "availability", "status"), ChatLabels.Occupancy)),
        ("description", detail ? Clip(S(r, "description"), 700) : null),
        ("rules", detail ? Clip(S(r, "rulesText"), 500) : null));

    private static ChatAction? RoomAction(ChatToolContext ctx, JsonNode r) =>
        S(r, "slug") is { } slug && ToolPatterns.Slug().IsMatch(slug)
            ? ctx.Action("Phòng " + (S(r, "roomCode") ?? slug), "/rooms/" + slug) : null;

    /// <summary>Tìm theo mã trong chính danh sách hóa đơn của khách (API đã lọc theo chủ sở hữu).</summary>
    private static async Task<(Guid Value, ChatToolResult? Error)> ResolveInvoice(ChatToolContext ctx, ToolArguments a, CancellationToken ct) =>
        await ChatResolve.ByCodeOrId(ctx, a.Text("invoiceCode"), a.Uuid("invoiceId"),
            code => ctx.Get<PortalInvoicesController>((c, t) => c.List(1, 20, "-serviceFrom", code, null, null, null, t), ct), "hóa đơn");
}
