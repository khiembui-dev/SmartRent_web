using SmartRent.Api.Common;
using SmartRent.Api.Features.Rooms;
namespace SmartRent.Api.Tests;
public class HousingLinksTests
{
    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://google.com.evil.invalid/maps")]
    [InlineData("http://www.google.com/maps")]
    [InlineData("https://user:pass@google.com/maps")]
    [InlineData("https://www.google.com:8080/maps")]
    public void RejectsUnsafeMapLinks(string value) => Assert.Throws<LeaseHttpException>(() => HousingLinks.Map(value));
    [Fact]
    public void KeepsSharedLinkAndOnlyAllowsGoogleEmbed()
    {
        Assert.Equal("https://maps.app.goo.gl/example", HousingLinks.Map("https://maps.app.goo.gl/example"));
        Assert.Null(HousingLinks.Map(" "));
        Assert.Throws<LeaseHttpException>(() => HousingLinks.Map("https://maps.app.goo.gl/example", true));
        Assert.Equal("https://www.google.com/maps/embed?pb=example", HousingLinks.Map("https://www.google.com/maps/embed?pb=example", true));
    }
}
