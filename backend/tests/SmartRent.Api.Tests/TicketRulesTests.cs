using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Tests;

// Các ca này kiểm tra quy tắc nghiệp vụ, đặc biệt không cho bỏ qua xác nhận/trạng thái trung gian.
public class TicketRulesTests
{
    [Theory]
    [InlineData("new","accept","accepted")]
    [InlineData("new","start","in_progress")]
    [InlineData("in_progress","wait","waiting")]
    [InlineData("waiting","resume","in_progress")]
    [InlineData("waiting","resolve","resolved")]
    [InlineData("resolved","close","closed")]
    [InlineData("closed","reopen","accepted")]
    public void AllowedTransitions(string from,string action,string to) =>
        Assert.Equal(to,TicketRules.NextStatus(from,action));

    [Theory]
    [InlineData("new","close")]
    [InlineData("new","resolve")]
    [InlineData("closed","start")]
    [InlineData("accepted","reopen")]
    public void InvalidTransitionReturnsConflict(string from,string action) =>
        Assert.Equal(409,Assert.Throws<TicketException>(()=>TicketRules.NextStatus(from,action)).Status);

    [Theory]
    [InlineData("low",120)]
    [InlineData("normal",48)]
    [InlineData("high",24)]
    [InlineData("urgent",4)]
    public void SlaMeasuredInUtcHours(string priority,int hours)
    {
        var start=new DateTime(2026,11,6,0,0,0,DateTimeKind.Utc);
        Assert.Equal(hours,(TicketRules.DueAt(priority,start)-start).TotalHours);
    }
}
