using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// Whether the truck is going somewhere it should not be.
/// </summary>
/// <remarks>
/// The engine is held by <c>ParityTests</c>. What is tested here is the thing
/// parity cannot see: that `unknown` is a real answer, and that the route
/// declares the destination rather than the controller assuming one.
/// </remarks>
public sealed class DeviationEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private const double LagosLat = 6.4531;
    private const double LagosLon = 3.3958;
    private const double KanoLat = 12.0022;
    private const double KanoLon = 8.5919;

    [Fact]
    public async Task With_no_route_declared_there_is_nothing_to_be_off()
    {
        // Different from being on course, and the sentence says which. A tick
        // here would be the server reassuring a shipper on the strength of
        // nothing.
        var (trip, client) = await DrivenAsync();

        var view = await client.GetFromJsonAsync<DeviationView>($"/v1/trips/{trip}/deviation", Json);

        Assert.Equal("unknown", view!.Kind);
        Assert.Contains("nothing to be off", view.Detail!, StringComparison.Ordinal);
        Assert.Null(view.OffRoute);
    }

    [Fact]
    public async Task A_dead_zone_is_not_a_course_change()
    {
        // Two fixes ninety minutes apart is a coverage gap. Calling it a
        // deviation turns a fact about Nigerian network infrastructure into an
        // accusation against a driver.
        var (trip, client) = await DrivenAsync();
        await PutRouteAsync(client, trip);

        var view = await client.GetFromJsonAsync<DeviationView>($"/v1/trips/{trip}/deviation", Json);

        Assert.Equal("unknown", view!.Kind);
    }

    [Fact]
    public async Task A_truck_closing_on_its_destination_is_on_course()
    {
        var (trip, client) = await DrivenAsync();
        await PutRouteAsync(client, trip);
        await DriveTowardAsync(client, trip, closing: true);

        var view = await client.GetFromJsonAsync<DeviationView>($"/v1/trips/{trip}/deviation", Json);

        Assert.Equal("on_course", view!.Kind);
        Assert.Null(view.Detail);
    }

    [Fact]
    public async Task And_one_that_turned_around_is_reported_with_the_distance()
    {
        var (trip, client) = await DrivenAsync();
        await PutRouteAsync(client, trip);
        await DriveTowardAsync(client, trip, closing: false);

        var view = await client.GetFromJsonAsync<DeviationView>($"/v1/trips/{trip}/deviation", Json);

        Assert.Equal("deviating", view!.Kind);
        Assert.NotNull(view.FurtherM);
        Assert.Contains("further from the destination", view.Detail!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Somebody_elses_trip_is_a_404()
    {
        var (trip, _) = await DrivenAsync();

        var stranger = await Identities.IssueAsync(factory, Role.Shipper);
        var response = await stranger.Carrying(factory.CreateClient())
            .GetAsync($"/v1/trips/{trip}/deviation");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Trip, HttpClient Client)> DrivenAsync()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();
        var start = DateTimeOffset.UtcNow.AddHours(-6);

        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverId = driver.UserId,
                carrierId = Guid.NewGuid(),
                shipperId = Guid.NewGuid(),
                origin = "Lagos",
                destination = "Kano",
                at = start,
                actor = "shipper",
            });
        opened.EnsureSuccessStatusCode();

        foreach (var (state, minutes) in new[] { ("assigned", 1), ("loading", 2), ("in_transit", 3) })
        {
            var response = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = start.AddMinutes(minutes), actor = "driver" });
            response.EnsureSuccessStatusCode();
        }

        return (trip, client);
    }

    private static async Task PutRouteAsync(HttpClient client, Guid trip)
    {
        var response = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/waypoints",
            new[]
            {
                new { name = "Lagos depot", kind = "origin", lat = LagosLat, lon = LagosLon, radiusM = 400.0 },
                new { name = "Kano market", kind = "destination", lat = KanoLat, lon = KanoLon, radiusM = 400.0 },
            });
        response.EnsureSuccessStatusCode();
    }

    /// <summary>Ten fixes across the last eighty-five minutes, one way or the other.</summary>
    private static async Task DriveTowardAsync(HttpClient client, Guid trip, bool closing)
    {
        // Halfway to Kano, then either onward or back the way it came.
        var (fromLat, fromLon) = closing ? (9.0, 6.0) : (10.5, 7.4);
        var (toLat, toLon) = closing ? (10.5, 7.4) : (7.4, 3.9);

        var samples = new List<object>();
        for (var i = 0; i < 10; i++)
        {
            var t = i / 9.0;
            samples.Add(new
            {
                id = Guid.NewGuid(),
                lat = fromLat + (toLat - fromLat) * t,
                lon = fromLon + (toLon - fromLon) * t,
                accuracy = 10.0,
                at = DateTimeOffset.UtcNow.AddMinutes(-85 + 85 * t),
            });
        }

        var response = await client.PostAsJsonAsync(
            "/v1/tracking/batch",
            new { batchId = Guid.NewGuid(), tripId = trip, samples });
        response.EnsureSuccessStatusCode();
    }

    private sealed record DeviationView(
        string Kind,
        string? Detail,
        double? FurtherM,
        long? SinceMs,
        bool? OffRoute,
        string? HeadingFor);
}
