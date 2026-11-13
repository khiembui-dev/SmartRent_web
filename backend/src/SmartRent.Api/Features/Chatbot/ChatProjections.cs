using System.Globalization;
using System.Text.Json.Nodes;
using static SmartRent.Api.Features.Chatbot.ChatJson;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>
/// Chọn trường gửi cho mô hình từ JSON của API hiện có. Số tiền được sao chép nguyên giá trị do SQL tính
/// (view v_invoice_balances, v_deposit_balances); ở đây không cộng trừ tiền. Không gửi giấy tờ tùy thân,
/// ghi chú nội bộ của hồ sơ khách, mật khẩu hay token.
/// </summary>
internal static class ChatProjections
{
    public static JsonNode? PeriodLabel(JsonNode? invoice)
    {
        if (S(invoice, "period", "label") is { } label)
            return label;
        return DateOnly.TryParse(S(invoice, "period", "monthStart"), CultureInfo.InvariantCulture, out var month)
            ? $"Tháng {month:MM/yyyy}" : null;
    }

    /// <summary>Ngày kết thúc trong database không tính (khoảng [từ, đến)); giao diện hiển thị ngày trước đó.</summary>
    public static JsonNode? LastDay(JsonNode? node, string key) =>
        DateOnly.TryParse(S(node, key), CultureInfo.InvariantCulture, out var day)
            ? day.AddDays(-1).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null;

    public static JsonObject InvoiceSummary(JsonNode item, bool includeTenant) => Obj(
        ("id", V(item, "id")),
        ("code", V(item, "code")),
        ("kind", Label(S(item, "kind"), ChatLabels.InvoiceKind)),
        ("status", Label(S(item, "status"), ChatLabels.InvoiceStatus)),
        ("period", PeriodLabel(item)),
        ("room", V(item, "room", "code")),
        ("property", V(item, "property", "name")),
        ("tenant", includeTenant ? V(item, "representative", "fullName") : null),
        ("tenantPhone", includeTenant ? V(item, "representative", "phoneNumber") : null),
        ("serviceFrom", V(item, "serviceFrom")),
        ("serviceThrough", LastDay(item, "serviceTo")),
        ("issuedOn", V(item, "issuedOn")),
        ("dueOn", V(item, "dueOn")),
        ("receivableAmount", V(item, "receivableAmount")),
        ("paidAmount", V(item, "paidAmount")),
        ("outstandingAmount", V(item, "outstandingAmount")),
        ("paymentStatus", Label(S(item, "paymentStatus"), ChatLabels.PaymentStatus)),
        ("isOverdue", V(item, "isOverdue")),
        ("daysOverdue", B(item, "isOverdue") ? V(item, "daysOverdue") : null),
        ("pendingReportedAmount", HasPositive(item, "pendingPaymentAmount") ? V(item, "pendingPaymentAmount") : null));

    /// <summary>Chi tiết từ InvoiceData.Get: dòng tiền, chỉ số điện nước và các lần thanh toán đã phân bổ.</summary>
    public static JsonObject InvoiceDetail(JsonNode d, bool includeTenant)
    {
        var lines = Items(d, "lines").Select(l => (JsonNode?)Obj(
            ("description", V(l, "description") ?? V(l, "name")),
            ("category", V(l, "category")),
            ("quantity", V(l, "quantity")),
            ("unit", V(l, "unit") ?? V(l, "unitLabel")),
            ("unitPrice", V(l, "unitPrice")),
            ("amount", V(l, "amount")),
            ("isDeduction", S(l, "sign") == "-1" ? JsonValue.Create(true) : null)));
        var meters = Items(d, "meterSegments").Select(m => (JsonNode?)Obj(
            ("meter", V(m, "serialNumber")),
            ("startReading", V(m, "startValue")),
            ("endReading", V(m, "endValue"))));
        var payments = Items(d, "allocations").Select(a => (JsonNode?)Obj(
            ("paymentCode", V(a, "payment", "code")),
            ("method", Label(S(a, "payment", "methodCode"), ChatLabels.PaymentMethod)),
            ("type", S(a, "kind") == "reverse" ? "Hoàn tác" : S(a, "source") == "deposit_offset" ? "Cấn trừ cọc" : "Thanh toán"),
            ("amount", V(a, "amount")),
            ("at", V(a, "allocatedAt"))));
        var pending = Items(d, "pendingPayments").Select(p => (JsonNode?)Obj(
            ("paymentCode", V(p, "code")),
            ("amount", V(p, "amount")),
            ("reportedAt", V(p, "receivedAt")),
            ("status", "Chờ chủ trọ xác minh")));
        return Obj(
            ("id", V(d, "id")),
            ("code", V(d, "code")),
            ("kind", Label(S(d, "kind"), ChatLabels.InvoiceKind)),
            ("status", Label(S(d, "status"), ChatLabels.InvoiceStatus)),
            ("period", PeriodLabel(d)),
            ("room", V(d, "room", "code")),
            ("property", V(d, "property", "name")),
            ("tenant", includeTenant ? V(d, "representative", "fullName") : null),
            ("tenantPhone", includeTenant ? V(d, "representative", "phone") : null),
            ("serviceFrom", V(d, "serviceFrom")),
            ("serviceThrough", LastDay(d, "serviceTo")),
            ("issuedOn", V(d, "issuedOn")),
            ("dueOn", V(d, "dueOn")),
            ("lines", Arr(lines)),
            ("meterReadings", Arr(meters)),
            ("invoiceTotal", V(d, "totalAmount")),
            ("receivableAmount", V(d, "receivableAmount")),
            ("paidAmount", V(d, "paidAmount")),
            ("outstandingAmount", V(d, "outstandingAmount")),
            ("paymentStatus", Label(S(d, "paymentStatus"), ChatLabels.PaymentStatus)),
            ("isOverdue", V(d, "isOverdue")),
            ("daysOverdue", B(d, "isOverdue") ? V(d, "daysOverdue") : null),
            ("payments", Arr(payments)),
            ("pendingReportedPayments", Arr(pending)),
            ("voidReason", Clip(S(d, "voidReason"), 200)));
    }

