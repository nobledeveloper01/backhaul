using System.Net;
using System.Net.Http.Json;

using Backhaul.Domain.Access;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Backhaul.Api.Tests;

/// <summary>
/// Its own application, with a limit small enough to reach.
/// </summary>
/// <remarks>
/// A separate factory because a fixed-window limiter is per-application state
/// and the partition is the client address: sharing <see cref="ApiFactory"/>
/// would spend the other share tests' budget and fail them at a distance.
/// </remarks>
public sealed class ThrottledApiFactory : WebApplicationFactory<Program>
{
    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureHostConfiguration(config =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimits:PublicSharePerHour"] = "3",
            }));
        return base.CreateHost(builder);
    }
}

public sealed class ShareRateLimitTests(ThrottledApiFactory factory)
    : IClassFixture<ThrottledApiFactory>
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    /// <summary>
    /// One test, two claims, in order.
    /// </summary>
    /// <remarks>
    /// Split in two they failed each other: a fixed-window limiter is
    /// per-application state and both tests share one application, so
    /// whichever ran second found the budget already spent. Two tests that
    /// pass only in one order are one test pretending to be two.
    /// </remarks>
    [Fact]
    public async Task A_flood_is_refused_and_does_not_take_the_authenticated_api_with_it()
    {
        // The only route that answers an unauthenticated request with a
        // truck's position. Guessing a 32-byte token is not the threat;
        // volume is. Phase 2's exit gate names this. See ADR-0010.
        var token = await IssueAsync();
        var stranger = factory.CreateClient();

        for (var i = 0; i < 3; i++)
        {
            var allowed = await stranger.GetAsync($"/v1/share/{token}");
            Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        }

        var refused = await stranger.GetAsync($"/v1/share/{token}");
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);

        // And a shipper watching their own trips does not lose the app because
        // somebody else is scraping links. The limit is on the public route
        // alone.
        var shipper = await Identities.IssueAsync(factory.Services, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());
        var trip = await OpenAsync(client);

        var mine = await client.GetAsync($"/v1/trips/{trip}");
        Assert.Equal(HttpStatusCode.OK, mine.StatusCode);
    }

    private async Task<string> IssueAsync()
    {
        var shipper = await Identities.IssueAsync(factory.Services, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());
        var trip = await OpenAsync(client);

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/share",
            new { scope = "position", label = "a flood", days = 14 });
        response.EnsureSuccessStatusCode();

        var issued = await response.Content.ReadFromJsonAsync<IssuedView>();
        return issued!.Token;
    }

    private static async Task<Guid> OpenAsync(HttpClient client)
    {
        var trip = Guid.NewGuid();
        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverPhone = Identities.NextPhone(),
                carrierPhone = Identities.NextPhone(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        response.EnsureSuccessStatusCode();
        return trip;
    }

    private sealed record IssuedView(Guid Id, string Token);
}
