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

        // 400 and a sentence, not the 404 this used to answer. Hiding a
        // resource's existence is right where there is a resource to hide;
        // here there was none — the caller was creating one — and "No such
        // load" for a create told a person nothing they could act on. See
        // ADR-0020.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            "Only a shipper can post a load",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
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
    public async Task A_board_with_no_position_to_rank_from_comes_back_unranked()
    {
        // Unranked, not ranked around a guess. The app used to send a
        // hard-coded Kano — the same two coordinates for every carrier on the
        // platform, so everybody saw the same board in the same order under a
        // line telling them their truck was in Kano.
        var (_, shipper) = await ShipperAsync();
        await PostAsync(shipper, Guid.NewGuid(), Load());

        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        var board = await client.GetFromJsonAsync<List<RankedLoadView>>(
            "/v1/loads?truck=trailer_30t",
            Json);

        // A carrier whose first trip has not started has no position, and the
        // board says nothing about distance rather than inventing one.
        Assert.NotEmpty(board!);
        Assert.All(board!, row => Assert.Equal(0, row.DeadheadKm));
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
        Assert.Contains("New to Backhaul", only.Because, StringComparison.Ordinal);
        // Unknown, not bad: the neutral prior still leaves them a real score.
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


    [Fact]
    public async Task A_chain_takes_the_leg_that_pays_most_per_kilometre_driven()
    {
        // Greedy, and the greed is per kilometre *driven* — empty ones
        // included. A better-paid leg reached by 100 km of empty running is
        // not the better leg.
        // Its own board. Every other test in this class posts loads into the
        // shared store, and a ranking asserted against "everything on the
        // board" passes or fails depending on which test ran first.
        using var board = new ApiFactory { StoreName = Guid.NewGuid().ToString() };
        var shipper = await ShipperAsync(board);

        var start = Guid.NewGuid();
        var good = Guid.NewGuid();
        var poor = Guid.NewGuid();

        await PostAsync(shipper, start, Load(
            originLat: LagosLat, originLon: LagosLon,
            destLat: IbadanLat, destLon: IbadanLon,
            offeredKobo: 38_000_000));

        await PostAsync(shipper, good, Load(
            originLat: IbadanLat, originLon: IbadanLon,
            destLat: KanoLat, destLon: KanoLon,
            offeredKobo: 200_000_000, readyInHours: 12, expiresInHours: 96));

        await PostAsync(shipper, poor, Load(
            originLat: IbadanLat, originLon: IbadanLon,
            destLat: KanoLat, destLon: KanoLon,
            offeredKobo: 20_000_000, readyInHours: 12, expiresInHours: 96));

        var carrier = await Identities.IssueAsync(board.Services, Role.Carrier);
        var client = carrier.Carrying(board.CreateClient());

        var chain = await client.GetFromJsonAsync<ChainView>($"/v1/loads/{start}/chain", Json);

        Assert.Equal(start, chain!.Legs[0].LoadId);
        Assert.Contains(chain.Legs, leg => leg.LoadId == good);
        Assert.DoesNotContain(chain.Legs, leg => leg.LoadId == poor);

        // The number the whole feature exists to move.
        Assert.True(chain.LadenPct > 0);
    }

    [Fact]
    public async Task A_chain_never_grows_past_three_legs()
    {
        // Longer than three is planning fiction: by the third handover the
        // first leg's timings have moved.
        using var board = new ApiFactory { StoreName = Guid.NewGuid().ToString() };
        var shipper = await ShipperAsync(board);

        var start = Guid.NewGuid();
        await PostAsync(shipper, start, Load(
            originLat: LagosLat, originLon: LagosLon,
            destLat: IbadanLat, destLon: IbadanLon,
            offeredKobo: 38_000_000));

        for (var i = 0; i < 5; i++)
        {
            await PostAsync(shipper, Guid.NewGuid(), Load(
                originLat: IbadanLat, originLon: IbadanLon,
                destLat: IbadanLat + 0.01 * i, destLon: IbadanLon,
                offeredKobo: 40_000_000, readyInHours: 12, expiresInHours: 96));
        }

        var carrier = await Identities.IssueAsync(board.Services, Role.Carrier);
        var chain = await carrier.Carrying(board.CreateClient())
            .GetFromJsonAsync<ChainView>($"/v1/loads/{start}/chain", Json);

        Assert.True(chain!.Legs.Count <= 3);
    }

    [Fact]
    public async Task A_load_too_far_to_reposition_to_says_so_rather_than_vanishing()
    {
        using var board = new ApiFactory { StoreName = Guid.NewGuid().ToString() };
        var shipper = await ShipperAsync(board);

        var start = Guid.NewGuid();
        var farAway = Guid.NewGuid();

        await PostAsync(shipper, start, Load(
            originLat: LagosLat, originLon: LagosLon,
            destLat: IbadanLat, destLon: IbadanLon,
            offeredKobo: 38_000_000));

        await PostAsync(shipper, farAway, Load(
            originLat: KanoLat, originLon: KanoLon,
            destLat: LagosLat, destLon: LagosLon,
            offeredKobo: 200_000_000, readyInHours: 12, expiresInHours: 96));

        var carrier = await Identities.IssueAsync(board.Services, Role.Carrier);
        var refusals = await carrier.Carrying(board.CreateClient())
            .GetFromJsonAsync<List<ChainRefusalView>>($"/v1/loads/{start}/chain/refusals", Json);

        var refused = Assert.Single(refusals!, r => r.LoadId == farAway);
        Assert.Equal("too_far", refused.Reason);
        Assert.Contains("km empty from", refused.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Two_part_loads_going_the_same_way_are_proposed_as_a_pair()
    {
        using var board = new ApiFactory { StoreName = Guid.NewGuid().ToString() };
        var shipper = await ShipperAsync(board);

        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        await PostAsync(shipper, a, Load(weight: 15, offeredKobo: 140_000_000));
        await PostAsync(shipper, b, Load(
            originLat: LagosLat + 0.1, originLon: LagosLon + 0.1,
            destLat: KanoLat + 0.1, destLon: KanoLon + 0.1,
            weight: 12, offeredKobo: 120_000_000));

        var carrier = await Identities.IssueAsync(board.Services, Role.Carrier);
        var pairs = await carrier.Carrying(board.CreateClient())
            .GetFromJsonAsync<List<PairingView>>("/v1/loads/pairs?truck=trailer_30t", Json);

        var found = Assert.Single(
            pairs!,
            p => (p.A.Id == a && p.B.Id == b) || (p.A.Id == b && p.B.Id == a));

        // 27 t of 30 is 90% full, and each shipper pays 30% less than they
        // offered — the whole reason either of them would agree to share.
        Assert.Equal(90, found.FillPct);
        Assert.Equal(98_000_000L, found.PaysAKobo);
        Assert.Equal(84_000_000L, found.PaysBKobo);
        Assert.Equal(182_000_000L, found.CarrierGetsKobo);
    }

    [Fact]
    public async Task An_unknown_truck_class_is_refused_rather_than_defaulted()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var response = await carrier.Carrying(factory.CreateClient())
            .GetAsync("/v1/loads/pairs?truck=lorry");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }


    [Fact]
    public async Task A_town_typed_in_lower_case_still_finds_the_load()
    {
        // Three people write the same thing three ways. A search that finds
        // none of them is a search nobody uses twice.
        using var board = new ApiFactory { StoreName = Guid.NewGuid().ToString() };
        var shipper = await ShipperAsync(board);

        var mine = Guid.NewGuid();
        await PostAsync(shipper, mine, Load());
        await PostAsync(shipper, Guid.NewGuid(), Load(destLat: IbadanLat, destLon: IbadanLon));

        var carrier = await Identities.IssueAsync(board.Services, Role.Carrier);
        var client = carrier.Carrying(board.CreateClient());

        var found = await client.GetFromJsonAsync<List<RankedLoadView>>(
            "/v1/loads?text=CEMENT", Json);

        // Both are cement; the filter matched on cargo rather than on nothing.
        Assert.Equal(2, found!.Count);

        var none = await client.GetFromJsonAsync<List<RankedLoadView>>(
            "/v1/loads?text=zzz", Json);

        Assert.Empty(none!);
    }

    [Fact]
    public async Task A_floor_under_the_price_is_applied_before_the_ranking()
    {
        // Ranking first and filtering after would score loads about to be
        // thrown away, and could leave the top of the list holding whatever
        // survived rather than the best fit among what is left.
        using var board = new ApiFactory { StoreName = Guid.NewGuid().ToString() };
        var shipper = await ShipperAsync(board);

        var dear = Guid.NewGuid();
        var cheap = Guid.NewGuid();

        await PostAsync(shipper, dear, Load(offeredKobo: 224_000_000));
        await PostAsync(shipper, cheap, Load(offeredKobo: 40_000_000));

        var carrier = await Identities.IssueAsync(board.Services, Role.Carrier);
        var found = await carrier.Carrying(board.CreateClient())
            .GetFromJsonAsync<List<RankedLoadView>>(
                $"/v1/loads?lat={LagosLat}&lon={LagosLon}&truck=trailer_30t&minimumOfferKobo=100000000",
                Json);

        var only = Assert.Single(found!);
        Assert.Equal(dear, only.Load.Id);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Id, HttpClient Client)> ShipperAsync()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        return (shipper.UserId, shipper.Carrying(factory.CreateClient()));
    }

    /// <summary>A shipper on a board of its own — see the ranking tests.</summary>
    private static async Task<HttpClient> ShipperAsync(ApiFactory board)
    {
        var shipper = await Identities.IssueAsync(board.Services, Role.Shipper);
        return shipper.Carrying(board.CreateClient());
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

    private sealed record ChainView(List<ChainLegView> Legs, int DeadheadKm, int LadenKm, int LadenPct);

    private sealed record ChainLegView(Guid LoadId, string FromName, string ToName, long PaysKobo);

    private sealed record ChainRefusalView(Guid LoadId, string Reason, string Detail);

    private sealed record PairingView(
        LoadView A,
        LoadView B,
        int FillPct,
        long PaysAKobo,
        long PaysBKobo,
        long CarrierGetsKobo);

    [Fact]
    public async Task A_shipper_can_still_see_a_load_after_it_is_awarded()
    {
        // The board is what is still on offer; this is what they posted. A
        // shipper who could no longer see an awarded load would have no way to
        // reach the bids on it.
        using var board = new ApiFactory { StoreName = Guid.NewGuid().ToString() };
        var shipper = await ShipperAsync(board);

        var load = Guid.NewGuid();
        await PostAsync(shipper, load, Load());

        var carrier = await Identities.IssueAsync(board.Services, Role.Carrier);
        var bidding = carrier.Carrying(board.CreateClient());
        var placed = await bidding.PutAsJsonAsync(
            $"/v1/loads/{load}/bid",
            new { amountKobo = 180_000_000L, atLat = LagosLat, atLon = LagosLon });
        placed.EnsureSuccessStatusCode();

        var bids = await shipper.GetFromJsonAsync<List<RankedBidView>>($"/v1/loads/{load}/bids", Json);
        await shipper.PostAsync($"/v1/loads/{load}/bids/{bids![0].Bid.Id}/accept", null);

        var onTheBoard = await bidding.GetFromJsonAsync<List<RankedLoadView>>("/v1/loads", Json);
        Assert.DoesNotContain(onTheBoard!, entry => entry.Load.Id == load);

        var mine = await shipper.GetFromJsonAsync<List<LoadView>>("/v1/me/loads", Json);
        var found = Assert.Single(mine!, row => row.Id == load);
        Assert.True(found.Awarded);
    }

    [Fact]
    public async Task A_carrier_has_no_posted_loads()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var mine = await carrier.Carrying(factory.CreateClient())
            .GetFromJsonAsync<List<LoadView>>("/v1/me/loads", Json);

        Assert.Empty(mine!);
    }

}
