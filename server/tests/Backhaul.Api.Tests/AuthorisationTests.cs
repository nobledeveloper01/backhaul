using System.Net;
using System.Net.Http.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// Who can see what.
/// </summary>
/// <remarks>
/// The most security-critical tests in the repository. A truck's location
/// history is exactly what somebody planning a cargo theft would want, and the
/// product statement lists theft-by-platform as a live risk. See ADR-0008.
/// </remarks>
public sealed class AuthorisationTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Healthz_needs_no_token()
    {
        // A load balancer should not need a credential to find out whether the
        // process is up.
        var response = await factory.CreateClient().GetAsync("/healthz");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Everything_else_does()
    {
        var anonymous = factory.CreateClient();

        foreach (var path in new[]
                 {
                     $"/v1/trips/{Guid.NewGuid()}",
                     $"/v1/tracking/trip/{Guid.NewGuid()}/track",
                     "/v1/pricing/quote?truck=canter&distanceMetres=1000",
                 })
        {
            var response = await anonymous.GetAsync(path);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Fact]
    public async Task A_token_that_is_not_a_token_is_refused()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Authorization", "Bearer nonsense");

        var response = await client.GetAsync($"/v1/trips/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task An_expired_token_is_refused()
    {
        // Expiry is part of the lookup rather than a check after it, so there
        // is no query that resolves an expired token by accident.
        var stale = await Identities.IssueExpiredAsync(factory, Role.Driver);
        var client = stale.Carrying(factory.CreateClient());

        var response = await client.GetAsync($"/v1/trips/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task All_three_parties_can_read_a_trip()
    {
        var (trip, driver, carrier, shipper) = await OpenTripAsync();

        foreach (var party in new[] { driver, carrier, shipper })
        {
            var response = await party.Carrying(factory.CreateClient()).GetAsync($"/v1/trips/{trip}");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }

    [Fact]
    public async Task A_fourth_party_cannot_read_it_and_is_told_it_does_not_exist()
    {
        // Not 403. The existence of a trip id is itself information and a 403
        // confirms it — a shipper probing ids learns nothing either way.
        var (trip, _, _, _) = await OpenTripAsync();
        var stranger = await Identities.IssueAsync(factory, Role.Carrier);

        var response = await stranger.Carrying(factory.CreateClient()).GetAsync($"/v1/trips/{trip}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_fourth_party_cannot_read_the_track_either()
    {
        // The thing actually worth stealing.
        var (trip, driver, _, _) = await OpenTripAsync();
        await DriveAsync(trip, driver);
        await PostSampleAsync(trip, driver);

        var stranger = await Identities.IssueAsync(factory, Role.Shipper);
        var response = await stranger
            .Carrying(factory.CreateClient())
            .GetAsync($"/v1/tracking/trip/{trip}/track");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Only_the_driver_may_report_positions()
    {
        // A carrier watching the truck and a shipper watching their goods can
        // both read the track. Neither can write to it: a position history a
        // second party can append to is not evidence of anything.
        var (trip, driver, carrier, shipper) = await OpenTripAsync();
        await DriveAsync(trip, driver);

        Assert.Equal(HttpStatusCode.OK, (await PostSampleAsync(trip, driver)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PostSampleAsync(trip, carrier)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PostSampleAsync(trip, shipper)).StatusCode);
    }

    [Fact]
    public async Task A_fourth_party_cannot_move_a_trip_through_its_states()
    {
        var (trip, _, _, _) = await OpenTripAsync();
        var stranger = await Identities.IssueAsync(factory, Role.Driver);

        var response = await stranger.Carrying(factory.CreateClient()).PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state = "assigned", at = T0.AddMinutes(10), actor = "driver" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task You_cannot_open_a_trip_you_are_not_on()
    {
        // Otherwise it is possible to create a record and immediately lose it.
        var caller = await Identities.IssueAsync(factory, Role.Shipper);

        var response = await caller.Carrying(factory.CreateClient()).PostAsJsonAsync(
            $"/v1/trips/{Guid.NewGuid()}",
            new
            {
                driverId = Guid.NewGuid(),
                carrierId = Guid.NewGuid(),
                shipperId = Guid.NewGuid(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_id_already_taken_conflicts_even_when_you_cannot_see_it()
    {
        // The one unfiltered query, and the reason it exists: without it two
        // shippers could be handed the same id because neither can see the
        // other's trip, and the second write would fail on the primary key
        // with a message about nothing.
        var (trip, _, _, _) = await OpenTripAsync();
        var stranger = await Identities.IssueAsync(factory, Role.Shipper);

        var response = await stranger.Carrying(factory.CreateClient()).PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverId = Guid.NewGuid(),
                carrierId = Guid.NewGuid(),
                shipperId = stranger.UserId,
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Trip, Identity Driver, Identity Carrier, Identity Shipper)> OpenTripAsync()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);

        var trip = Guid.NewGuid();
        var response = await shipper.Carrying(factory.CreateClient()).PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverId = driver.UserId,
                carrierId = carrier.UserId,
                shipperId = shipper.UserId,
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        response.EnsureSuccessStatusCode();

        return (trip, driver, carrier, shipper);
    }

    private async Task DriveAsync(Guid trip, Identity driver)
    {
        var client = driver.Carrying(factory.CreateClient());
        foreach (var (state, minutes) in new[] { ("assigned", 1), ("loading", 2), ("in_transit", 3) })
        {
            var response = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = T0.AddMinutes(minutes), actor = "driver" });
            response.EnsureSuccessStatusCode();
        }
    }

    private Task<HttpResponseMessage> PostSampleAsync(Guid trip, Identity who) =>
        who.Carrying(factory.CreateClient()).PostAsJsonAsync(
            "/v1/tracking/batch",
            new
            {
                batchId = Guid.NewGuid(),
                tripId = trip,
                samples = new[]
                {
                    new
                    {
                        id = Guid.NewGuid(),
                        lat = 6.455,
                        lon = 3.3841,
                        accuracy = 10.0,
                        at = T0.AddMinutes(5),
                    },
                },
            });
}