    public static JsonObject Payment(JsonNode p) => Obj(
        ("code", V(p, "code")),
        ("type", Label(S(p, "kind"), ChatLabels.PaymentKind)),
        ("status", Label(S(p, "status"), ChatLabels.PaymentState)),
        ("method", Label(S(p, "methodCode"), ChatLabels.PaymentMethod)),
        ("amount", V(p, "amount")),
        ("receivedAt", V(p, "receivedAt")),
        ("confirmedAt", V(p, "confirmedAt")),
        ("bankReference", V(p, "externalReference")),
        ("reason", Clip(S(p, "reason"), 200)));

    public static JsonObject TicketSummary(JsonNode t) => Obj(
        ("id", V(t, "id")),
        ("code", V(t, "code")),
        ("title", Clip(S(t, "title"), 160)),
        ("category", V(t, "category", "name")),
        ("priority", Label(S(t, "priority"), ChatLabels.Priority)),
        ("status", Label(S(t, "status"), ChatLabels.TicketStatus)),
        ("room", V(t, "room", "code")),
        ("property", V(t, "room", "propertyName")),
        ("isOverdue", V(t, "isOverdue")),
        ("dueAt", V(t, "dueAt")),
        ("createdAt", V(t, "createdAt")));

    public static JsonObject TicketDetail(JsonNode t)
    {
        var detail = TicketSummary(t);
        detail["description"] = Clip(S(t, "description"), 800);
        detail["reportedBy"] = V(t, "reportedBy", "displayName");
        detail["assignedTo"] = V(t, "assignedTo", "displayName");
        detail["resolvedAt"] = V(t, "resolvedAt");
        detail["resolutionNotes"] = Clip(S(t, "resolutionNotes"), 400);
        detail["recentMessages"] = Arr(Items(t, "messages").TakeLast(5).Select(m => (JsonNode?)Obj(
            ("from", V(m, "author", "displayName")),
            ("internalNote", B(m, "isInternal") ? JsonValue.Create(true) : null),
            ("body", Clip(S(m, "body"), 300)),
            ("at", V(m, "createdAt")))));
        return detail;
    }

    public static JsonObject Rate(JsonNode r) => Obj(
        ("name", V(r, "name") ?? V(r, "chargeType", "name")),
        ("unitPrice", V(r, "unitPrice")),
        ("unit", V(r, "unit") ?? V(r, "chargeType", "unitLabel")),
        ("method", S(r, "method") switch { "metered" => "Theo chỉ số", "per_quantity" => "Theo số lượng", "fixed" => "Cố định", var m => m }),
        ("cycle", S(r, "cycle") ?? S(r, "billingCycle")),
        ("effectiveFrom", V(r, "effectiveFrom")));

    /// <summary>Phiên bản hợp đồng: bản đã ký mới là căn cứ tính tiền.</summary>
    public static JsonObject ContractVersion(JsonNode v) => Obj(
        ("versionNo", V(v, "versionNo")),
        ("effectiveFrom", V(v, "effectiveFrom")),
        ("lastDay", LastDay(v, "endsOn")),
        ("signed", V(v, "isSigned")),
        ("signedAt", V(v, "signedAt")),
        ("requiredDeposit", V(v, "requiredDeposit")),
        ("invoiceDay", V(v, "invoiceDay")),
        ("dueAfterDays", V(v, "dueAfterDays")),
        ("rates", Arr(Items(v, "rates").Select(r => (JsonNode?)Rate(r)))));

    private static bool HasPositive(JsonNode? node, string key) =>
        decimal.TryParse(S(node, key), NumberStyles.Number, CultureInfo.InvariantCulture, out var value) && value > 0;
}
