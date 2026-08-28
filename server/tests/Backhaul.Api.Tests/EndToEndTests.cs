using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// Phase 5's exit gate, the half that is software: **a load matched and
/// completed end to end.**
/// </summary>
/// <remarks>
/// One load, from posted to a sealed delivery, without leaving the API. It is
/// deliberately not a unit test of anything — every step is a call a real app
/// makes, in the order it makes them, and the point is that no step has to
/// happen somewhere else. Awarding used to be where the product stopped: the
/// load left the board and no trip existed. See ADR-0019.
/// </remarks>
public sealed class EndToEndTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_load_goes_from_the_board_to_a_sealed_delivery()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var asShipper = shipper.Carrying(factory.CreateClient());
        var asCarrier = carrier.Carrying(factory.CreateClient());

        // 1. A shipper posts a return load — Kano back to Lagos, which is the
        //    leg this product exists to stop running empty.
        var load = Guid.NewGuid();
        var posted = await asShipper.PutAsJsonAsync($"/v1/loads/{load}", new
        {
            originName = "Kano",
            destinationName = "Lagos",
            originLat = 12.0022,
            originLon = 8.5919,
            destinationLat = 6.4531,
            destinationLon = 3.3958,
            cargo = "Bagged rice",
            weightTonnes = 26.0,
            requires = "trailer_30t",
            offeredKobo = (long?)null,
            readyBy = DateTimeOffset.UtcNow,
            expiresAt = DateTimeOffset.UtcNow.AddDays(2),
        });
        posted.EnsureSuccessStatusCode();

        // 2. It is on the board, where a carrier heading home can see it.
        var board = await asCarrier.GetFromJsonAsync<List<RankedLoadView>>("/v1/loads", Json);
        Assert.Contains(board!, row => row.Load.Id == load);

        // 3. The carrier bids.
        var bid = await asCarrier.PutAsJsonAsync(
            $"/v1/loads/{load}/bid",
            new { amountKobo = 210_000_000L, atLat = 12.0022, atLon = 8.5919 });
        bid.EnsureSuccessStatusCode();
        var placed = (await bid.Content.ReadFromJsonAsync<BidView>(Json))!;

        // 4. The shipper reads the ranked bids and awards one.
        var bids = await asShipper.GetFromJsonAsync<List<RankedBidView>>(
            $"/v1/loads/{load}/bids", Json);
        Assert.Single(bids!);

        var accepted = await asShipper.PostAsync(
            $"/v1/loads/{load}/bids/{placed.Id}/accept", null);
        accepted.EnsureSuccessStatusCode();

        // The award opens the trip. This is the step that did not exist: the
        // load used to leave the board and nothing took its place.
        var award = (await accepted.Content.ReadFromJsonAsync<AwardView>(Json))!;
        Assert.NotEqual(Guid.Empty, award.TripId);

        // 5. Both parties can see it, because both are on it.
        foreach (var client in new[] { asShipper, asCarrier })
        {
            var trip = await client.GetFromJsonAsync<TripView>($"/v1/trips/{award.TripId}", Json);
            Assert.Equal("open", trip!.State);
            Assert.Equal("Kano", trip.Origin);
            Assert.Equal("Lagos", trip.Destination);
        }

        // A stranger cannot, and is told the trip does not exist rather than
        // that they may not see it. See ADR-0008.
        var stranger = await Identities.IssueAsync(factory, Role.Shipper);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await stranger.Carrying(factory.CreateClient())
                .GetAsync($"/v1/trips/{award.TripId}")).StatusCode);

        // 6. The carrier drives it. They are the driver of record until they
        //    hand it over, which is most of this market and all of it today.
        foreach (var state in new[] { "assigned", "loading", "in_transit", "arrived", "delivered" })
        {
            var moved = await asCarrier.PostAsJsonAsync(
                $"/v1/trips/{award.TripId}/events",
                new { state, at = DateTimeOffset.UtcNow, actor = "driver" });
            moved.EnsureSuccessStatusCode();
        }

        // 7. The proof, and the seal that releases everything downstream.
        var captured = await asCarrier.PutAsJsonAsync(
            $"/v1/trips/{award.TripId}/delivery",
            new
            {
                at = DateTimeOffset.UtcNow,
                photoIds = new[] { "p1", "p2" },
                signatureName = "Ibrahim Sani",
                signatureRole = "storekeeper",
                signatureImageId = "s1",
                capturedLat = 6.4531,
                capturedLon = 3.3958,
                capturedAccuracy = 14.0,
                note = "",
            });
        captured.EnsureSuccessStatusCode();

        var sealed_ = await asCarrier.PostAsync($"/v1/trips/{award.TripId}/delivery/seal", null);
        sealed_.EnsureSuccessStatusCode();

        var proof = (await sealed_.Content.ReadFromJsonAsync<DeliveryView>(Json))!;
        Assert.NotNull(proof.SealedAt);
    }

    [Fact]
    public async Task Awarding_twice_does_not_make_two_trips()
    {
        // The load refuses a second award, and the trip id is derived rather
        // than generated, so neither half can produce a duplicate. Both
        // matter: one guards the retry, the other guards a future caller who
        // reaches AwardAsync another way.
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var asShipper = shipper.Carrying(factory.CreateClient());

        var load = Guid.NewGuid();
        (await asShipper.PutAsJsonAsync($"/v1/loads/{load}", new
        {
            originName = "Kano",
            destinationName = "Lagos",
            originLat = 12.0022,
            originLon = 8.5919,
            destinationLat = 6.4531,
            destinationLon = 3.3958,
            cargo = "Bagged rice",
            weightTonnes = 26.0,
            requires = "trailer_30t",
            offeredKobo = (long?)null,
            readyBy = DateTimeOffset.UtcNow,
            expiresAt = DateTimeOffset.UtcNow.AddDays(2),
        })).EnsureSuccessStatusCode();

        var bid = await carrier.Carrying(factory.CreateClient()).PutAsJsonAsync(
            $"/v1/loads/{load}/bid",
            new { amountKobo = 210_000_000L, atLat = 12.0022, atLon = 8.5919 });
        var placed = (await bid.Content.ReadFromJsonAsync<BidView>(Json))!;

        var first = await asShipper.PostAsync($"/v1/loads/{load}/bids/{placed.Id}/accept", null);
        first.EnsureSuccessStatusCode();

        var again = await asShipper.PostAsync($"/v1/loads/{load}/bids/{placed.Id}/accept", null);
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }

    private sealed record RankedLoadView(LoadView Load);

    private sealed record LoadView(Guid Id, string OriginName, string DestinationName);

    private sealed record BidView(Guid Id, long AmountKobo);

    private sealed record RankedBidView(BidView Bid);

    private sealed record AwardView(Guid TripId);

    private sealed record TripView(Guid Id, string State, string Origin, string Destination);

    private sealed record DeliveryView(DateTimeOffset? SealedAt);
}
