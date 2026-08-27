using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// The load board, and the bids on it.
/// </summary>
/// <remarks>
/// The ranking arithmetic is held by <c>ParityTests</c>. What is tested here
/// is what parity cannot see: who may read what, what leaves the board, and
/// that a load which cannot be taken still comes back with its reason rather
/// than disappearing.
/// </remarks>
public sealed class MarketEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private const double LagosLat = 6.4531;
    private const double LagosLon = 3.3958;
    private const double IbadanLat = 7.3775;
    private const double IbadanLon = 3.947;
    private const double KanoLat = 12.0022;
    private const double KanoLon = 8.5919;

    [Fact]
    public async Task A_carrier_cannot_post_a_load()
    {
        // The board is a shipper's side of the market. A carrier posting loads
        // to it would be a carrier advertising for a subcontractor, which is a
        // different product.
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        var response = await client.PutAsJsonAsync($"/v1/loads/{Guid.NewGuid()}", Load());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_load_that_expires_before_it_is_ready_is_refused()
    {
        var (_, client) = await ShipperAsync();

        var response = await client.PutAsJsonAsync(
            $"/v1/loads/{Guid.NewGuid()}",
            Load(readyInHours: 48, expiresInHours: 6));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_load_that_cannot_be_taken_still_comes_back_with_its_reason()
    {
        // Greyed with the reason, not hidden. A carrier who cannot see why the
        // 30-tonne load is missing from their list assumes the app is broken.
        var (_, shipper) = await ShipperAsync();

        var takeable = Guid.NewGuid();
        var wrongClass = Guid.NewGuid();
        await PostAsync(shipper, takeable, Load(requires: "trailer_30t", weight: 28));
        await PostAsync(shipper, wrongClass, Load(requires: "canter", weight: 6));

        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        var board = await client.GetFromJsonAsync<List<RankedLoadView>>(
            $"/v1/loads?lat={LagosLat}&lon={LagosLon}&truck=trailer_30t", Json);

        // Scoped to the two this test posted. Every test in this class shares
        // one store, and asserting on the whole board would pass or fail
        // depending on which test ran first — a shape this repo has already
        // been bitten by once, in the rate-limit tests.
        var mine = board!.Where(e => e.Load.Id == takeable || e.Load.Id == wrongClass).ToList();
        Assert.Equal(2, mine.Count);

        // Blocked sorts last regardless of score: a load that cannot be taken
        // should never sit above one that can.
        Assert.Null(mine[0].Blocked);
        Assert.Equal(takeable, mine[0].Load.Id);
        Assert.Equal("wrong_class", mine[1].Blocked);
        Assert.Contains("different class", mine[1].Because, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_load_going_home_outranks_a_better_paid_one_going_the_wrong_way()
    {
        // The asymmetry the product is named after. A matcher that treats a
        // return load as just another load is a load board.
        var (_, shipper) = await ShipperAsync();

        var home = Guid.NewGuid();
        var away = Guid.NewGuid();

        await PostAsync(shipper, home, Load(
            originLat: IbadanLat, originLon: IbadanLon,
            destLat: LagosLat, destLon: LagosLon,
            offeredKobo: 190_000_000));

        await PostAsync(shipper, away, Load(
            originLat: IbadanLat, originLon: IbadanLon,
            destLat: KanoLat, destLon: KanoLon,
            offeredKobo: 240_000_000));

        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        var ranked = await client.GetFromJsonAsync<List<RankedLoadView>>(
            $"/v1/loads?lat={IbadanLat}&lon={IbadanLon}&truck=trailer_30t" +
            $"&baseLat={LagosLat}&baseLon={LagosLon}", Json);

        var pair = ranked!.Where(e => e.Load.Id == home || e.Load.Id == away).ToList();

        Assert.Equal(home, pair[0].Load.Id);
        Assert.Contains("run home", pair[0].Because, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_carrier_cannot_read_the_other_bids()
    {
        // They would know exactly what to undercut, and the ranking exists
        // precisely so the cheapest bid is not automatically the winner.
        var (_, shipper) = await ShipperAsync();
        var load = Guid.NewGuid();
        await PostAsync(shipper, load, Load());

        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());
        await BidAsync(client, load, 180_000_000);

        var response = await client.GetAsync($"/v1/loads/{load}/bids");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_second_bid_from_the_same_carrier_replaces_the_first()
    {
        // Stacking three offers lets a carrier bracket the shipper's decision.
        // This is a negotiation, not an auction.
        var (_, shipper) = await ShipperAsync();
        var load = Guid.NewGuid();
        await PostAsync(shipper, load, Load());

        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        await BidAsync(client, load, 200_000_000);
        await BidAsync(client, load, 180_000_000);

        var bids = await shipper.GetFromJsonAsync<List<RankedBidView>>($"/v1/loads/{load}/bids", Json);

        var only = Assert.Single(bids!);
        Assert.Equal(180_000_000L, only.Bid.AmountKobo);
    }

    [Fact]
    public async Task A_new_carrier_is_scored_as_unknown_rather_than_as_unreliable()
    {
        // A marketplace that never surfaces a new carrier never gets a second
        // one. The sentence says so rather than showing a zero.
        var (_, shipper) = await ShipperAsync();
        var load = Guid.NewGuid();
        await PostAsync(shipper, load, Load());

        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        await BidAsync(carrier.Carrying(factory.CreateClient()), load, 180_000_000);

        var bids = await shipper.GetFromJsonAsync<List<RankedBidView>>($"/v1/loads/{load}/bids", Json);

        var only = Assert.Single(bids!);
        Assert.Null(only.ReliabilityPct);
        Assert.Contains("no record yet", only.Because, StringComparison.Ordinal);
        Assert.True(only.ScorePct > 0);
    }

    [Fact]
    public async Task An_awarded_load_leaves_the_board_and_stops_taking_bids()
    {
        var (_, shipper) = await ShipperAsync();
        var load = Guid.NewGuid();
        await PostAsync(shipper, load, Load());

        var first = await Identities.IssueAsync(factory, Role.Carrier);
        await BidAsync(first.Carrying(factory.CreateClient()), load, 180_000_000);

        var bids = await shipper.GetFromJsonAsync<List<RankedBidView>>($"/v1/loads/{load}/bids", Json);
        var accepted = await shipper.PostAsync($"/v1/loads/{load}/bids/{bids![0].Bid.Id}/accept", null);
        accepted.EnsureSuccessStatusCode();

        var second = await Identities.IssueAsync(factory, Role.Carrier);
        var late = await second.Carrying(factory.CreateClient()).PutAsJsonAsync(
            $"/v1/loads/{load}/bid",
            new { amountKobo = 170_000_000L, atLat = LagosLat, atLon = LagosLon });

        Assert.Equal(HttpStatusCode.NotFound, late.StatusCode);

        var board = await second.Carrying(factory.CreateClient())
            .GetFromJsonAsync<List<RankedLoadView>>("/v1/loads", Json);

        Assert.DoesNotContain(board!, entry => entry.Load.Id == load);
    }

    [Fact]
    public async Task And_cannot_be_amended_afterwards()
    {
        // Amending the weight of a load a carrier is driving to collect is not
        // an amendment. It is a different load.
        var (_, shipper) = await ShipperAsync();
        var load = Guid.NewGuid();
        await PostAsync(shipper, load, Load());

        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        await BidAsync(carrier.Carrying(factory.CreateClient()), load, 180_000_000);

        var bids = await shipper.GetFromJsonAsync<List<RankedBidView>>($"/v1/loads/{load}/bids", Json);
        await shipper.PostAsync($"/v1/loads/{load}/bids/{bids![0].Bid.Id}/accept", null);

        var again = await shipper.PutAsJsonAsync($"/v1/loads/{load}", Load(weight: 12));

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Another_shippers_load_cannot_be_amended()
    {
        var (_, mine) = await ShipperAsync();
        var load = Guid.NewGuid();
        await PostAsync(mine, load, Load());

        var (_, theirs) = await ShipperAsync();
        var response = await theirs.PutAsJsonAsync($"/v1/loads/{load}", Load(weight: 12));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Id, HttpClient Client)> ShipperAsync()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        return (shipper.UserId, shipper.Carrying(factory.CreateClient()));
    }

    private static async Task PostAsync(HttpClient client, Guid loadId, object body)
    {
        var response = await client.PutAsJsonAsync($"/v1/loads/{loadId}", body);
        response.EnsureSuccessStatusCode();
    }

    private static async Task BidAsync(HttpClient client, Guid loadId, long amountKobo)
    {
        var response = await client.PutAsJsonAsync(
            $"/v1/loads/{loadId}/bid",
            new { amountKobo, atLat = LagosLat, atLon = LagosLon });
        response.EnsureSuccessStatusCode();
    }

    private static object Load(
        double originLat = LagosLat,
        double originLon = LagosLon,
        double destLat = KanoLat,
        double destLon = KanoLon,
        double weight = 28,
        string requires = "trailer_30t",
        long? offeredKobo = 224_000_000,
        int readyInHours = 6,
        int expiresInHours = 48) => new
    {
        originName = "Lagos",
        destinationName = "Kano",
        originLat,
        originLon,
        destinationLat = destLat,
        destinationLon = destLon,
        cargo = "Cement",
        weightTonnes = weight,
        requires,
        offeredKobo,
        readyBy = DateTimeOffset.UtcNow.AddHours(readyInHours),
        expiresAt = DateTimeOffset.UtcNow.AddHours(expiresInHours),
    };

    private sealed record RankedLoadView(
        LoadView Load,
        int ScorePct,
        string? Blocked,
        int DeadheadKm,
        int ProgressHomeKm,
        string Because);

    private sealed record LoadView(Guid Id, string OriginName, string DestinationName, bool Awarded);

    private sealed record RankedBidView(
        BidView Bid,
        int ScorePct,
        int? ReliabilityPct,
        int KmToPickup,
        string Because);

    private sealed record BidView(Guid Id, long AmountKobo, int TripsCompleted);
}
