using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain;
using Backhaul.Domain.Tracking;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Entities;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>The thread on a trip.</summary>
/// <remarks>
/// Today this conversation happens in a WhatsApp group with forty other
/// messages in it, and when a delivery is argued about the argument is
/// reconstructed from a phone that has since been sold. Here it is part of the
/// trip, and it is part of the dispute pack.
/// </remarks>
[ApiController]
[Route("v1/trips/{tripId:guid}/messages")]
[Tags("trips")]
public sealed class MessagesController(
    TripDetailRepository details,
    TimeProvider clock) : AuthorisedController
{
    /// <summary>The thread, in the order the conversation happened.</summary>
    [HttpGet]
    [ProducesResponseType<List<MessageResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<List<MessageResponse>>> Get(Guid tripId, CancellationToken ct)
    {
        var rows = await details.MessagesAsync(tripId, Caller, ct);
        return rows.Select(ToResponse).ToList();
    }

    /// <summary>Write on the trip.</summary>
    /// <remarks>
    /// Idempotent on the client-generated id. A driver who wrote in a dead
    /// zone and retried gets the original back rather than a second copy in a
    /// thread a dispute is read from.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType<MessageResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MessageResponse>> Post(
        Guid tripId,
        [FromBody] MessageRequest body,
        CancellationToken ct)
    {
        var trimmed = body.Body.Trim();
        if (trimmed.Length == 0)
        {
            return BadRequest("Write something first.");
        }

        var record = await details.AddMessageAsync(
            tripId,
            Caller,
            body.Id,
            body.From,
            trimmed,
            body.At,
            clock.GetUtcNow(),
            ct);

        // 404 rather than 403, as everywhere: the existence of a trip id is
        // itself information.
        return record is null
            ? NotFound("No such trip.")
            : StatusCode(StatusCodes.Status201Created, ToResponse(record));
    }

    /// <summary>Marks the thread read by the caller.</summary>
    [HttpPost("read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Read(Guid tripId, CancellationToken ct)
    {
        await details.MarkReadAsync(tripId, Caller, Caller.Role.ToString().ToLowerInvariant(), ct);
        return NoContent();
    }

    private static MessageResponse ToResponse(MessageRecord row) => new()
    {
        Id = row.Id,
        From = row.From,
        Body = row.Body,
        At = row.At,
        ReceivedAt = row.ReceivedAt,
        ReadBy = [.. row.ReadBy],
    };
}

/// <summary>Problems on the road.</summary>
[ApiController]
[Route("v1/trips/{tripId:guid}/incidents")]
[Tags("trips")]
public sealed class IncidentsController(
    TripDetailRepository details,
    TimeProvider clock) : AuthorisedController
{
    [HttpGet]
    [ProducesResponseType<List<IncidentResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<List<IncidentResponse>>> Get(Guid tripId, CancellationToken ct)
    {
        var rows = await details.IncidentsAsync(tripId, Caller, ct);
        return rows.Select(ToResponse).ToList();
    }

    /// <summary>Report something.</summary>
    /// <remarks>
    /// The severity is optional and the kind's own default is used when it is
    /// absent — a driver at a roadside should not have to classify their own
    /// emergency. The default is the domain's, shared with the app.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType<IncidentResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IncidentResponse>> Post(
        Guid tripId,
        [FromBody] IncidentRequest body,
        CancellationToken ct)
    {
        var kind = Incidents.FromWire(body.Kind);
        if (kind is null) return BadRequest($"Unknown kind '{body.Kind}'.");

        var severity = body.Severity is null
            ? Incidents.DefaultSeverity(kind.Value)
            : Incidents.SeverityFromWire(body.Severity);

        if (severity is null) return BadRequest($"Unknown severity '{body.Severity}'.");

        // The one requirement, and only for the two kinds where one person's
        // word is what the product exists to replace. Security is exempt:
        // nobody photographs a hijack.
        if (Incidents.NeedsPhoto(kind.Value) && body.PhotoIds.Count == 0)
        {
            return UnprocessableEntity(new RefusalResponse
            {
                Refusal = "needs_photo",
                Message = "A report of this kind needs a photograph to be worth anything.",
            });
        }

        var record = await details.AddIncidentAsync(
            tripId,
            Caller,
            new IncidentEntity
            {
                Id = Guid.NewGuid(),
                Kind = Incidents.ToWire(kind.Value),
                Severity = Incidents.ToWire(severity.Value),
                At = body.At,
                ReceivedAt = clock.GetUtcNow(),
                Lat = body.Lat,
                Lon = body.Lon,
                Note = body.Note,
                ReportedBy = body.ReportedBy,
                PhotoIds = string.Join(',', body.PhotoIds),
            },
            ct);

        return record is null
            ? NotFound("No such trip.")
            : StatusCode(StatusCodes.Status201Created, ToResponse(record));
    }

    /// <summary>Mark it over.</summary>
    /// <remarks>
    /// A person, never a timer. A breakdown does not stop being a breakdown
    /// because an hour passed, and a system that closed its own incidents
    /// would close the one nobody dealt with.
    /// </remarks>
    [HttpPost("{incidentId:guid}/resolve")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Resolve(Guid tripId, Guid incidentId, CancellationToken ct)
    {
        var found = await details.ResolveIncidentAsync(
            tripId,
            incidentId,
            Caller,
            clock.GetUtcNow(),
            ct);

        return found ? NoContent() : NotFound("No such incident on this trip.");
    }

    private static IncidentResponse ToResponse(IncidentRecord row)
    {
        var kind = Incidents.FromWire(row.Kind);

        return new IncidentResponse
        {
            Id = row.Id,
            Kind = row.Kind,
            Severity = row.Severity,
            At = row.At,
            Lat = row.Lat,
            Lon = row.Lon,
            Note = row.Note,
            ReportedBy = row.ReportedBy,
            PhotoIds = [.. row.PhotoIds],
            ResolvedAt = row.ResolvedAt,
            // Computed, not stored. The rule lives in the domain and is shared
            // with the app; a stored copy is a copy that can disagree.
            RaisesDispute = kind is not null && Incidents.RaisesDispute(kind.Value),
        };
    }
}

/// <summary>The route, and where the truck actually stopped on it.</summary>
[ApiController]
[Route("v1/trips/{tripId:guid}/waypoints")]
[Tags("trips")]
public sealed class WaypointsController(
    TripDetailRepository details,
    TripRepository trips,
    PositionRepository positions) : AuthorisedController
{
    /// <summary>The route, the visits, and what is chargeable.</summary>
    /// <remarks>
    /// Visits are computed here from the cleaned track rather than stored.
    /// A stored visit is a stored *opinion* about a track, and the track is
    /// the evidence — recomputing means a corrected fix corrects the demurrage
    /// with it.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType<WaypointsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<WaypointsResponse>> Get(Guid tripId, CancellationToken ct)
    {
        if (!await trips.ExistsAsync(tripId, Caller, ct)) return NotFound("No such trip.");

        var route = await details.WaypointsAsync(tripId, Caller, ct);
        var raw = await positions.ForTripAsync(tripId, Caller, ct);
        var cleaned = Geo.Clean(raw);

        var domain = route.Select(ToDomain).ToList();
        var visits = Waypoints.Visits(cleaned.Kept, domain);

        return new WaypointsResponse
        {
            Waypoints = [.. route.Select(ToResponse)],
            Visits =
            [
                .. visits.Select(v => new VisitResponse
                {
                    WaypointId = v.Waypoint.Id,
                    Name = v.Waypoint.Name,
                    Arrived = v.Arrived,
                    Left = v.Left,
                    DurationMs = v.DurationMs,
                    Fixes = v.Fixes,
                }),
            ],
            ChargeableWaitingMs = Waypoints.ChargeableWaitingMs(visits),
        };
    }

    /// <summary>Set the route.</summary>
    /// <remarks>
    /// Replaces rather than appends. A route is a plan and plans change; what
    /// is evidence is where the truck went, and that lives in the position
    /// table where nothing is ever replaced.
    /// </remarks>
    [HttpPut]
    [ProducesResponseType<List<WaypointResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<WaypointResponse>>> Put(
        Guid tripId,
        [FromBody] List<WaypointRequest> body,
        CancellationToken ct)
    {
        foreach (var waypoint in body)
        {
            if (Waypoints.FromWire(waypoint.Kind) is null)
            {
                return BadRequest($"Unknown waypoint kind '{waypoint.Kind}'.");
            }
        }

        var saved = await details.SetWaypointsAsync(
            tripId,
            Caller,
            [
                .. body.Select(w => new WaypointEntity
                {
                    Name = w.Name,
                    Kind = w.Kind,
                    Lat = w.Lat,
                    Lon = w.Lon,
                    RadiusM = w.RadiusM,
                }),
            ],
            ct);

        return saved is null ? NotFound("No such trip.") : saved.Select(ToResponse).ToList();
    }

    private static Waypoint ToDomain(WaypointRecord row) => new(
        row.Id,
        row.Name,
        row.Lat,
        row.Lon,
        Waypoints.FromWire(row.Kind) ?? WaypointKind.Checkpoint,
        row.RadiusM);

    private static WaypointResponse ToResponse(WaypointRecord row) => new()
    {
        Id = row.Id,
        Name = row.Name,
        Kind = row.Kind,
        Lat = row.Lat,
        Lon = row.Lon,
        RadiusM = row.RadiusM,
        Sequence = row.Sequence,
    };
}
