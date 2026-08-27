using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>
/// What the record shows.
/// </summary>
/// <remarks>
/// Everything this product has been careful about exists for this route: the
/// append-only history, the fixes that were discarded and why, the message
/// written in a dead zone and delivered eleven hours later. Assembled in time
/// order, in one document, they are why a haulier and a cargo owner can settle
/// in an afternoon rather than in a year.
///
/// The assembler adds nothing and decides nothing, and neither does this
/// controller.
/// </remarks>
[ApiController]
[Route("v1/trips/{tripId:guid}/dispute")]
[Tags("dispute")]
public sealed class DisputeController(DisputeRepository disputes, TimeProvider clock) : AuthorisedController
{
    [HttpGet]
    [ProducesResponseType<PackResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PackResponse>> Get(Guid tripId, CancellationToken ct)
    {
        var evidence = await disputes.EvidenceAsync(tripId, Caller, ct);
        if (evidence is null) return NotFound("No such trip.");

        var pack = Dispute.Assemble(tripId, evidence, clock.GetUtcNow());

        return new PackResponse(
            pack.TripId,
            pack.AssembledAt,
            pack.Items
                .Select(item => new EvidenceResponse(
                    KindWire(item.Item.Kind),
                    item.Item.At,
                    item.Item.Until,
                    item.Item.ReceivedAt,
                    item.Item.Summary,
                    SourceWire(item.Item.Source),
                    WeightWire(item.Weight)))
                .ToList(),
            pack.Counts[Weight.Measured],
            pack.Counts[Weight.Attested],
            pack.Counts[Weight.LateAttested],
            pack.CoveredMs,
            pack.Gaps.Select(g => new GapResponse(g.From, g.To, g.Ms)).ToList(),
            Dispute.Describe(pack),
            Dispute.IsThin(pack));
    }

    private static string KindWire(EvidenceKind kind) => kind switch
    {
        EvidenceKind.TripEvent => "trip_event",
        EvidenceKind.Position => "position",
        EvidenceKind.DiscardedPosition => "discarded_position",
        EvidenceKind.Message => "message",
        EvidenceKind.Incident => "incident",
        EvidenceKind.Photo => "photo",
        EvidenceKind.Signature => "signature",
        EvidenceKind.WaypointVisit => "waypoint_visit",
        EvidenceKind.ShareLink => "share_link",
        _ => throw new InvalidOperationException($"unmapped kind {kind}"),
    };

    private static string SourceWire(EvidenceSource source) => source switch
    {
        EvidenceSource.Shipper => "shipper",
        EvidenceSource.Carrier => "carrier",
        EvidenceSource.Driver => "driver",
        EvidenceSource.System => "system",
        _ => throw new InvalidOperationException($"unmapped source {source}"),
    };

    private static string WeightWire(Weight weight) => weight switch
    {
        Weight.Measured => "measured",
        Weight.Attested => "attested",
        Weight.LateAttested => "late_attested",
        _ => throw new InvalidOperationException($"unmapped weight {weight}"),
    };
}
