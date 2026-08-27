using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>
/// When the money moves, what calling it off costs, and what the road took.
/// </summary>
/// <remarks>
/// <para>
/// There is no arithmetic in this file. Every figure comes from
/// <c>Backhaul.Domain.Money</c>, which the parity fixtures hold to the same
/// answers the app gives — including the sentences, because a cancellation fee
/// explained one way on a phone and another way on a server is a dispute the
/// platform created itself.
/// </para>
/// <para>
/// Every route needs terms, and a trip can exist without them: tracking is the
/// wedge and a tracking-only trip is a first-class thing. The answer in that
/// case is 404 with a sentence saying which, not a schedule of zeroes.
/// </para>
/// </remarks>
[ApiController]
[Route("v1/trips/{tripId:guid}")]
[Tags("money")]
public sealed class MoneyController(MoneyRepository money, TimeProvider clock) : AuthorisedController
{
    private const string NoTerms =
        "This trip has no agreed terms — it is being tracked, not traded.";

    /// <summary>Record what a trip was agreed for.</summary>
    /// <remarks>
    /// Idempotent: writing the same terms twice leaves one row. Terms are
    /// agreed once by two people and then do not move, so this is a replace
    /// rather than an append — unlike the trip's own history, which is
    /// append-only and stays that way.
    /// </remarks>
    [HttpPut("terms")]
    [ProducesResponseType<TermsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TermsResponse>> PutTerms(
        Guid tripId,
        [FromBody] TermsRequest body,
        CancellationToken ct)
    {
        if (Trucks.FromWire(body.Truck) is null)
        {
            return BadRequest($"Unknown truck class '{body.Truck}'.");
        }

        if (body.AgreedKobo < 0 || body.DriverPayKobo < 0 || body.DriverAdvanceKobo < 0)
        {
            return BadRequest("A fare cannot be negative.");
        }

        // A deadline before the trip was agreed is not a deadline, and a
        // carrier's punctuality record is built from these — so it is refused
        // here rather than counted as a trip they were always going to miss.
        if (body.DeliverBy is { } by && by < body.AcceptedAt)
        {
            return BadRequest("A delivery date cannot be before the trip was agreed.");
        }

        var saved = await money.SaveTermsAsync(
            tripId,
            Caller,
            row =>
            {
                row.Truck = body.Truck;
                row.AgreedKobo = body.AgreedKobo;
                row.AcceptedAt = body.AcceptedAt;
                row.DistanceM = body.DistanceM;
                row.DriverPayKobo = body.DriverPayKobo;
                row.DriverAdvanceKobo = body.DriverAdvanceKobo;
                row.DriverPaidAt = body.DriverPaidAt;
                row.DeliverBy = body.DeliverBy;
            },
            ct);

        if (saved is null) return NotFound("No such trip.");

        return new TermsResponse(
            saved.Truck,
            saved.AgreedKobo,
            new Kobo(saved.AgreedKobo).ToString(),
            saved.AcceptedAt,
            saved.DistanceM,
            saved.DriverPayKobo,
            saved.DriverAdvanceKobo,
            saved.DriverPaidAt,
            saved.DeliverBy);
    }

    /// <summary>When each part of the fare changes hands.</summary>
    [HttpGet("escrow")]
    [ProducesResponseType<EscrowResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<EscrowResponse>> GetEscrow(Guid tripId, CancellationToken ct)
    {
        var terms = await money.TermsAsync(tripId, Caller, ct);
        if (terms is null) return NotFound(NoTerms);

        var evidence = await money.EvidenceAsync(tripId, Caller, ct);
        if (evidence is null) return NotFound("No such trip.");

        var agreed = new Kobo(terms.AgreedKobo);
        var conditions = new EscrowConditions(
            TripMachine.FromWire(evidence.State) ?? TripState.Open,
            evidence.MovingForMs,
            evidence.PodSealed,
            evidence.DeliveredAt,
            evidence.ExceptionRaised);

        var releases = Escrow.For(agreed, conditions, clock.GetUtcNow());
        var next = Escrow.NextRelease(releases);
        var released = Escrow.Released(releases);
        var held = Escrow.HeldBack(agreed, releases);

        return new EscrowResponse(
            agreed.Value,
            agreed.ToString(),
            released.Value,
            released.ToString(),
            held.Value,
            held.ToString(),
            next is null ? null : Wire(next.Milestone.Kind),
            next?.Milestone.Condition,
            releases
                .Select(r => new ReleaseResponse(
                    Wire(r.Milestone.Kind),
                    r.Milestone.Pct,
                    r.Milestone.Condition,
                    r.Amount.Value,
                    r.Amount.ToString(),
                    r.Met))
                .ToList());
    }

    /// <summary>
    /// What calling this trip off would cost, right now.
    /// </summary>
    /// <remarks>
    /// A GET, deliberately. Somebody deciding whether to cancel has to be able
    /// to see the number before they commit to it, and a fee that only appears
    /// after the fact is a fee that gets disputed.
    /// </remarks>
    /// <param name="tripId">The trip.</param>
    /// <param name="by">shipper or carrier.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet("cancellation")]
    [ProducesResponseType<CancellationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CancellationResponse>> GetCancellation(
        Guid tripId,
        [FromQuery] string by,
        CancellationToken ct)
    {
        var side = by switch
        {
            "shipper" => (CancelledBy?)CancelledBy.Shipper,
            "carrier" => CancelledBy.Carrier,
            _ => null,
        };

        if (side is null) return BadRequest($"Unknown party '{by}' — expected shipper or carrier.");

        var terms = await money.TermsAsync(tripId, Caller, ct);
        if (terms is null) return NotFound(NoTerms);

        var evidence = await money.EvidenceAsync(tripId, Caller, ct);
        if (evidence is null) return NotFound("No such trip.");

        var state = TripMachine.FromWire(evidence.State) ?? TripState.Open;

        var outcome = Cancellation.Cancel(
            side.Value,
            state,
            new Kobo(terms.AgreedKobo),
            terms.AcceptedAt,
            clock.GetUtcNow());

        var counts = Cancellation.CountsAgainstRecord(side.Value, state);

        return outcome switch
        {
            CancelOutcome.Refused refused => new CancellationResponse(
                false, refused.Reason, null, null, null, null, refused.Detail, counts),

            CancelOutcome.Allowed allowed => new CancellationResponse(
                true,
                null,
                allowed.FeePct,
                allowed.Fee.Value,
                allowed.Fee.ToString(),
                allowed.WithinGrace,
                allowed.Detail,
                counts),

            _ => throw new InvalidOperationException("unreachable"),
        };
    }

    /// <summary>
    /// What the run costs the carrier, and whether a fare is worth taking.
    /// </summary>
    /// <remarks>
    /// Diesel is a parameter rather than a constant: it moves every few weeks
    /// and a cost model with last quarter's price in it is a cost model that
    /// talks a carrier into a loss.
    /// </remarks>
    /// <param name="tripId">The trip.</param>
    /// <param name="dieselPerLitreKobo">What a litre costs today.</param>
    /// <param name="emptyM">Empty kilometres, out or back. Defaults to none.</param>
    /// <param name="otherKobo">Anything else the carrier knows about.</param>
    /// <param name="offeredKobo">A fare to weigh against the cost. Optional.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet("costs")]
    [ProducesResponseType<CostsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CostsResponse>> GetCosts(
        Guid tripId,
        [FromQuery] long dieselPerLitreKobo,
        [FromQuery] double emptyM = 0,
        [FromQuery] long otherKobo = 0,
        [FromQuery] long? offeredKobo = null,
        CancellationToken ct = default)
    {
        if (dieselPerLitreKobo <= 0) return BadRequest("dieselPerLitreKobo is required.");
        if (emptyM < 0 || otherKobo < 0) return BadRequest("Distances and costs cannot be negative.");

        var terms = await money.TermsAsync(tripId, Caller, ct);
        if (terms is null) return NotFound(NoTerms);

        var truck = Trucks.FromWire(terms.Truck);
        if (truck is null) return BadRequest($"Unknown truck class '{terms.Truck}'.");

        // The levies are read, never estimated. What the road took is a fact
        // the driver recorded at a checkpoint, and a modelled figure in its
        // place would be the platform inventing a receipt.
        var levies = await money.LeviesAsync(tripId, Caller, ct);

        var input = new CostInput(
            truck.Value,
            terms.DistanceM,
            emptyM,
            new Kobo(dieselPerLitreKobo),
            new Kobo(levies),
            new Kobo(otherKobo));

        var costs = CostModel.RunningCost(input);
        var floor = CostModel.WalkAwayBelow(input);

        MarginResponse? margin = null;
        if (offeredKobo is { } offered)
        {
            var found = CostModel.MarginOn(new Kobo(offered), input);
            var advice = CostModel.Advise(new Kobo(offered), input);

            margin = new MarginResponse(
                offered,
                found.Profit.Value,
                found.Profit.ToString(),
                found.Fraction is null ? null : (int?)Math.Floor(found.Fraction.Value * 100 + 0.5),
                advice.Take,
                advice.Detail);
        }

        return new CostsResponse(
            terms.Truck,
            terms.DistanceM,
            emptyM,
            costs.Litres,
            costs.Fuel.Value,
            costs.Running.Value,
            costs.Levies.Value,
            costs.Other.Value,
            costs.Total.Value,
            costs.Total.ToString(),
            floor.Value,
            floor.ToString(),
            margin);
    }

    internal static string Wire(MilestoneKind kind) => kind switch
    {
        MilestoneKind.Advance => "advance",
        MilestoneKind.InTransit => "in_transit",
        MilestoneKind.Delivered => "delivered",
        MilestoneKind.Retention => "retention",
        _ => throw new InvalidOperationException($"unmapped milestone {kind}"),
    };
}

/// <summary>What the driver made, and what is still owed.</summary>
/// <remarks>
/// Not under a trip, because a statement is a question about a window rather
/// than about one run — and the window is passed in rather than guessed, for
/// the reason <c>earnings.ts</c> gives: a function that decides which month
/// somebody meant will be wrong in the first week of every one.
/// </remarks>
[ApiController]
[Route("v1/me/earnings")]
[Tags("money")]
public sealed class EarningsController(MoneyRepository money) : AuthorisedController
{
    [HttpGet]
    [ProducesResponseType<EarningsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<EarningsResponse>> Get(
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        CancellationToken ct)
    {
        if (to < from) return BadRequest("`to` is before `from`.");

        var rows = await money.EarningsAsync(Caller, from, to, ct);

        var earnings = rows
            .Select(r => new Earning(
                r.TripId,
                r.Corridor,
                r.DeliveredAt,
                r.DistanceM,
                new Kobo(r.PayKobo),
                new Kobo(r.AdvanceKobo),
                new Kobo(r.SpentKobo),
                r.PaidAt))
            .ToList();

        var found = Earnings.Of(earnings, from, to);
        var rate = Earnings.PerKilometre(found);

        return new EarningsResponse(
            found.From,
            found.To,
            found.Trips,
            found.DistanceM,
            found.Earned.Value,
            found.Earned.ToString(),
            found.OutOfPocket.Value,
            found.Outstanding.Value,
            found.Outstanding.ToString(),
            found.Settled.Value,
            rate?.Value,
            Earnings.LongestWaitMs(earnings, DateTimeOffset.UtcNow),
            Earnings.Unpaid(earnings)
                .Select(e => new UnpaidTripResponse(
                    e.TripId,
                    e.Corridor,
                    e.DeliveredAt,
                    e.Pay.Value,
                    e.Pay.ToString()))
                .ToList());
    }
}
