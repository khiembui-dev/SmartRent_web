using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Payments;

internal static class PaymentLedger
{
    public static async Task<JsonObject?> Replay(NpgsqlConnection c, NpgsqlTransaction t, Guid user, string? key, string hash, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key))
            return null;
        if (key.Length > 200)
            throw Invalid("Mã yêu cầu quá dài.");
        await Execute(c, t, "select pg_advisory_xact_lock(hashtextextended(@key,0))", ct, "key", user + ":" + key);
        var old = await Scalar(c, t, "select to_jsonb(p)::text from payments p where user_id=@user and idempotency_key=@key", ct, "user", user, "key", key);
        if (old is null)
            return null;
        var row = JsonNode.Parse(old)!.AsObject();
        if (row.Text("request_hash") != hash)
            throw new LeaseHttpException(409, "idempotency_conflict", "Mã yêu cầu đã dùng với nội dung khác.");
        return row;
    }
    public static string Hash(JsonNode b) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(b.ToJsonString())));
    public static async Task<JsonObject> Append(NpgsqlConnection c, NpgsqlTransaction t, Guid actor, Guid user, Guid? contract, Guid? invoice, string kind, decimal amount, string? method, string? reference,
        JsonArray allocations, JsonArray? proofs, string? reason, string? notes, DateTimeOffset received, bool confirmed, string? key, string hash, CancellationToken ct, Guid? reverses = null)
    {
        if (amount <= 0 || amount != decimal.Truncate(amount))
            throw Invalid("Số tiền phải là số nguyên VND lớn hơn 0.");
        var previous = await Replay(c, t, user, key, hash, ct);
        if (previous is not null)
            return previous;
        if (method is not (null or "cash" or "bank_transfer"))
            throw Invalid("Phương thức thu tiền không hợp lệ.");
        if (method == "bank_transfer" && string.IsNullOrWhiteSpace(reference))
            throw Invalid("Cần mã giao dịch ngân hàng.");
        var id = Guid.NewGuid();
        await Execute(c, t, """
            insert into payments(id,code,user_id,contract_id,intended_invoice_id,kind,amount,method,external_reference,allocations,
              proof_file_ids,submitted_by,confirmed_by,confirmed_at,status,reason,notes,received_at,idempotency_key,request_hash,reverses_id)
            values(@id,next_code('PT'),@user,@contract,@invoice,@kind,@amount,@method,@ref,@alloc::jsonb,@proof::jsonb,@actor,
              @confirmedBy,case when @confirmed then now() else null end,@status,@reason,@notes,@received,nullif(@key,''),@hash,@reverse)
            """, ct, "id", id, "user", user, "contract", contract, "invoice", invoice, "kind", kind, "amount", amount, "method", method, "ref", reference, "alloc", allocations.ToJsonString(), "proof", (proofs ?? new()).ToJsonString(), "actor", actor,
            "confirmedBy", confirmed ? (object)actor : null, "confirmed", confirmed, "status", confirmed ? "confirmed" : "pending", "reason", reason, "notes", notes, "received", received, "key", key, "hash", hash, "reverse", reverses);
        return await Row(c, t, "select to_jsonb(p)::text from payments p where id=@id", ct, "id", id);
    }
    public static JsonObject Dto(JsonObject p) => new()
    {
        ["id"] = p.Id("id"),
        ["code"] = p.Text("code"),
        ["amount"] = Copy(p["amount"]),
        ["kind"] = p.Text("kind"),
        ["status"] = p.Text("status"),
        ["methodCode"] = p.Text("method"),
        ["receivedAt"] = Copy(p["received_at"]),
        ["confirmedAt"] = Copy(p["confirmed_at"]),
        ["externalReference"] = p.Text("external_reference"),
        ["allocations"] = Copy(p["allocations"]),
        ["notes"] = p.Text("notes")
    };
}
