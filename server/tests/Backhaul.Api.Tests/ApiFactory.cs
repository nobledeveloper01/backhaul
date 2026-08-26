using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;

namespace Backhaul.Api.Tests;

/// <summary>
/// Boots the real application, with the in-memory store it already defaults to.
/// </summary>
/// <remarks>
/// No service is replaced. The point of these tests is the behaviour a device
/// actually meets, and a suite that swaps out half the pipeline tests a
/// different application from the one that ships.
/// </remarks>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        return base.CreateHost(builder);
    }
}
