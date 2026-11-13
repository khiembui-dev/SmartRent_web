using SmartRent.Api.Common;
using SmartRent.Api.Features.Contracts;

namespace SmartRent.Api.Tests;

public class ContractTenantRulesTests
{
    private static readonly DateOnly Today = new(2026, 11, 10);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("12345")]
    public void RequiresValidPhone(string? phone) => Assert.Throws<LeaseHttpException>(() =>
        ContractTenantRules.Validate(phone, new DateOnly(2000, 1, 1), Today));

    [Fact]
    public void AllowsMissingBirthDate() =>
        ContractTenantRules.Validate("0901234567", null, Today);

    [Fact]
    public void RejectsDayBeforeEighteenthBirthday() => Assert.Throws<LeaseHttpException>(() =>
        ContractTenantRules.Validate("0901234567", new DateOnly(2008, 11, 11), Today));

    [Fact]
    public void AcceptsEighteenthBirthday() =>
        ContractTenantRules.Validate("+84 901.234.567", new DateOnly(2008, 11, 10), Today);

    [Fact]
    public void LeapDayBirthdayUsesLastDayOfFebruary() =>
        ContractTenantRules.Validate("0901234567", new DateOnly(2008, 2, 29), new DateOnly(2026, 2, 28));
}
