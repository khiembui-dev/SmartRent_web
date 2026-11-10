using System.Text.RegularExpressions;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.Contracts;

public static class ContractTenantRules
{
    public static void Validate(string? phone, DateOnly? dateOfBirth, DateOnly today)
    {
        var normalizedPhone = Regex.Replace(phone ?? "", @"[\s.-]", "");
        if (!Regex.IsMatch(normalizedPhone, @"^(\+84|0)[0-9]{9,10}$"))
            throw Invalid("Người đứng tên hợp đồng phải có số điện thoại Việt Nam hợp lệ.");
        if (dateOfBirth is null)
            throw Invalid("Cần nhập ngày sinh của người đứng tên hợp đồng.");
        if (dateOfBirth.Value.AddYears(18) > today)
            throw Invalid("Người đứng tên hợp đồng phải đủ 18 tuổi.");
    }

    internal static async Task ValidateAsync(NpgsqlConnection c, NpgsqlTransaction t, Guid tenant, CancellationToken ct)
    {
        var user = await Row(c, t, "select jsonb_build_object('phone',phone,'dateOfBirth',date_of_birth)::text from users where id=@id and role='user' and is_active for update", ct, "id", tenant);
        Validate(user.Text("phone"), DateOnly.TryParse(user.Text("dateOfBirth"), out var dob) ? dob : null, Today);
    }
}
