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
/// Three loads instead of one, and two part-loads instead of half a truck.
/// </summary>
/// <remarks>
/// Both of these run over the same board <c>LoadsController</c> serves, and
/// both answer with the refusals as well as the fits. A carrier looking at a
/// load that *nearly* joins the chain needs to know which of the two things is
/// wrong — the distance is something they might accept and the timing is not.
/// </remarks>
[ApiController]
[Route("v1/loads")]
[Tags("market")]
public sealed class ChainController(MarketRepository market, TimeProvider clock) : AuthorisedController
{
    /// <summary>
    /// The best chain that can be built from this load and what is on the board.
    /// </summary>
    /// <remarks>
    /// Greedy, and the same greedy the app runs: at each step the leg that
    /// adds the most money per kilometre driven, empty ones included. An
    /// optimal search is a travelling-salesman problem, and being
    /// approximately right instantly beats being exactly right after a
    /// spinner.
    /// </remarks>
    [HttpGet("{loadId:guid}/chain")]
    [ProducesResponseType<ChainResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ChainResponse>> GetChain(Guid loadId, CancellationToken ct)
    {
        var now = clock.GetUtcNow();

        var start = await market.LoadAsync(loadId, ct);
        if (start is null) return NotFound("No such load.");

        var pool = (await market.BoardAsync(now, ct)).Where(l => l.Id != loadId).ToList();

        var built = Chaining.Build(ToLeg(start), pool.Select(ToLeg).ToList());

        return new ChainResponse(
            built.Legs.Select(ToResponse).ToList(),
            Km(built.DeadheadM),
            Km(built.Laden),
            built.Pays.Value,
            built.Pays.ToString(),
            (int)Math.Floor(Chaining.LadenFraction(built) * 100 + 0.5));
    }

    /// <summary>Why the loads that did not make the chain could not.</summary>
    /// <remarks>
    /// A separate route rather than a field on the chain, because it answers a
    /// different question: the chain is what to do next, and this is why the
    /// load the carrier was looking at is not in it.
    /// </remarks>
    [HttpGet("{loadId:guid}/chain/refusals")]
    [ProducesResponseType<IReadOnlyList<ChainRefusalResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<ChainRefusalResponse>>> GetRefusals(
        Guid loadId,
        CancellationToken ct)
    {
        var now = clock.GetUtcNow();

        var start = await market.LoadAsync(loadId, ct);
        if (start is null) return NotFound("No such load.");

        var previous = ToLeg(start);

        return (await market.BoardAsync(now, ct))
            .Where(l => l.Id != loadId)
            .Select(candidate => (candidate, fit: Chaining.CanFollow(previous, ToLeg(candidate))))
            .Where(pair => pair.fit is Fit.No)
            .Select(pair => new ChainRefusalResponse(
                pair.candidate.Id,
                RefusalWire(((Fit.No)pair.fit).Reason),
                ((Fit.No)pair.fit).Detail))
            .ToList();
    }

    /// <summary>
    /// Every pair on the board that could share one truck, fullest first.
    /// </summary>
    /// <param name="truck">The class of truck being offered.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet("pairs")]
    [ProducesResponseType<IReadOnlyList<PairingResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IReadOnlyList<PairingResponse>>> GetPairs(
        [FromQuery] string truck,
        CancellationToken ct)
    {
        var truckClass = Trucks.FromWire(truck);
        if (truckClass is null) return BadRequest($"Unknown truck class '{truck}'.");

        var now = clock.GetUtcNow();
        var board = await market.BoardAsync(now, ct);

        // Only loads that name a price can be paired: the discount is a share
        // of what each shipper offered, and a load open to bids has no figure
        // to take a share of yet.
        var priced = board.Where(l => l.OfferedKobo is not null).ToList();
        var byId = priced.ToDictionary(l => l.Id);

        return Consolidation
            .Pairs(priced.Select(ToPairLoad).ToList(), truckClass.Value)
            .Select(pairing => new PairingResponse(
                ToResponse(byId[pairing.A.Id]),
                ToResponse(byId[pairing.B.Id]),
                (int)Math.Floor(pairing.Fill * 100 + 0.5),
                pairing.PaysA.Value,
                pairing.PaysA.ToString(),
                pairing.PaysB.Value,
                pairing.PaysB.ToString(),
                pairing.CarrierGets.Value,
                pairing.CarrierGets.ToString()))
            .ToList();
    }

    private static ChainLeg ToLeg(LoadRecord row)
    {
        var from = new Position(row.OriginLat, row.OriginLon, 10, row.ReadyBy);
        var to = new Position(row.DestinationLat, row.DestinationLon, 10, row.ReadyBy);

        return new ChainLeg(
            row.Id,
            from,
            to,
            row.OriginName,
            row.DestinationName,
            row.ReadyBy,
            row.ExpiresAt,
            new Kobo(row.OfferedKobo ?? 0),
            Geo.Distance(from, to));
    }

    private static PairLoad ToPairLoad(LoadRecord row) => new(
        row.Id,
        row.OriginName,
        row.DestinationName,
        row.Cargo,
        row.WeightTonnes * 1_000,
        new Kobo(row.OfferedKobo ?? 0),
        row.ReadyBy,
        Trucks.FromWire(row.Requires) ?? TruckClass.Trailer30t,
        // Tier filtering is `search.ts`'s job and has no route yet. Naming
        // the field rather than leaving it off the record keeps the two
        // shapes the same, so the day it is filtered on is a one-line change.
        "verified",
        row.OriginLat,
        row.OriginLon,
        row.DestinationLat,
        row.DestinationLon);

    private static ChainLegResponse ToResponse(ChainLeg leg) => new(
        leg.LoadId,
        leg.FromName,
        leg.ToName,
        leg.ReadyFrom,
        leg.DeliverBy,
        leg.Pays.Value,
        leg.Pays.ToString(),
        Km(leg.DistanceM));

    private static LoadResponse ToResponse(LoadRecord row) => new(
        row.Id,
        row.OriginName,
        row.DestinationName,
        row.Cargo,
        row.WeightTonnes,
        row.Requires,
        row.OfferedKobo,
        row.OfferedKobo is { } kobo ? new Kobo(kobo).ToString() : null,
        row.ReadyBy,
        row.ExpiresAt,
        row.AwardedToCarrierId is not null);

    private static int Km(double metres) => (int)Math.Floor(metres / 1000 + 0.5);

    private static string RefusalWire(ChainRefusal reason) => reason switch
    {
        ChainRefusal.TooFar => "too_far",
        ChainRefusal.TooTight => "too_tight",
        ChainRefusal.WrongOrder => "wrong_order",
        _ => throw new InvalidOperationException($"unmapped refusal {reason}"),
    };
}
