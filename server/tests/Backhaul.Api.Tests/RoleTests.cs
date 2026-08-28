using System.Net;
using System.Net.Http.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// The door into the demand side of the product. See ADR-0020.
/// </summary>
/// <remarks>
/// Signing in mints a driver and nothing changed a role, so the only shippers
/// that had ever existed were the ones this suite mints directly — and the
/// load board, the bid ranking and the award were all reachable from a test
/// and from nowhere else.
/// </remarks>
public sealed class RoleTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_new_account_can_say_it_is_a_shipper_and_then_post()
    {
        var who = await Identities.IssueAsync(factory, Role.Driver);
        var client = who.Carrying(factory.CreateClient());

        var said = await client.PutAsJsonAsync("/v1/me/role", new { role = "shipper" });
        Assert.Equal(HttpStatusCode.NoContent, said.StatusCode);

        /*
            The same token, immediately. No re-issue and no sign-in again.

            The role used to be stamped on the token, so somebody who said
            "shipper" stayed a driver for the life of that token — they chose,
            the account agreed, and the very next request refused them. The
            principal reads the account now: a role on a token is a stored copy
            of a fact that lives somewhere else, which is the argument this
            codebase already makes twice about tiers.
        */
        var posted = await client.PutAsJsonAsync(
            $"/v1/loads/{Guid.NewGuid()}",
            new
            {
                originName = "Lagos",
                destinationName = "Kano",
                originLat = 6.4531,
                originLon = 3.3958,
                destinationLat = 12.0022,
                destinationLon = 8.5919,
                cargo = "Cement",
                weightTonnes = 26.0,
                requires = "trailer_30t",
                offeredKobo = (long?)null,
                readyBy = DateTimeOffset.UtcNow,
                expiresAt = DateTimeOffset.UtcNow.AddDays(2),
            });

        Assert.Equal(HttpStatusCode.OK, posted.StatusCode);
    }

    [Fact]
    public async Task Once_you_are_on_a_trip_it_is_fixed()
    {
        // The condition that matters, and the reason it is not a clock:
        // `TripParties.Admit` matches role *and* id, so a role that moves
        // under an existing trip moves who can see it.
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());

        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{Guid.NewGuid()}",
            new
            {
                driverPhone = Identities.NextPhone(),
                carrierPhone = Identities.NextPhone(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        opened.EnsureSuccessStatusCode();

        var late = await client.PutAsJsonAsync("/v1/me/role", new { role = "driver" });

        Assert.Equal(HttpStatusCode.Conflict, late.StatusCode);
        Assert.Contains(
            "already on a trip or a load",
            await late.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task Nobody_can_make_themselves_a_reviewer()
    {
        // The one role that confers authority over other people's records.
        // ADR-0017 rests on it being unreachable from any public path, so it
        // is refused by the pattern on the request and by the parse behind it.
        var who = await Identities.IssueAsync(factory, Role.Driver);

        var tried = await who.Carrying(factory.CreateClient())
            .PutAsJsonAsync("/v1/me/role", new { role = "reviewer" });

        Assert.Equal(HttpStatusCode.BadRequest, tried.StatusCode);
    }

    [Fact]
    public async Task A_driver_posting_a_load_is_told_what_to_do_about_it()
    {
        // It answered "The server answered 404" — a create that 404s, for a
        // reason that is neither the load nor the request. A person reading
        // that has nothing to act on.
        var driver = await Identities.IssueAsync(factory, Role.Driver);

        var posted = await driver.Carrying(factory.CreateClient()).PutAsJsonAsync(
            $"/v1/loads/{Guid.NewGuid()}",
            new
            {
                originName = "Lagos",
                destinationName = "Kano",
                originLat = 6.4531,
                originLon = 3.3958,
                destinationLat = 12.0022,
                destinationLon = 8.5919,
                cargo = "Cement",
                weightTonnes = 26.0,
                requires = "trailer_30t",
                offeredKobo = (long?)null,
                readyBy = DateTimeOffset.UtcNow,
                expiresAt = DateTimeOffset.UtcNow.AddDays(2),
            });

        Assert.Equal(HttpStatusCode.BadRequest, posted.StatusCode);
        Assert.Contains(
            "Only a shipper can post a load",
            await posted.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }
}
