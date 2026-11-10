using SmartRent.Api.Common;
using SmartRent.Api.Features.Viewings;

namespace SmartRent.Api.Tests;

public class ViewingRulesTests
{
    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(3)]
    [InlineData(10)]
    public void RejectsOccupantsOutsideRoomCapacity(int? occupants)
    {
        var error = Assert.Throws<LeaseHttpException>(() => ViewingRules.ValidateOccupants((short?)occupants, 2));
        Assert.Equal(422, error.Status);
        Assert.Equal("invalid_occupants", error.Code);
    }

    [Fact]
    public void AllowsRoomCapacity() => ViewingRules.ValidateOccupants(2, 2);

    [Theory]
    [InlineData(null)]
    [InlineData("2026-11-08T19:00:00+07:00")]
    [InlineData("2026-11-09T10:00:00+07:00")]
    [InlineData("2026-11-09T20:01:00+07:00")]
    [InlineData("2026-11-10T20:01:00+07:00")]
    [InlineData("2026-11-10T23:00:00+07:00")]
    public void RejectsPastMissingAndLateStarts(string? startsAt)
    {
        var now = DateTimeOffset.Parse("2026-11-09T10:00:00+07:00");
        Assert.Equal(422, Assert.Throws<LeaseHttpException>(() => ViewingRules.ValidateTime(
            startsAt is null ? null : DateTimeOffset.Parse(startsAt), now)).Status);
    }

    [Theory]
    [InlineData("2026-11-09T19:59:00+07:00", "2026-11-09T10:00:00+07:00")]
    [InlineData("2026-11-09T12:59:00Z", "2026-11-09T03:00:00Z")]
    [InlineData("2026-11-10T00:00:00+07:00", "2026-11-09T20:01:00+07:00")]
    [InlineData("2026-11-10T10:00:00+07:00", "2026-11-09T23:59:00+07:00")]
    public void AllowsFutureStartsBeforeVietnamCutoff(string startsAt, string now) =>
        ViewingRules.ValidateTime(DateTimeOffset.Parse(startsAt), DateTimeOffset.Parse(now));

    [Theory]
    [InlineData("2026-11-10T21:01:00+07:00")]
    [InlineData("2026-11-11T00:00:00+07:00")]
    [InlineData("2026-11-10T19:29:00+07:00")]
    public void RejectsAppointmentsEndingOutsideViewingHours(string endsAt) =>
        Assert.Throws<LeaseHttpException>(() => ViewingRules.ValidateTime(
            DateTimeOffset.Parse("2026-11-10T19:30:00+07:00"), DateTimeOffset.Parse("2026-11-09T10:00:00Z"), DateTimeOffset.Parse(endsAt)));

    [Fact]
    public void AllowsAppointmentStarting20Ending21() => ViewingRules.ValidateTime(
        DateTimeOffset.Parse("2026-11-10T20:00:00+07:00"), DateTimeOffset.Parse("2026-11-09T10:00:00Z"), DateTimeOffset.Parse("2026-11-10T21:00:00+07:00"));
}
