using System.Reflection;
using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Tests;

public class ProjectStructureTests
{
    private static readonly Type[] Controllers = typeof(Program).Assembly.GetTypes()
        .Where(type => typeof(ControllerBase).IsAssignableFrom(type) && !type.IsAbstract)
        .ToArray();

    [Fact(DisplayName = "Có controller trong project")]
    public void ProjectHasControllers()
    {
        Assert.NotEmpty(Controllers);
    }

    [Fact(DisplayName = "Mọi controller nằm trong Features")]
    public void ControllersLiveInFeatures()
    {
        var wrong = Controllers
            .Where(type => type.Namespace?.StartsWith("SmartRent.Api.Features.") != true)
            .Select(type => type.FullName);

        Assert.Empty(wrong);
    }

    [Fact(DisplayName = "Mọi controller có đường dẫn bắt đầu bằng api/v1")]
    public void ControllersUseVersionedRoutes()
    {
        var wrong = Controllers
            .Where(type => type.GetCustomAttribute<RouteAttribute>()?.Template.StartsWith("api/v1") != true)
            .Select(type => type.FullName);

        Assert.Empty(wrong);
    }

    [Fact(DisplayName = "Hai controller không dùng chung đường dẫn gốc")]
    public void ControllerRoutesAreUnique()
    {
        var duplicated = Controllers
            .GroupBy(type => type.GetCustomAttribute<RouteAttribute>()?.Template)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key);

        Assert.Empty(duplicated);
    }
}
