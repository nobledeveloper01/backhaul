using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain.Market;
using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>
/// The load board, and the bids on it.
/// </summary>
/// <remarks>
/// <para>
/// Tracking is the wedge; this is the business. There is no arithmetic in this
/// file — the ranking comes from <c>Backhaul.Domain.Market</c>, which the
/// parity fixtures hold to the same order and the same sentences the phone
/// produces. A server that ranks the same six loads differently is a server
/// telling a carrier to drive somewhere else.
/// </para>
/// <para>
/// **Every candidate comes back, scored and explained** — including the ones
/// that cannot be taken, greyed with the reason. A carrier who cannot see why
/// the 30-tonne load is missing from their list assumes the app is broken.
/// </para>
/// </remarks>
[ApiController]
[Route("v1/loads")]
[Tags("market")]
public sealed class LoadsController(MarketRepository market, TimeProvider clock) : AuthorisedController
{
    /// <summary>
    /// The board, ranked for one truck when it says where it is.
    /// </summary>
    /// <remarks>
    /// Without a position this is the raw board, soonest to expire first. With
    /// one it is ranked, and with a base as well it is ranked the way the
    /// product is named after: a load going home at half price beats a
    /// full-price load going the wrong way.
    /// </remarks>
    /// <param name="lat">Where the truck is, or will be when it is free.</param>
    /// <param name="lon">Where the truck is.</param>
    /// <param name="truck">The class of truck being offered.</param>
    /// <param name="baseLat">Where the truck is trying to get back to.</param>
    /// <param name="baseLon">Where the truck is trying to get back to.</param>
    /// <param name="text">Town or cargo. Case-, accent- and space-insensitive.</param>
    /// <param name="minimumOfferKobo">A floor under the price.</param>
    /// <param name="readyBefore">Only loads ready to collect by then.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<RankedLoadResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IReadOnlyList<RankedLoadResponse>>> Get(
        [FromQuery] double? lat = null,
        [FromQuery] double? lon = null,
        [FromQuery] string? truck = null,
        [FromQuery] double? baseLat = null,
        [FromQuery] double? baseLon = null,
        [FromQuery] string? text = null,
        [FromQuery] long? minimumOfferKobo = null,
        [FromQuery] DateTimeOffset? readyBefore = null,
        CancellationToken ct = default)
    {
        var now = clock.GetUtcNow();
        var board = await market.BoardAsync(now, ct);

        // Filtered before it is ranked, and by the same engine the app uses.
        // Ranking first and filtering after would score loads that are about
        // to be thrown away, and — worse — could leave the top of a filtered
        // list holding whatever happened to survive rather than the best fit
        // among what is left.
        if (text is not null || minimumOfferKobo is not null || readyBefore is not null)
        {
            var filter = new LoadFilter(
                text ?? string.Empty,
                truck is null ? [] : [Trucks.FromWire(truck) ?? TruckClass.Trailer30t],
                minimumOfferKobo is { } floor ? new Kobo(floor) : null,
                readyBefore,
                []);

            var kept = Search
                .FilterLoads(board.Select(load => ToSummary(load)).ToList(), filter)
                .Select(summary => summary.Id)
                .ToHashSet();

            board = board.Where(load => kept.Contains(load.Id)).ToList();
        }

        if (lat is null || lon is null || truck is null)
        {
            return board.Select(load => Unranked(load, now)).ToList();
        }

        var truckClass = Trucks.FromWire(truck);
        if (truckClass is null) return BadRequest($"Unknown truck class '{truck}'.");

        var carrier = new Carrier(
            new Position(lat.Value, lon.Value, 10, now),
            now,
            truckClass.Value,
            baseLat is null || baseLon is null
                ? null
                : new Position(baseLat.Value, baseLon.Value, 10, now));

        var byId = board.ToDictionary(load => load.Id);

        var ranked = Matching.RankLoads(
            carrier,
            board.Select(load => ToDomain(load, now)).ToList(),
            now);

        return ranked
            .Select(scored => new RankedLoadResponse(
                ToResponse(byId[scored.Load.Id]),
                (int)Math.Floor(scored.Score * 100 + 0.5),
                scored.Blocked is null ? null : BlockerWire(scored.Blocked.Value),
                (int)Math.Floor(scored.DeadheadM / 1000 + 0.5),
                (int)Math.Floor(scored.ProgressHomeM / 1000 + 0.5),
                scored.Because))
            .ToList();
    }

    /// <summary>
    /// The caller's own loads, newest first.
    /// </summary>
    /// <remarks>
    /// Not the board. The board is what is still on offer; this is what the
    /// shipper posted, awarded ones included — a shipper who could no longer
    /// see a load they had posted would have no way to reach the bids on it.
    /// </remarks>
    [HttpGet("/v1/me/loads")]
    [ProducesResponseType<IReadOnlyList<LoadResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LoadResponse>>> Mine(CancellationToken ct) =>
        (await market.MineAsync(Caller, ct)).Select(ToResponse).ToList();

    /// <summary>Post a load, or amend one that has not been awarded.</summary>
    [HttpPut("{loadId:guid}")]
    [ProducesResponseType<LoadResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<LoadResponse>> Put(
        Guid loadId,
        [FromBody] LoadRequest body,
        CancellationToken ct)
    {
        if (body.ExpiresAt <= body.ReadyBy)
        {
            return BadRequest("A load cannot expire before it is ready to collect.");
        }

        var (saved, awarded) = await market.SaveLoadAsync(
            loadId,
            Caller,
            row =>
            {
                row.OriginName = body.OriginName;
                row.DestinationName = body.DestinationName;
                row.OriginLat = body.OriginLat;
                row.OriginLon = body.OriginLon;
                row.DestinationLat = body.DestinationLat;
                row.DestinationLon = body.DestinationLon;
                row.Cargo = body.Cargo;
                row.WeightTonnes = body.WeightTonnes;
                row.Requires = body.Requires;
                row.OfferedKobo = body.OfferedKobo;
                row.ReadyBy = body.ReadyBy;
                row.ExpiresAt = body.ExpiresAt;
            },
            ct);

        if (awarded)
        {
            return Conflict("This load has been awarded and cannot be changed.");
        }

        return saved is null ? NotFound("No such load.") : ToResponse(saved);
    }

    /// <summary>Place or replace a bid.</summary>
    /// <remarks>
    /// One live bid per carrier per load. Letting a carrier stack three offers
    /// lets them bracket the shipper's decision, and this is a negotiation
    /// rather than an auction.
    /// </remarks>
    [HttpPut("{loadId:guid}/bid")]
    [ProducesResponseType<BidResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<BidResponse>> PutBid(
        Guid loadId,
        [FromBody] BidRequest body,
        CancellationToken ct)
    {
        var placed = await market.PlaceBidAsync(
            loadId,
            Caller,
            body.AmountKobo,
            body.AtLat,
            body.AtLon,
            clock.GetUtcNow(),
            ct);

        return placed is null
            ? NotFound("No such load, or it is no longer taking bids.")
            : ToResponse(placed);
    }

    /// <summary>
    /// The bids on a load, ranked. The shipper's view.
    /// </summary>
    /// <remarks>
    /// A carrier who could read the other bids would know exactly what to
    /// undercut — and the ranking exists precisely so the cheapest bid is not
    /// automatically the winning one. A 404 rather than a 403, as everywhere
    /// else: the existence of a load id is itself information.
    /// </remarks>
    [HttpGet("{loadId:guid}/bids")]
    [ProducesResponseType<IReadOnlyList<RankedBidResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<RankedBidResponse>>> GetBids(
        Guid loadId,
        CancellationToken ct)
    {
        var load = await market.LoadAsync(loadId, ct);
        var bids = await market.BidsAsync(loadId, Caller, ct);
        if (load is null || bids is null) return NotFound("No such load.");

        var now = clock.GetUtcNow();
        var pickup = new Position(load.OriginLat, load.OriginLon, 10, now);

        var byId = bids.ToDictionary(bid => bid.Id);

        return Matching
            .RankBids(bids.Select(ToDomain).ToList(), pickup)
            .Select(scored => new RankedBidResponse(
                ToResponse(byId[scored.Bid.Id]),
                (int)Math.Floor(scored.Score * 100 + 0.5),
                scored.Reliability is null
                    ? null
                    : (int?)Math.Floor(scored.Reliability.Value * 100 + 0.5),
                scored.KmToPickup,
                scored.Because))
            .ToList();
    }

    /// <summary>Accept a bid. The load leaves the board.</summary>
    [HttpPost("{loadId:guid}/bids/{bidId:guid}/accept")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Accept(Guid loadId, Guid bidId, CancellationToken ct)
    {
        var awarded = await market.AwardAsync(loadId, bidId, Caller, clock.GetUtcNow(), ct);
        return awarded ? NoContent() : NotFound("No such bid on a load you can award.");
    }

    private static LoadSummary ToSummary(LoadRecord row) => new(
        row.Id,
        row.OriginName,
        row.DestinationName,
        row.Cargo,
        row.WeightTonnes * 1_000,
        new Kobo(row.OfferedKobo ?? 0),
        row.ReadyBy,
        Trucks.FromWire(row.Requires) ?? TruckClass.Trailer30t,
        // Tier filtering needs the shipper's profile, which this query does
        // not join. Named rather than omitted so the day it does is one line.
        "verified");

    private static Load ToDomain(LoadRecord row, DateTimeOffset now) => new(
        row.Id,
        new Position(row.OriginLat, row.OriginLon, 10, now),
        new Position(row.DestinationLat, row.DestinationLon, 10, now),
        row.WeightTonnes,
        Trucks.FromWire(row.Requires) ?? TruckClass.Trailer30t,
        row.OfferedKobo is { } kobo ? new Kobo(kobo) : null,
        row.ReadyBy,
        row.ExpiresAt);

    private static Bid ToDomain(BidRecord row) => new(
        row.Id,
        row.CarrierId,
        new Kobo(row.AmountKobo),
        row.TripsCompleted,
        row.TripsPromised,
        row.TripsOnTime,
        new Position(row.AtLat, row.AtLon, 10, row.PlacedAt),
        row.PlacedAt);

    private static RankedLoadResponse Unranked(LoadRecord row, DateTimeOffset now) =>
        new(ToResponse(row), 0, null, 0, 0, string.Empty);

    private static LoadResponse ToResponse(LoadRecord row) => new(
        row.Id,
        row.OriginName,
        row.DestinationName,
        row.OriginLat,
        row.OriginLon,
        row.DestinationLat,
        row.DestinationLon,
        row.Cargo,
        row.WeightTonnes,
        row.Requires,
        row.OfferedKobo,
        row.OfferedKobo is { } kobo ? new Kobo(kobo).ToString() : null,
        row.ReadyBy,
        row.ExpiresAt,
        row.AwardedToCarrierId is not null);

    private static BidResponse ToResponse(BidRecord row) => new(
        row.Id,
        row.AmountKobo,
        new Kobo(row.AmountKobo).ToString(),
        row.TripsCompleted,
        row.PlacedAt);

    private static string BlockerWire(Blocker blocked) => blocked switch
    {
        Blocker.TooHeavy => "too_heavy",
        Blocker.WrongClass => "wrong_class",
        Blocker.Expired => "expired",
        Blocker.CannotReach => "cannot_reach",
        _ => throw new InvalidOperationException($"unmapped blocker {blocked}"),
    };
}
