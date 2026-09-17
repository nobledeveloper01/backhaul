using System.Net;
using System.Net.Http.Json;

using Backhaul.Api.Contracts;
using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// A carrier hands a trip to a driver before the wheel turns (ADR-0021).
/// </summary>
public sealed class HandOverTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task The_carrier_hands_an_open_trip_to_a_driver_and_the_slot_moves()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();

        // Opened by the carrier, driving it themselves — the owner-operator
        // shape ADR-0019 opens every awarded load in.
        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverPhone = carrier.Phone,
                shipperPhone = Identities.NextPhone(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "carrier",
            });
        opened.EnsureSuccessStatusCode();

        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var handed = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/driver",
            new { driverPhone = driver.Phone });

        Assert.Equal(HttpStatusCode.OK, handed.StatusCode);
        var body = await handed.Content.ReadFromJsonAsync<TripResponse>();
        Assert.Equal(driver.UserId, body!.DriverId);
        Assert.Equal(carrier.UserId, body.CarrierId);

        // The driver can now see it; that is what the handover is for.
        var theirs = driver.Carrying(factory.CreateClient());
        Assert.Equal(HttpStatusCode.OK, (await theirs.GetAsync($"/v1/trips/{trip}")).StatusCode);

        // And the record of who drove is two rows, oldest first, from nobody.
        var drivers = await client.GetFromJsonAsync<List<TripDriverResponse>>($"/v1/trips/{trip}/drivers");
        Assert.Equal(2, drivers!.Count);
        Assert.Null(drivers[0].FromDriverId);
        Assert.Equal(carrier.UserId, drivers[0].DriverId);
        Assert.Equal(carrier.UserId, drivers[1].FromDriverId);
        Assert.Equal(driver.UserId, drivers[1].DriverId);
        Assert.Equal(carrier.UserId, drivers[1].ByUserId);
    }

    [Fact]
    public async Task Once_the_wheel_has_turned_the_handover_is_refused()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();
        (await client.PostAsJsonAsync($"/v1/trips/{trip}", Body(carrier))).EnsureSuccessStatusCode();

        foreach (var step in new[] { "assigned", "loading", "in_transit" })
        {
            (await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state = step, at = T0, actor = step == "in_transit" ? "driver" : "carrier" }))
                .EnsureSuccessStatusCode();
        }

        var handed = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/driver",
            new { driverPhone = Identities.NextPhone() });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, handed.StatusCode);
        Assert.Contains("has started", await handed.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_shipper_cannot_hand_over_and_a_stranger_sees_no_trip()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var trip = Guid.NewGuid();
        (await carrier.Carrying(factory.CreateClient())
            .PostAsJsonAsync($"/v1/trips/{trip}", Body(carrier, shipper.Phone)))
            .EnsureSuccessStatusCode();

        // The shipper can see the trip and still may not name its driver.
        var refused = await shipper.Carrying(factory.CreateClient()).PostAsJsonAsync(
            $"/v1/trips/{trip}/driver",
            new { driverPhone = Identities.NextPhone() });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, refused.StatusCode);

        // A stranger to the trip: 404, not 403 — the id must not be confirmed.
        var stranger = (await Identities.IssueAsync(factory, Role.Carrier)).Carrying(factory.CreateClient());
        var unseen = await stranger.PostAsJsonAsync(
            $"/v1/trips/{trip}/driver",
            new { driverPhone = Identities.NextPhone() });
        Assert.Equal(HttpStatusCode.NotFound, unseen.StatusCode);
    }

    [Fact]
    public async Task Handing_to_the_current_driver_is_a_mistake_not_a_no_op()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();
        (await client.PostAsJsonAsync($"/v1/trips/{trip}", Body(carrier))).EnsureSuccessStatusCode();

        var handed = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/driver",
            new { driverPhone = carrier.Phone });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, handed.StatusCode);
    }

    private static object Body(Identity carrier, string? shipperPhone = null) => new
    {
        driverPhone = carrier.Phone,
        shipperPhone = shipperPhone ?? Identities.NextPhone(),
        origin = "Lagos",
        destination = "Kano",
        at = T0,
        actor = "carrier",
    };
}
