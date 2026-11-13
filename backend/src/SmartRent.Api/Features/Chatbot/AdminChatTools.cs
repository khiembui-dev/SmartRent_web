using System.Text.Json.Nodes;
using SmartRent.Api.Features.Billing;
using SmartRent.Api.Features.Contracts;
using SmartRent.Api.Features.Dashboard;
using SmartRent.Api.Features.Invoices;
using SmartRent.Api.Features.Payments;
using SmartRent.Api.Features.Properties;
using SmartRent.Api.Features.Rooms;
using SmartRent.Api.Features.Tenants;
using SmartRent.Api.Features.Tickets;
using SmartRent.Api.Features.Viewings;
using static SmartRent.Api.Features.Chatbot.ChatJson;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>
/// Công cụ khu quản trị. Mọi lời gọi đi qua API /api/v1/* của admin, vốn từ chối tài khoản không phải admin.
/// Phạm vi cơ sở của admin lấy từ chính API danh sách cơ sở; propertyId ngoài phạm vi bị từ chối trước khi truy vấn.
/// </summary>
internal static class AdminChatTools
{
    private const ChatAudience Admin = ChatAudience.Admin;

    private const string PropertyIdHint =
        "Chỉ khi admin hỏi riêng một cơ sở: propertyId lấy từ list_properties. Bỏ trống = tất cả cơ sở. Không tự đặt ID.";

    public static IEnumerable<IChatTool> All() =>
    [
        Dashboard(), Properties(), Rooms(), RoomDetail(), Invoices(), InvoiceDetail(), Tenants(), TenantDetail(),
        Contracts(), ContractDetail(), Payments(), Tickets(), TicketDetail(), Viewings(), MeterReadings(), OpenPage()
    ];

