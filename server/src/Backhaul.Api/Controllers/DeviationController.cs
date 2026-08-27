using Backhaul.Api.Auth;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>Whether the truck is going somewhere it should not be.</summary>
/// <param name="Kind">on_course, unknown or deviating.</param>
/// <param name="Detail">The sentence, where there is one.</param>
/// <param name="FurtherM">How much further from the destination than the closest it got.</param>
/// <param name="SinceMs">How much of the window the answer is drawn from.</param>
/// <param name="OffRoute">
/// Whether it is near the declared route — null when no route was declared,
/// which is different from being on one.
/// </param>
/// <param name="HeadingFor">The next waypoint it has not reached, if any.</param>
public sealed record DeviationResponse(
    string Kind,
    string? Detail,
    double? FurtherM,
    long? SinceMs,
    bool? OffRoute,
    string? HeadingFor);

/// <summary>
/// Is the truck going somewhere it should not be?
/// </summary>
/// <remarks>
/// Not cross-track distance. The straight line from Lagos to Kano runs through
/// Kwara farmland and the road is up to 90 km off it for hours — an alarm on
/// every correct trip is an alarm nobody reads. The signal is progress: a truck
/// getting further from its destination for long enough, while moving.
///
/// `unknown` is a first-class answer here and is not the same as "on course".
/// A dead zone is not a course change, and calling it one turns a coverage gap
/// into an accusation.
/// </remarks>
[ApiController]
[Route("v1/trips/{tripId:guid}/deviation")]
[Tags("tracking")]
public sealed class DeviationController(
    PositionRepository positions,
    TripDetailRepository details,
    TripRepository trips,
    TimeProvider clock) : AuthorisedController
{
    [HttpGet]
    [ProducesResponseType<DeviationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeviationResponse>> Get(Guid tripId, CancellationToken ct)
    {
        var route = (await details.WaypointsAsync(tripId, Caller, ct))
            .Select(row => new Waypoint(
                row.Id,
                row.Name,
                row.Lat,
                row.Lon,
                Waypoints.FromWire(row.Kind) ?? WaypointKind.Checkpoint,
                row.RadiusM))
            .ToList();

        var track = await positions.ForTripAsync(tripId, Caller, ct);

        // The destination is the last waypoint the route declares. Without a
        // route there is nothing to measure progress *towards*, and the honest
        // answer is that this cannot be said rather than a reassuring tick.
        var destination = route.LastOrDefault(w => w.Kind == WaypointKind.Destination)
                          ?? route.LastOrDefault();

        if (destination is null)
        {
            if (!await trips.ExistsAsync(tripId, Caller, ct)) return NotFound("No such trip.");

            return new DeviationResponse(
                "unknown",
                "No route declared, so there is nothing to be off.",
                null,
                null,
                null,
                null);
        }

        var now = clock.GetUtcNow();
        var target = new Position(destination.Lat, destination.Lon, 0, now);
        var verdict = Deviation.Of(track, target, now);

        var latest = track.Count == 0 ? null : track[^1];
        var offRoute = latest is null ? null : Deviation.OffRoute(latest, route);

        // Visits are computed, never stored — the same rule the waypoints
        // route follows.
        var visited = Waypoints.Visits(track, route).Select(v => v.Waypoint.Id).ToList();
        var next = Deviation.Heading(visited, route);

        return verdict switch
        {
            DeviationVerdict.OnCourse =>
                new DeviationResponse("on_course", null, null, null, offRoute, next?.Name),

            DeviationVerdict.Unknown unknown =>
                new DeviationResponse("unknown", unknown.Detail, null, null, offRoute, next?.Name),

            DeviationVerdict.Deviating deviating => new DeviationResponse(
                "deviating",
                deviating.Detail,
                deviating.FurtherM,
                deviating.SinceMs,
                offRoute,
                next?.Name),

            _ => throw new InvalidOperationException("unreachable"),
        };
    }
}
