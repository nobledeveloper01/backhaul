using Backhaul.Api.Contracts;
using Backhaul.Domain.Tracking;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

[ApiController]
[Route("v1/tracking")]
[Tags("tracking")]
public sealed class TrackingController(
    PositionRepository positions,
    TripRepository trips,
    TimeProvider clock) : ControllerBase
{
    /// <summary>Submit a batch of position samples.</summary>
    /// <remarks>
    /// The hot path.
    ///
    /// **This endpoint acknowledges only once the batch is durably stored,
    /// never optimistically.** The device deletes its local rows on the
    /// acknowledgement and on nothing else, so an early 200 silently destroys
    /// the evidence the product exists to keep.
    ///
    /// Duplicate delivery is expected and harmless: a device that does not
    /// receive an acknowledgement retries the same batch, and individual
    /// samples deduplicate on their client-generated id.
    ///
    /// Samples are stored exactly as sent. Fixes the phone could not vouch for
    /// are excluded when a track is *read*, where what was excluded can be
    /// shown beside the figure it was excluded from.
    /// </remarks>
    [HttpPost("batch")]
    [ProducesResponseType<TrackingBatchResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<TrackingBatchResponse>> Batch(
        [FromBody] TrackingBatchRequest body,
        CancellationToken ct)
    {
        var state = await trips.StateOfAsync(body.TripId, ct);
        if (state is null)
        {
            return NotFound("No such trip. Create the trip before sending positions for it.");
        }

        // There is no off-trip tracking, and the server enforces it rather than
        // trusting the client to. A modified app must not be able to build a
        // position history for a truck that is not on a job.
        if (!TripMachine.ShouldTrack(state.Value))
        {
            return UnprocessableEntity(
                $"This trip is '{TripMachine.ToWire(state.Value)}' and is not tracking. " +
                "Positions are only recorded while a trip is under way.");
        }

        var incoming = body.Samples
            .Select(s => new IncomingSample(s.Id, s.Lat, s.Lon, s.Accuracy, s.At, s.Speed, s.Battery))
            .ToList();

        // Awaited, and the response is written only after it resolves.
        var outcome = await positions.AppendAsync(
            body.BatchId,
            body.TripId,
            incoming,
            clock.GetUtcNow(),
            ct);

        return new TrackingBatchResponse
        {
            BatchId = body.BatchId,
            Accepted = outcome.Accepted,
            Duplicate = outcome.Duplicate,
            Replayed = outcome.Replayed,
        };
    }

    /// <summary>The cleaned track for a trip.</summary>
    /// <remarks>
    /// Distance always travels with the share of fixes it was computed from. A
    /// distance derived from 30% of the fixes is not wrong, but nobody should
    /// be shown it without knowing that.
    /// </remarks>
    [HttpGet("trip/{tripId:guid}/track")]
    [ProducesResponseType<TrackResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TrackResponse>> Track(Guid tripId, CancellationToken ct)
    {
        if (!await trips.ExistsAsync(tripId, ct))
        {
            return NotFound("No such trip.");
        }

        var raw = await positions.ForTripAsync(tripId, ct);
        var cleaned = Geo.Clean(raw);
        var now = clock.GetUtcNow();
        var silent = Tracker.SilentFor(cleaned.Kept, now);

        return new TrackResponse
        {
            Kept = cleaned.Kept.Count,
            Dropped = cleaned.Dropped.Count,
            Quality = Geo.FixQuality(cleaned),
            DistanceMetres = Geo.DistanceTravelled(cleaned),
            Observation = Tracker.Observe(cleaned.Kept, now).ToString().ToLowerInvariant(),
            SilentForMs = silent is null ? null : (long)silent.Value.TotalMilliseconds,
        };
    }
}