    private static ChatTool Dashboard() => new("get_dashboard_summary", Admin, "Tổng quan quản trị",
        "Số liệu tổng quan do hệ thống tính cho một tháng và một/tất cả cơ sở: phòng (tổng, đang thuê, trống, bảo trì, tỷ lệ lấp đầy %), " +
        "tài chính (invoicesOfSelectedMonth = hóa đơn của tháng chọn: phải thu, đã thu, còn nợ, quá hạn; totalOutstanding = tổng công nợ hiện tại; " +
        "revenueThisMonth = doanh thu tháng chọn như trang Tổng quan, tức tiền thu vào hóa đơn, không gồm cọc; " +
        "cashInThisMonth = toàn bộ tiền thực nhận trong tháng, gồm phần vào hóa đơn và tiền cọc; depositHeld = tiền cọc đang giữ), " +
        "tiến độ tính tiền tháng hiện tại, lịch xem, ticket, hợp đồng sắp hết hạn, biểu đồ 6 tháng.",
        new ToolSchema()
            .Month("month", "Tháng YYYY-MM; bỏ trống = tháng hiện tại.")
            .Uuid("propertyId", PropertyIdHint),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var outcome = await ctx.Get<DashboardController>((c, t) => c.GetDashboard(a.Text("month"), scope.Id, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            var d = outcome.Data;
            return ChatToolResult.Success(Obj(
                ("scope", Obj(("month", V(d, "scope", "label")), ("allProperties", V(d, "scope", "allProperties")),
                    ("properties", Arr(Items(At(d, "scope", "properties")).Select(p => V(p, "name")))), ("asOf", V(d, "scope", "asOf")))),
                ("rooms", Obj(("total", V(d, "rooms", "total")), ("occupied", V(d, "rooms", "occupied")),
                    ("available", V(d, "rooms", "available")), ("availableButHeld", V(d, "rooms", "availableWithUpcoming")),
                    ("maintenance", V(d, "rooms", "maintenance")), ("inactive", V(d, "rooms", "inactive")),
                    ("occupancyRatePercent", V(d, "rooms", "occupancyRate")))),
                ("finance", Obj(
                    ("invoicesOfSelectedMonth", V(d, "finance", "period")),
                    ("totalOutstanding", V(d, "finance", "totalOutstanding")),
                    ("overdueOutstanding", V(d, "finance", "overdueOutstanding")),
                    ("overdueInvoiceCount", V(d, "finance", "overdueCount")),
                    // Giống thẻ "Doanh thu tháng" trên trang Tổng quan: tiền thu vào hóa đơn, không gồm tiền cọc.
                    ("revenueThisMonth", V(d, "finance", "collectedThisMonth", "toInvoices")),
                    ("cashInThisMonth", Obj(("total", V(d, "finance", "collectedThisMonth", "total")),
                        ("toInvoices", V(d, "finance", "collectedThisMonth", "toInvoices")),
                        ("toDeposit", V(d, "finance", "collectedThisMonth", "toDeposit")),
                        ("unapplied", V(d, "finance", "collectedThisMonth", "unapplied")))),
                    ("pendingReportedTransfers", V(d, "finance", "pendingReported")),
                    ("depositHeld", V(d, "finance", "depositHeld")))),
                ("billingCurrentMonth", Obj(("month", V(d, "billing", "label")), ("activeRentals", V(d, "billing", "tenancyCount")),
                    ("missingMeterReadings", V(d, "billing", "missingReadings")), ("draftInvoices", V(d, "billing", "draftCount")),
                    ("issuedInvoices", V(d, "billing", "invoiced")))),
                ("viewings", V(d, "viewings")),
                ("tickets", V(d, "tickets")),
                ("contracts", Obj(("expiringIn30Days", V(d, "contracts", "expiring")), ("expiredButStillOccupied", V(d, "contracts", "expiredOccupied")))),
                ("todo", Arr(Items(At(d, "tasks")).Where(t => S(t, "count") is not (null or "0"))
                    .Select(t => (JsonNode?)Obj(("task", V(t, "label")), ("count", V(t, "count")))))),
                ("last6Months", Arr(Items(At(d, "charts", "monthly")).Select(m => (JsonNode?)Obj(
                    ("month", V(m, "label")), ("receivable", V(m, "receivable")), ("collected", V(m, "allocated")),
                    ("outstanding", V(m, "outstanding")), ("overdue", V(m, "overdue")), ("invoiceCount", V(m, "count"))))))),
                [ctx.Action("Mở tổng quan", "/admin")]);
        });

    private static ChatTool Properties() => new("list_properties", Admin, "Cơ sở",
        "Danh sách cơ sở (khu nhà) trong phạm vi quản lý: ID, mã, địa chỉ, số phòng theo trạng thái, đơn giá mặc định, ngày lập hóa đơn.",
        new ToolSchema().Search("q", "Lọc theo tên hoặc địa chỉ.", 80),
        async (ctx, a, ct) =>
        {
            var outcome = await ctx.Get<PropertiesController>((c, t) => c.List(a.Text("q"), 1, 50, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            return ChatToolResult.Success(Obj(("properties", Arr(Items(outcome.Data).Select(p => (JsonNode?)Obj(
                ("propertyId", V(p, "id")), ("code", V(p, "code")), ("name", V(p, "name")),
                ("address", string.Join(", ", new[] { S(p, "address", "line"), S(p, "address", "locality"), S(p, "address", "province") }
                    .Where(x => !string.IsNullOrWhiteSpace(x)))),
                ("isActive", V(p, "isActive")),
                ("rooms", Obj(("total", V(p, "roomCount")), ("occupied", V(p, "occupiedCount")), ("available", V(p, "availableCount")),
                    ("maintenance", V(p, "maintenanceCount")), ("inactive", V(p, "inactiveCount")))),
                ("defaultRates", Arr(Items(At(p, "rates")).Select(r => (JsonNode?)ChatProjections.Rate(r)))),
                ("invoiceDay", V(p, "billingSettings", "invoiceDay")),
                ("dueAfterDays", V(p, "billingSettings", "dueAfterDays"))))))),
                [ctx.Action("Mở danh sách cơ sở", "/admin/properties")]);
        });

    private static ChatTool Rooms() => new("list_rooms", Admin, "Phòng",
        "Danh sách phòng: trạng thái thực tế (trống, đang thuê, giữ chỗ, bảo trì, ngừng), giá thuê hiện hành, khách đang ở, trạng thái tin đăng.",
        new ToolSchema()
            .Uuid("propertyId", PropertyIdHint)
            .Enum("status", "Lọc theo trạng thái.", "available", "occupied", "reserved", "maintenance", "inactive")
            .Search("q", "Tìm theo mã/tên phòng hoặc tên khách.", 60)
            .Integer("limit", "Số phòng, mặc định 20.", 1, 50),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var outcome = await ctx.Get<RoomsController>((c, t) => c.List(a.Text("q"), scope.Id, a.Text("status"), null, 1, a.Int("limit") ?? 20, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            return ChatToolResult.Success(Obj(
                ("propertyFilter", scope.Label),
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("rooms", Arr(Items(outcome.Data).Select(r => (JsonNode?)RoomSummary(r))))),
                [ctx.Action("Mở danh sách phòng", "/admin/rooms")]);
        });

    private static ChatTool RoomDetail() => new("get_room_detail", Admin, "Chi tiết phòng",
        "Chi tiết một phòng: đơn giá hiệu lực từng khoản, tiện ích, khách đang ở, giữ chỗ, sự cố gần đây, tin đăng. " +
        "Truyền roomCode (ví dụ A101) hoặc roomId lấy từ list_rooms.",
        new ToolSchema()
            .Text("roomCode", "Mã phòng, ví dụ A101.", 20, ToolPatterns.Code())
            .Uuid("roomId", "ID phòng lấy từ list_rooms.")
            .Uuid("propertyId", PropertyIdHint),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var id = a.Uuid("roomId");
            if (a.Text("roomCode") is { } code)
            {
                var list = await ctx.Get<RoomsController>((c, t) => c.List(code, scope.Id, null, null, 1, 50, t), ct);
                if (!list.Ok)
                    return ChatToolResult.FromError(list, Admin);
                var matches = Items(list.Data).Where(r => string.Equals(S(r, "code"), code, StringComparison.OrdinalIgnoreCase)).ToList();
                if (matches.Count == 0)
                    return ChatToolResult.Fail("not_found", $"Không có phòng mã {code}. " + ChatToolResult.Unverifiable);
                if (matches.Count > 1)
                    return ChatToolResult.Success(Obj(("ambiguous", true), ("message", "Nhiều cơ sở có phòng cùng mã; hỏi lại cơ sở."),
                        ("candidates", Arr(matches.Select(r => (JsonNode?)Obj(("roomId", V(r, "id")), ("property", V(r, "property", "name"))))))));
                id = Guid.Parse(S(matches[0], "id")!);
            }
            if (id is null)
                return ChatToolResult.Fail("invalid_arguments", "Cần roomCode hoặc roomId.");
            var outcome = await ctx.Get<RoomsController>((c, t) => c.Get(id.Value, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            var r = outcome.Data!;
            var detail = RoomSummary(r);
            detail["floor"] = V(r, "floorLabel");
            detail["rates"] = Arr(Items(At(r, "rates", "effective")).Select(x => (JsonNode?)ChatProjections.Rate(x)));
            detail["amenities"] = Arr(Items(At(r, "amenities")).Select(x => (JsonNode?)(S(x, "name") ?? S(x, "code"))));
            detail["holds"] = Arr(Items(At(r, "calendar")).Select(h => (JsonNode?)Obj(
                ("heldFor", V(h, "reservation", "tenant", "fullName")), ("expiresAt", V(h, "holdExpiresAt")))));
            detail["recentTickets"] = Arr(Items(At(r, "tickets")).Take(5).Select(t => (JsonNode?)Obj(
                ("code", V(t, "code")), ("title", Clip(S(t, "title"), 120)), ("status", Label(S(t, "status"), ChatLabels.TicketStatus)))));
            return ChatToolResult.Success(detail, [ctx.Action("Mở phòng " + S(r, "code"), "/admin/rooms/" + id.Value)]);
        });

    private static ChatTool Invoices() => new("list_invoices", Admin, "Hóa đơn",
        "Danh sách hóa đơn có số phải thu, đã thu, còn nợ, quá hạn do hệ thống tính. totalMatching là tổng số hóa đơn khớp bộ lọc; " +
        "danh sách có thể bị cắt theo limit. Không cộng số tiền trong danh sách: tổng công nợ lấy từ get_dashboard_summary hoặc list_tenants.",
        new ToolSchema()
            .Uuid("propertyId", PropertyIdHint)
            .Month("month", "Kỳ hóa đơn YYYY-MM.")
            .Enum("status", "open = đã phát hành còn nợ; draft = nháp; issued = đã phát hành; void = đã hủy.", "open", "draft", "issued", "void")
            .Enum("paymentStatus", "paid/unpaid/partial.", "paid", "unpaid", "partial")
            .Boolean("overdue", "true = chỉ hóa đơn quá hạn còn nợ.")
            .Boolean("hasPendingTransfer", "true = có khoản khách báo chuyển khoản đang chờ xác minh.")
            .Search("q", "Tìm theo mã hóa đơn, mã phòng hoặc tên khách.", 60)
            .Integer("limit", "Số hóa đơn, mặc định 15.", 1, 30),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var query = new Dictionary<string, string?>
            {
                ["month"] = a.Text("month"),
                ["overdue"] = a.Bool("overdue") == true ? "true" : null,
                ["hasPending"] = a.Bool("hasPendingTransfer") == true ? "true" : null
            };
            var outcome = await ctx.Get<InvoicesController>((c, t) => c.List(scope.Id, null, a.Text("status"),
                a.Text("paymentStatus"), null, a.Text("q"), "-serviceFrom", 1, a.Int("limit") ?? 15, t), ct, query);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            return ChatToolResult.Success(Obj(
                ("propertyFilter", scope.Label),
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("invoices", Arr(Items(outcome.Data).Select(i => (JsonNode?)ChatProjections.InvoiceSummary(i, true))))),
                [ctx.Action("Mở danh sách hóa đơn", "/admin/invoices")]);
        });

    private static ChatTool InvoiceDetail() => new("get_invoice_detail", Admin, "Chi tiết hóa đơn",
        "Chi tiết hóa đơn: từng khoản, chỉ số điện nước đầu/cuối, các lần thanh toán đã phân bổ, khoản chờ xác minh, còn nợ. " +
        "Truyền invoiceCode hoặc invoiceId.",
        new ToolSchema()
            .Text("invoiceCode", "Mã hóa đơn.", 40, ToolPatterns.Code())
            .Uuid("invoiceId", "ID hóa đơn."),
        async (ctx, a, ct) =>
        {
            var (id, error) = await ChatResolve.ByCodeOrId(ctx, a.Text("invoiceCode"), a.Uuid("invoiceId"),
                code => ctx.Get<InvoicesController>((c, t) => c.List(null, null, null, null, null, code, "-serviceFrom", 1, 20, t), ct), "hóa đơn");
            if (error is not null)
                return error;
            var outcome = await ctx.Get<InvoicesController>((c, t) => c.Get(id, t), ct);
            return outcome.Ok
                ? ChatToolResult.Success(ChatProjections.InvoiceDetail(outcome.Data!, true), [ctx.Action("Mở hóa đơn " + S(outcome.Data, "code"), "/admin/invoices/" + id)])
                : ChatToolResult.FromError(outcome, Admin);
        });

    private static ChatTool Tenants() => new("list_tenants", Admin, "Khách thuê",
        "Danh sách khách thuê: liên hệ, tình trạng ở, phòng hiện tại, tổng còn nợ và nợ quá hạn của từng khách (hệ thống tính), tiền cọc đang giữ.",
        new ToolSchema()
            .Search("q", "Tìm theo tên, số điện thoại, email, mã khách.", 60)
            .Uuid("propertyId", PropertyIdHint)
            .Enum("residenceStatus", "Chỉ khi admin hỏi riêng: active = đang ở; planned = sắp vào; former = đã từng ở; none = chưa thuê.", "active", "planned", "former", "none")
            .Boolean("debtOnly", "true = chỉ khách còn nợ.")
            .Integer("limit", "Số khách, mặc định 15.", 1, 30),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var query = new Dictionary<string, string?>
            {
                ["propertyId"] = scope.Id?.ToString(),
                ["residenceStatus"] = a.Text("residenceStatus"),
                ["debt"] = a.Bool("debtOnly") == true ? "outstanding" : null
            };
            var outcome = await ctx.Get<TenantsController>((c, t) => c.List(a.Text("q"), 1, a.Int("limit") ?? 15, t), ct, query);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            return ChatToolResult.Success(Obj(
                ("propertyFilter", scope.Label),
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("tenants", Arr(Items(outcome.Data).Select(x => (JsonNode?)TenantSummary(x))))),
                [ctx.Action("Mở danh sách khách thuê", "/admin/tenants")]);
        });

    private static ChatTool TenantDetail() => new("get_tenant_detail", Admin, "Hồ sơ khách thuê",
        "Hồ sơ một khách (không gồm giấy tờ tùy thân): phòng đang/đã thuê, hóa đơn và công nợ, tiền cọc đang giữ, sự cố đã báo, " +
        "yêu cầu đổi thông tin. Truyền tenantCode (ví dụ KH-001) hoặc tenantId lấy từ list_tenants. Biết tên mà không biết mã thì dùng list_tenants (q = tên).",
        new ToolSchema()
            .Text("tenantCode", "Mã khách, ví dụ KH-001.", 40, ToolPatterns.Code())
            .Uuid("tenantId", "ID khách lấy từ list_tenants."),
        async (ctx, a, ct) =>
        {
            var (id, error) = await ChatResolve.ByCodeOrId(ctx, a.Text("tenantCode"), a.Uuid("tenantId"),
                code => ctx.Get<TenantsController>((c, t) => c.List(code, 1, 20, t), ct), "khách");
            if (error is not null)
                return error;
            var outcome = await ctx.Get<TenantsController>((c, t) => c.Get(id, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            var d = outcome.Data!;
            var detail = TenantSummary(d);
            detail["rentals"] = Arr(Items(At(d, "tenancies")).Select(x => (JsonNode?)Obj(
                ("room", V(x, "room", "code")), ("property", V(x, "room", "propertyName")),
                ("status", Label(S(x, "status"), ChatLabels.TenancyStatus)))));
            detail["invoices"] = Arr(Items(At(d, "invoices")).Take(20).Select(i => (JsonNode?)Obj(
                ("code", V(i, "code")), ("room", V(i, "room", "code")), ("status", Label(S(i, "status"), ChatLabels.InvoiceStatus)),
                ("dueOn", V(i, "dueOn")), ("invoiceTotal", V(i, "totalAmount")), ("outstandingAmount", V(i, "outstandingAmount")),
                ("paymentStatus", Label(S(i, "paymentStatus"), ChatLabels.PaymentStatus)), ("isOverdue", V(i, "isOverdue")))));
            detail["tickets"] = Arr(Items(At(d, "tickets")).Take(10).Select(t => (JsonNode?)Obj(
                ("code", V(t, "code")), ("title", Clip(S(t, "title"), 120)), ("status", Label(S(t, "status"), ChatLabels.TicketStatus)))));
            detail["pendingProfileChangeRequests"] = Items(At(d, "profileChangeRequests")).Count(x => S(x, "status") == "pending");
            return ChatToolResult.Success(detail, [ctx.Action("Mở hồ sơ " + S(d, "fullName"), "/admin/tenants/" + id)]);
        });

    private static ChatTool Contracts() => new("list_contracts", Admin, "Hợp đồng",
        "Danh sách hợp đồng/đợt thuê: khách, phòng, ngày bắt đầu, ngày cuối, số ngày còn lại, giá thuê đã ký, tiền cọc yêu cầu/đã nhận/đang giữ.",
        new ToolSchema()
            .Uuid("propertyId", PropertyIdHint)
            .Enum("status", "active = đang hiệu lực; expired = hết hạn nhưng khách vẫn ở; signed = đã ký chưa vào; terminated = đã kết thúc; draft = chưa có bản ký; archived.",
                "active", "expired", "signed", "terminated", "draft", "archived")
            .Boolean("expiringIn30Days", "true = sắp hết hạn trong 30 ngày.")
            .Search("q", "Tìm theo mã hợp đồng, tên khách, mã phòng.", 60)
            .Integer("limit", "Số hợp đồng, mặc định 15.", 1, 30),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var outcome = await ctx.Get<ContractsController>((c, t) => c.List(null, null, scope.Id, a.Text("status"), a.Text("q"),
                a.Bool("expiringIn30Days"), null, null, 1, a.Int("limit") ?? 15, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            return ChatToolResult.Success(Obj(
                ("propertyFilter", scope.Label),
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("contracts", Arr(Items(outcome.Data).Select(x => (JsonNode?)ContractSummary(x))))),
                [ctx.Action("Mở danh sách hợp đồng", "/admin/contracts")]);
        });

    private static ChatTool ContractDetail() => new("get_contract_detail", Admin, "Chi tiết hợp đồng",
        "Chi tiết hợp đồng: các phiên bản và đơn giá từng khoản, tiền cọc, chỉ số công tơ gần nhất, hóa đơn, yêu cầu gia hạn/trả phòng. " +
        "Truyền contractId hoặc contractCode.",
        new ToolSchema()
            .Uuid("contractId", "ID hợp đồng.")
            .Text("contractCode", "Mã hợp đồng.", 40, ToolPatterns.Code()),
        async (ctx, a, ct) =>
        {
            var (id, error) = await ChatResolve.ByCodeOrId(ctx, a.Text("contractCode"), a.Uuid("contractId"),
                code => ctx.Get<ContractsController>((c, t) => c.List(null, null, null, null, code, null, null, null, 1, 30, t), ct), "hợp đồng");
            if (error is not null)
                return error;
            var outcome = await ctx.Get<ContractsController>((c, t) => c.Get(id, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            var d = outcome.Data!;
            var detail = ContractSummary(d);
            detail["moveInOn"] = V(d, "moveInOn");
            detail["moveOutOn"] = V(d, "moveOutOn");
            detail["residentsCount"] = V(d, "tenancy", "residentsCount");
            detail["versions"] = Arr(Items(At(d, "versions")).Select(v => (JsonNode?)ChatProjections.ContractVersion(v)));
            detail["latestMeterReadings"] = Arr(Items(At(d, "meters")).Select(m => (JsonNode?)Obj(
                ("meter", S(m, "meterKind") == "electricity" ? "Điện" : "Nước"),
                ("reading", V(m, "lastReading", "value")), ("observedAt", V(m, "lastReading", "observedAt")))));
            detail["invoices"] = Arr(Items(At(d, "invoices")).Take(20).Select(i => (JsonNode?)Obj(
                ("code", V(i, "code")), ("status", Label(S(i, "status"), ChatLabels.InvoiceStatus)), ("dueOn", V(i, "dueOn")),
                ("invoiceTotal", V(i, "totalAmount")), ("outstandingAmount", V(i, "outstandingAmount")),
                ("paymentStatus", Label(S(i, "paymentStatus"), ChatLabels.PaymentStatus)), ("isOverdue", V(i, "isOverdue")))));
            detail["requests"] = Arr(Items(At(d, "requests")).Select(r => (JsonNode?)Obj(
                ("type", S(r, "requestType") switch { "renewal" => "Gia hạn", "checkout" => "Trả phòng", "transfer" => "Chuyển phòng", var k => k }),
                ("status", Label(S(r, "status"), ChatLabels.Booking)), ("desiredOn", V(r, "desiredOn")))));
            detail["endedReason"] = Clip(S(d, "endedReason"), 200);
            return ChatToolResult.Success(detail, [ctx.Action("Mở hợp đồng", "/admin/contracts/" + id)]);
        });

    private static ChatTool Payments() => new("list_payments", Admin, "Thu tiền",
        "Các giao dịch thu tiền/cọc gần nhất (tối đa 100 giao dịch mới nhất được xét), lọc theo trạng thái.",
        new ToolSchema()
            .Enum("status", "pending = khách báo chuyển khoản chờ xác minh; confirmed = đã xác nhận; rejected = đã từ chối.", "pending", "confirmed", "rejected")
            .Integer("limit", "Số giao dịch, mặc định 15.", 1, 30),
        async (ctx, a, ct) =>
        {
            var outcome = await ctx.Get<PaymentsController>((c, t) => c.List(1, 100, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            var status = a.Text("status");
            var rows = Items(outcome.Data).Where(p => status is null || S(p, "status") == status).ToList();
            return ChatToolResult.Success(Obj(
                ("matchingInLatest100", rows.Count),
                ("payments", Arr(rows.Take(a.Int("limit") ?? 15).Select(p => (JsonNode?)ChatProjections.Payment(p))))),
                [status == "pending" ? ctx.Action("Hóa đơn có khoản chờ xác minh", "/admin/invoices") : null]);
        });

    private static ChatTool Tickets() => new("list_tickets", Admin, "Ticket",
        "Danh sách sự cố/yêu cầu hỗ trợ: phòng, loại, mức ưu tiên, trạng thái, hạn xử lý, quá hạn.",
        new ToolSchema()
            .Enum("status", "open = đang mở; hoặc trạng thái cụ thể.", "open", "new", "accepted", "in_progress", "waiting", "resolved", "closed")
            .Boolean("overdue", "true = quá hạn xử lý.")
            .Enum("priority", "Mức ưu tiên.", "low", "normal", "high", "urgent")
            .Uuid("propertyId", PropertyIdHint)
            .Search("q", "Tìm theo mã, tiêu đề, mã phòng.", 60)
            .Integer("limit", "Số ticket, mặc định 15.", 1, 30),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var query = new TicketListQuery
            {
                // Chỉ lọc khi admin hỏi riêng "quá hạn"; không truyền false để khỏi loại mất ticket quá hạn.
                Status = a.Text("status"), Overdue = a.Bool("overdue") == true ? true : null, Priority = a.Text("priority"),
                PropertyId = scope.Id, Q = a.Text("q"), PageSize = a.Int("limit") ?? 15
            };
            var outcome = await ctx.Get<TicketsController>((c, t) => c.List(query, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            return ChatToolResult.Success(Obj(
                ("propertyFilter", scope.Label),
                ("statusFilter", a.Text("status") switch { null => "Mọi trạng thái", "open" => "Đang mở (chưa xử lý xong)", var s => Label(s, ChatLabels.TicketStatus) }),
                ("totalMatching", V(outcome.Data, "totalItems")),
                ("tickets", Arr(Items(outcome.Data).Select(t => (JsonNode?)ChatProjections.TicketSummary(t))))),
                [ctx.Action("Mở danh sách ticket", "/admin/tickets")]);
        });

    private static ChatTool TicketDetail() => new("get_ticket_detail", Admin, "Chi tiết ticket",
        "Chi tiết một ticket: mô tả, người báo, người phụ trách, ghi chú xử lý, tin nhắn gần nhất (gồm ghi chú nội bộ). Truyền ticketId hoặc ticketCode.",
        new ToolSchema()
            .Uuid("ticketId", "ID ticket.")
            .Text("ticketCode", "Mã ticket.", 40, ToolPatterns.Code()),
        async (ctx, a, ct) =>
        {
            var (id, error) = await ChatResolve.ByCodeOrId(ctx, a.Text("ticketCode"), a.Uuid("ticketId"),
                code => ctx.Get<TicketsController>((c, t) => c.List(new TicketListQuery { Q = code, PageSize = 20 }, t), ct), "ticket");
            if (error is not null)
                return error;
            var outcome = await ctx.Get<TicketsController>((c, t) => c.Get(id, t), ct);
            return outcome.Ok
                ? ChatToolResult.Success(ChatProjections.TicketDetail(outcome.Data!), [ctx.Action("Mở ticket " + S(outcome.Data, "code"), "/admin/tickets/" + id)])
                : ChatToolResult.FromError(outcome, Admin);
        });

    private static ChatTool Viewings() => new("list_viewing_requests", Admin, "Lịch xem phòng",
        "Yêu cầu xem phòng của khách: người liên hệ, phòng, trạng thái, giờ khách muốn, lịch đã chốt.",
        new ToolSchema()
            .Enum("status", "open = chưa kết thúc; hoặc trạng thái cụ thể.", "open", "new", "accepted", "consulting", "scheduled", "completed", "no_show", "converted", "rejected", "cancelled")
            .Uuid("propertyId", PropertyIdHint)
            .Integer("limit", "Số yêu cầu, mặc định 15.", 1, 30),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var outcome = await ctx.Get<InquiriesController>((c, t) => c.List(a.Text("status"), scope.Id?.ToString(), 1, a.Int("limit") ?? 15, t), ct);
            if (!outcome.Ok)
                return ChatToolResult.FromError(outcome, Admin);
            return ChatToolResult.Success(Obj(("propertyFilter", scope.Label), ("requests", Arr(Items(outcome.Data).Select(b => (JsonNode?)Obj(
                ("code", V(b, "code")), ("contactName", V(b, "contactName")), ("phone", V(b, "phone")),
                ("room", V(b, "room", "code")), ("property", V(b, "room", "propertyName")),
                ("status", Label(S(b, "status"), ChatLabels.Booking)), ("occupants", V(b, "occupants")),
                ("preferredAt", V(b, "preferredViewingAt")), ("scheduledAt", V(b, "scheduledAt")),
                ("createdAt", V(b, "createdAt"))))))),
                [ctx.Action("Mở lịch xem phòng", "/admin/viewings")]);
        });

    private static ChatTool MeterReadings() => new("get_meter_readings", Admin, "Tính tiền phòng",
        "Bảng tính tiền của một tháng: chỉ số điện nước kỳ trước/kỳ này và lượng tiêu thụ (hệ thống tính), tình trạng từng phòng " +
        "(thiếu chỉ số, đã có nháp, đã phát hành, đã thanh toán) và hóa đơn tương ứng.",
        new ToolSchema()
            .Month("month", "Tháng YYYY-MM.", required: true)
            .Uuid("propertyId", PropertyIdHint)
            .Text("roomCode", "Chỉ lấy một phòng, ví dụ A101.", 20, ToolPatterns.Code()),
        async (ctx, a, ct) =>
        {
            var (scope, denied) = await ResolveProperty(ctx, a, ct);
            if (denied is not null)
                return denied;
            var month = a.Text("month")! + "-01";
            var periods = await ctx.Get<BillingPeriodsController>((c, t) => c.List(scope.Id, 1, 200, t), ct);
            if (!periods.Ok)
                return ChatToolResult.FromError(periods, Admin);
            var matching = Items(periods.Data).Where(p => S(p, "monthStart") == month).ToList();
            if (matching.Count == 0)
                return ChatToolResult.Fail("no_period", $"Chưa mở kỳ tính tiền tháng {a.Text("month")} cho cơ sở được chọn. " + ChatToolResult.Unverifiable);
            var result = new JsonArray();
            var roomCode = a.Text("roomCode");
            foreach (var period in matching)
            {
                var periodId = Guid.Parse(S(period, "id")!);
                var sheet = await ctx.Get<BillingPeriodsController>((c, t) => c.Worksheet(periodId, t), ct);
                if (!sheet.Ok)
                    return ChatToolResult.FromError(sheet, Admin);
                var rows = Items(sheet.Data, "rows")
                    .Where(r => roomCode is null || string.Equals(S(r, "room", "code"), roomCode, StringComparison.OrdinalIgnoreCase))
                    .Take(40);
                result.Add(Obj(
                    ("property", V(period, "property", "name")),
                    ("periodLocked", S(period, "status") == "locked"),
                    ("stats", V(sheet.Data, "stats")),
                    ("rooms", Arr(rows.Select(r => (JsonNode?)Obj(
                        ("room", V(r, "room", "code")),
                        ("tenant", V(r, "tenancy", "representative", "fullName")),
                        ("state", Label(S(r, "group"), ChatLabels.WorksheetGroup)),
                        ("electricity", Reading(At(r, "readings", "electricity"))),
                        ("water", Reading(At(r, "readings", "water"))),
                        ("unitPrices", V(r, "estimate", "unitPrices")),
                        ("invoice", At(r, "invoice") is null ? null : Obj(
                            ("code", V(r, "invoice", "code")), ("status", Label(S(r, "invoice", "status"), ChatLabels.InvoiceStatus)),
                            ("invoiceTotal", V(r, "invoice", "totalAmount")), ("outstandingAmount", V(r, "invoice", "outstandingAmount")),
                            ("paymentStatus", Label(S(r, "invoice", "paymentStatus"), ChatLabels.PaymentStatus)))),
                        ("problems", Arr(Items(At(r, "problems")).Select(p => V(p, "message"))))))))));
            }
            return ChatToolResult.Success(Obj(("month", a.Text("month")), ("periods", result)),
                [ctx.Action("Mở trang tính tiền", "/admin/billing")]);
        });

    private static ChatTool OpenPage() => new("suggest_admin_page", Admin, "Trang quản trị",
        "Gợi ý nút mở trang quản trị để admin tự thao tác (trợ lý không tự tạo/sửa/xóa dữ liệu).",
        new ToolSchema().RequiredEnum("page", "Trang cần mở.", "dashboard", "properties", "rooms", "viewings", "billing", "tenants", "contracts", "new_contract", "invoices", "tickets", "settings"),
        (ctx, a, _) =>
        {
            var (label, path) = a.Text("page") switch
            {
                "properties" => ("Cơ sở", "/admin/properties"),
                "rooms" => ("Phòng", "/admin/rooms"),
                "viewings" => ("Lịch xem phòng", "/admin/viewings"),
                "billing" => ("Tính tiền phòng", "/admin/billing"),
                "tenants" => ("Khách thuê", "/admin/tenants"),
                "contracts" => ("Hợp đồng", "/admin/contracts"),
                "new_contract" => ("Tạo hợp đồng", "/admin/contracts/new"),
                "invoices" => ("Hóa đơn", "/admin/invoices"),
                "tickets" => ("Ticket", "/admin/tickets"),
                "settings" => ("Cài đặt", "/admin/settings"),
                _ => ("Tổng quan", "/admin")
            };
            return Task.FromResult(ChatToolResult.Success(Obj(("page", label), ("shownAsButton", true)), [ctx.Action(label, path)]));
        });

    // ------------------------------------------------------------------ hỗ trợ

    internal sealed record PropertyScope(Guid? Id, string Label);

    private sealed record ScopedProperty(Guid Id, string Name, string? Code);

    internal const string AllProperties = "Tất cả cơ sở";

    /// <summary>
    /// Xác định cơ sở cần lọc. Admin chỉ được lọc theo cơ sở mà API danh sách cơ sở trả cho chính tài khoản đó (hiện
    /// một admin quản lý mọi cơ sở; nếu sau này phân quyền theo cơ sở, API đó trả ít hơn và kiểm tra này tự hẹp lại).
    /// Mô hình không truyền propertyId (hoặc truyền ID tự bịa, đã bị bỏ ở bước kiểm tra tham số) mà câu hỏi nêu đúng
    /// một cơ sở theo tên/mã thì lọc theo cơ sở đó, để "doanh thu khu X" không trả nhầm số của mọi cơ sở.
    /// </summary>
    internal static async Task<(PropertyScope Scope, ChatToolResult? Error)> ResolveProperty(ChatToolContext ctx, ToolArguments a, CancellationToken ct)
    {
        if (!ctx.Cache.TryGetValue("properties", out var cached))
        {
            var outcome = await ctx.Get<PropertiesController>((c, t) => c.List(null, 1, 200, t), ct);
            if (!outcome.Ok)
                return (new(null, AllProperties), ChatToolResult.FromError(outcome, Admin));
            cached = Items(outcome.Data)
                .Where(p => Guid.TryParse(S(p, "id"), out _))
                .Select(p => new ScopedProperty(Guid.Parse(S(p, "id")!), S(p, "name") ?? "", S(p, "code")))
                .ToList();
            ctx.Cache["properties"] = cached;
        }
        var properties = (List<ScopedProperty>)cached;
        if (a.Uuid("propertyId") is { } propertyId)
        {
            var chosen = properties.FirstOrDefault(p => p.Id == propertyId);
            return chosen is null
                ? (new(null, AllProperties), ChatToolResult.Fail("out_of_scope",
                    "Cơ sở này không tồn tại hoặc không thuộc phạm vi quản lý của tài khoản. " + ChatToolResult.Unverifiable))
                : (new(chosen.Id, chosen.Name), null);
        }
        var text = " " + AnswerGuard.Fold(ctx.UserText) + " ";
        var mentioned = properties.Where(p => Mentions(text, p.Name) || Mentions(text, p.Code)).ToList();
        return mentioned.Count == 1 ? (new(mentioned[0].Id, mentioned[0].Name), null) : (new(null, AllProperties), null);
    }

    private static bool Mentions(string foldedText, string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return false;
        var folded = AnswerGuard.Fold(name).Trim();
        if (folded.Length < 3)
            return false;
        return System.Text.RegularExpressions.Regex.IsMatch(foldedText,
            @"(?<![\p{L}\p{N}])" + System.Text.RegularExpressions.Regex.Escape(folded) + @"(?![\p{L}\p{N}])");
    }

    private static JsonObject RoomSummary(JsonNode r) => Obj(
        ("roomId", V(r, "id")),
        ("code", V(r, "code")),
        ("name", V(r, "name")),
        ("property", V(r, "property", "name")),
        ("status", Label(S(r, "occupancyStatus"), ChatLabels.Occupancy)),
        ("monthlyRent", V(r, "currentRent")),
        ("areaM2", V(r, "areaM2")),
        ("capacity", V(r, "capacity")),
        ("requiredDeposit", V(r, "requiredDeposit")),
        ("currentTenant", V(r, "currentTenancy", "representative", "fullName")),
        ("tenantSince", V(r, "currentTenancy", "since")),
        ("hasSignedContract", V(r, "currentTenancy", "hasContract")),
        ("listing", Label(S(r, "listing", "status"), ChatLabels.Listing)));

    private static JsonObject TenantSummary(JsonNode x) => Obj(
        ("tenantId", V(x, "id")),
        ("code", V(x, "code")),
        ("fullName", V(x, "fullName")),
        ("phone", V(x, "phone")),
        ("email", V(x, "email")),
        ("residence", Label(S(x, "residenceStatus"), ChatLabels.Residence)),
        ("currentRoom", V(x, "currentTenancy", "room", "code")),
        ("currentProperty", V(x, "currentTenancy", "room", "propertyName")),
        ("role", Label(S(x, "currentTenancy", "role"), ChatLabels.TenancyRole)),
        ("outstandingAmount", V(x, "outstandingAmount")),
        ("overdueAmount", V(x, "overdueAmount")),
        ("depositHeld", V(x, "depositHeldTotal")),
        ("hasPortalAccount", V(x, "hasPortalAccount")));

    private static JsonObject ContractSummary(JsonNode x) => Obj(
        ("contractId", V(x, "id")),
        ("code", V(x, "code")),
        ("status", Label(S(x, "status"), ChatLabels.ContractStatus)),
        ("tenant", V(x, "tenant", "fullName")),
        ("tenantPhone", V(x, "tenant", "phone")),
        ("room", V(x, "room", "code")),
        ("property", V(x, "room", "propertyName")),
        ("startsOn", V(x, "startsOn")),
        ("lastDay", V(x, "displayEndOn")),
        ("daysLeft", V(x, "daysLeft")),
        ("expiringIn30Days", V(x, "expiring")),
        ("expiredButStillOccupied", V(x, "stillOccupiedAfterExpiry")),
        ("monthlyRent", V(x, "rent")),
        ("deposit", V(x, "deposit")));

    private static JsonObject? Reading(JsonNode? r) => r is null ? null : Obj(
        ("previous", V(r, "previous", "value")),
        ("previousAt", V(r, "previous", "observedAt")),
        ("current", V(r, "current", "value")),
        ("currentAt", V(r, "current", "observedAt")),
        ("consumption", V(r, "consumption")));
}
