using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
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

        // The per-address rate limits are raised, and only those.
        //
        // Every test in the suite shares one client address, so the real
        // limits — sixty share requests an hour, twenty sign-ins — are spent
        // by the fifteenth test and everything after it fails at a distance
        // with a 429 that has nothing to do with what it was testing. That
        // the limits *work* is proven separately, by a factory of its own that
        // sets them low enough to reach on purpose.
        builder.ConfigureHostConfiguration(config =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimits:PublicSharePerHour"] = "10000",
                ["RateLimits:PublicAuthPerHour"] = "10000",
            }));

        return base.CreateHost(builder);
    }
}
