using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// Phase 3's exit gate, in one file.
/// </summary>
/// <remarks>
/// <para>
/// "Tier gates enforced server-side and proven unbypassable from a modified
/// client." A modified client is not a special kind of request — it is any
/// request, sending anything it likes. These tests are that client: they call
/// the real endpoints with a real token and put whatever they want in the
/// body.
/// </para>
/// <para>
/// The gate holds because nothing in a bid touches the bidder's tier. It is
/// computed at bid time out of papers a reviewer confirmed and a record
/// counted from trips, neither of which the caller can write. See ADR-0017.
/// </para>
/// </remarks>
public sealed class TierGateTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json =
        new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_carrier_below_the_bar_is_refused_and_told_why()
    {
        var (load, _) = await PostAsync(requiresTier: "verified");
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);

        var response = await Bid(carrier, load);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);

        // A dead end is a defect. The message names the bar and where they
        // stand, which is the only thing that tells them what to do next.
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("verified", body, StringComparison.Ordinal);
        Assert.Contains("unverified", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Claiming_every_paper_does_not_get_past_it()
    {
        // The bypass that existed before ADR-0017, attempted directly. Four
        // calls the carrier is entitled to make, no client involved, and the
        // old ladder would have made them Trusted.
        var (load, _) = await PostAsync(requiresTier: "verified");
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        foreach (var paper in new[] { "identity", "licence", "registration", "insurance" })
        {
            var claimed = await client.PutAsJsonAsync(
                $"/v1/me/verification/{paper}",
                new { held = true });
            claimed.EnsureSuccessStatusCode();
        }

        var response = await Bid(carrier, load);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Nothing_in_the_request_can_raise_your_own_tier()
    {
        // The modified client, being as inventive as the wire allows: fields
        // the contract does not have, asserting the tier outright. They are
        // not read, because the tier is never read from a request — it is
        // computed from two things the caller cannot write.
        var (load, _) = await PostAsync(requiresTier: "trusted");
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);

        var response = await carrier.Carrying(factory.CreateClient()).PutAsJsonAsync(
            $"/v1/loads/{load}/bid",
            new
            {
                amountKobo = 90_000_000L,
                atLat = 6.4531,
                atLon = 3.3958,
                tier = "trusted",
                requiresTier = "unverified",
                verifiedIdentity = true,
                verifiedLicence = true,
                verifiedRegistration = true,
                verifiedInsurance = true,
                tripsCompleted = 500,
                tripsOnTime = 500,
            });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task A_reviewer_is_what_opens_the_gate()
    {
        // The other half: the gate must let the right carrier through, or it
        // is not a gate, it is a wall. Same carrier, same load, same request —
        // the only thing that changes is that somebody looked at the papers.
        var (load, _) = await PostAsync(requiresTier: "verified");
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        foreach (var paper in new[] { "identity", "licence" })
        {
            await client.PutAsJsonAsync($"/v1/me/verification/{paper}", new { held = true });
        }

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Bid(carrier, load)).StatusCode);

        var reviewer = await Identities.IssueAsync(factory, Role.Reviewer);
        var desk = reviewer.Carrying(factory.CreateClient());
        foreach (var paper in new[] { "identity", "licence" })
        {
            var confirmed = await desk.PutAsJsonAsync(
                $"/v1/verification/{carrier.UserId}/{paper}",
                new { held = true });
            confirmed.EnsureSuccessStatusCode();
        }

        Assert.Equal(HttpStatusCode.OK, (await Bid(carrier, load)).StatusCode);
    }

    [Fact]
    public async Task A_load_with_no_bar_takes_anybodys_bid()
    {
        // The default, and it has to stay the default: a bar is a shipper
        // narrowing their own market, and a platform that applies one nobody
        // asked for has quietly decided who gets to work.
        var (load, _) = await PostAsync(requiresTier: null);
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);

        Assert.Equal(HttpStatusCode.OK, (await Bid(carrier, load)).StatusCode);
    }

    [Fact]
    public async Task A_reviewer_can_see_nothing_else()
    {
        // The role exists to confirm papers. If it could also read trips it
        // would be an admin account by another name, and the argument for
        // minting one would have to be made again on different ground.
        var (load, shipper) = await PostAsync(requiresTier: null);
        var reviewer = await Identities.IssueAsync(factory, Role.Reviewer);
        var desk = reviewer.Carrying(factory.CreateClient());

        var trip = Guid.NewGuid();
        var opened = await shipper.PostAsJsonAsync(
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
        opened.EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NotFound, (await desk.GetAsync($"/v1/trips/{trip}")).StatusCode);

        var mine = await desk.GetFromJsonAsync<List<object>>("/v1/trips", Json);
        Assert.Empty(mine!);

        // And cannot bid, which is a carrier's act.
        Assert.Equal(HttpStatusCode.NotFound, (await Bid(reviewer, load)).StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private Task<HttpResponseMessage> Bid(Identity carrier, Guid load) =>
        carrier.Carrying(factory.CreateClient()).PutAsJsonAsync(
            $"/v1/loads/{load}/bid",
            new { amountKobo = 90_000_000L, atLat = 6.4531, atLon = 3.3958 });

    private async Task<(Guid Load, HttpClient Shipper)> PostAsync(string? requiresTier)
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());
        var load = Guid.NewGuid();

        var response = await client.PutAsJsonAsync(
            $"/v1/loads/{load}",
            new
            {
                originName = "Lagos",
                destinationName = "Kano",
                originLat = 6.4531,
                originLon = 3.3958,
                destinationLat = 12.0022,
                destinationLon = 8.5919,
                cargo = "Cement",
                weightTonnes = 28.0,
                requires = "trailer_30t",
                offeredKobo = (long?)null,
                requiresTier,
                // Against the wall clock, not T0: the API has a real
                // TimeProvider and a load that expired in March takes no bids
                // at all, which would let these tests pass for the wrong
                // reason — refused by expiry rather than by the bar.
                readyBy = DateTimeOffset.UtcNow,
                expiresAt = DateTimeOffset.UtcNow.AddDays(2),
            });
        response.EnsureSuccessStatusCode();

        return (load, client);
    }
}
