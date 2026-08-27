using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record MessageRecord(
    Guid Id,
    string From,
    string Body,
    DateTimeOffset At,
    DateTimeOffset ReceivedAt,
    IReadOnlyList<string> ReadBy);

public sealed record IncidentRecord(
    Guid Id,
    string Kind,
    string Severity,
    DateTimeOffset At,
    double? Lat,
    double? Lon,
    string Note,
    string ReportedBy,
    IReadOnlyList<string> PhotoIds,
    DateTimeOffset? ResolvedAt);

public sealed record WaypointRecord(
    Guid Id,
    string Name,
    string Kind,
    double Lat,
    double Lon,
    double RadiusM,
    int Sequence);

/// <summary>
/// The three things that hang off a trip: its thread, its incidents and its
/// route.
/// </summary>
/// <remarks>
/// One repository rather than three, because they share a single rule and it
/// is the important one: <b>every method takes a <see cref="Principal"/> and
/// composes it into the query.</b> These are the newest read paths in the
/// product and the ones most likely to be copied when the next feature lands,
/// so the filter is in the same shape as <c>TripRepository</c>'s deliberately.
/// See ADR-0008.
/// </remarks>
public sealed class TripDetailRepository(BackhaulDbContext db)
{
    /// <summary>
    /// Trips the principal may see. Private, like its counterpart.
    /// </summary>
    /// <remarks>
    /// Nothing outside this class gets an unfiltered queryable to build on.
    /// </remarks>
    private IQueryable<TripEntity> Visible(Principal principal) =>
        db.Trips.Where(trip =>
            (principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
            (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
            (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId));

    private bool MayTouch(Guid tripId, Principal principal) =>
        Visible(principal).Any(t => t.Id == tripId);

    // --- messages ----------------------------------------------------------

    public async Task<IReadOnlyList<MessageRecord>> MessagesAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default)
    {
        var rows = await db.Messages
            .Where(m => m.TripId == tripId)
            .Where(m => Visible(principal).Any(t => t.Id == m.TripId))
            // Ordered by when it was *written*, ties broken by arrival: the
            // thread is a reconstruction of a conversation, and sorting by
            // arrival puts a dead-zone message after the reply to it.
            .OrderBy(m => m.At)
            .ThenBy(m => m.ReceivedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        return [.. rows.Select(ToRecord)];
    }

    /// <summary>
    /// Appends a message, or returns the one already there.
    /// </summary>
    /// <remarks>
    /// The id comes from the device. A driver who wrote in a dead zone and
    /// retried gets the original back rather than a second copy, exactly as
    /// with a position batch.
    /// </remarks>
    public async Task<MessageRecord?> AddMessageAsync(
        Guid tripId,
        Principal principal,
        Guid id,
        string from,
        string body,
        DateTimeOffset at,
        DateTimeOffset receivedAt,
        CancellationToken ct = default)
    {
        if (!await db.Trips.AnyAsync(t => t.Id == tripId, ct)) return null;
        if (!MayTouch(tripId, principal)) return null;

        var existing = await db.Messages.FirstOrDefaultAsync(m => m.Id == id, ct);
        if (existing is not null) return ToRecord(existing);

        var row = new MessageEntity
        {
            Id = id,
            TripId = tripId,
            From = from,
            Body = body,
            At = at,
            ReceivedAt = receivedAt,
            ReadBy = from,
        };

        db.Messages.Add(row);
        await db.SaveChangesAsync(ct);

        return ToRecord(row);
    }

    /// <summary>Marks everything on a trip read by this caller.</summary>
    /// <remarks>
    /// Read state is the one thing here that is not append-only, and it is
    /// deliberately not evidence: who has looked at a message is a convenience
    /// for a badge count, not a fact anybody argues about.
    /// </remarks>
    public async Task<int> MarkReadAsync(
        Guid tripId,
        Principal principal,
        string party,
        CancellationToken ct = default)
    {
        if (!MayTouch(tripId, principal)) return 0;

        var rows = await db.Messages
            .Where(m => m.TripId == tripId)
            .ToListAsync(ct);

        var changed = 0;
        foreach (var row in rows)
        {
            var seen = row.ReadBy.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
            if (seen.Contains(party)) continue;

            seen.Add(party);
            row.ReadBy = string.Join(',', seen);
            changed++;
        }

        if (changed > 0) await db.SaveChangesAsync(ct);
        return changed;
    }

    // --- incidents ---------------------------------------------------------

    public async Task<IReadOnlyList<IncidentRecord>> IncidentsAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default)
    {
        var rows = await db.Incidents
            .Where(i => i.TripId == tripId)
            .Where(i => Visible(principal).Any(t => t.Id == i.TripId))
            .OrderByDescending(i => i.At)
            .AsNoTracking()
            .ToListAsync(ct);

        return [.. rows.Select(ToRecord)];
    }

    public async Task<IncidentRecord?> AddIncidentAsync(
        Guid tripId,
        Principal principal,
        IncidentEntity incident,
        CancellationToken ct = default)
    {
        if (!MayTouch(tripId, principal)) return null;

        incident.TripId = tripId;
        db.Incidents.Add(incident);
        await db.SaveChangesAsync(ct);

        return ToRecord(incident);
    }

    /// <summary>Marks an incident over. A person, never a timer.</summary>
    public async Task<bool> ResolveIncidentAsync(
        Guid tripId,
        Guid incidentId,
        Principal principal,
        DateTimeOffset at,
        CancellationToken ct = default)
    {
        if (!MayTouch(tripId, principal)) return false;

        var row = await db.Incidents
            .FirstOrDefaultAsync(i => i.Id == incidentId && i.TripId == tripId, ct);
        if (row is null) return false;

        // Never re-opens and never moves the time. When something stopped
        // being a problem is a fact somebody may rely on.
        row.ResolvedAt ??= at;
        await db.SaveChangesAsync(ct);
        return true;
    }

    // --- waypoints ---------------------------------------------------------

    public async Task<IReadOnlyList<WaypointRecord>> WaypointsAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default)
    {
        var rows = await db.Waypoints
            .Where(w => w.TripId == tripId)
            .Where(w => Visible(principal).Any(t => t.Id == w.TripId))
            .OrderBy(w => w.Sequence)
            .AsNoTracking()
            .ToListAsync(ct);

        return [.. rows.Select(ToRecord)];
    }

    /// <summary>
    /// Replaces a trip's route.
    /// </summary>
    /// <remarks>
    /// Replaces rather than appends, and that is the one thing here that is
    /// not append-only. A route is a *plan*: it changes when a shipper adds a
    /// drop or moves one, and versioning a plan would mean every screen
    /// choosing which version it meant. What is evidence is where the truck
    /// actually went, and that lives in the position table where nothing is
    /// ever replaced.
    /// </remarks>
    public async Task<IReadOnlyList<WaypointRecord>?> SetWaypointsAsync(
        Guid tripId,
        Principal principal,
        IReadOnlyList<WaypointEntity> waypoints,
        CancellationToken ct = default)
    {
        if (!MayTouch(tripId, principal)) return null;

        var existing = await db.Waypoints.Where(w => w.TripId == tripId).ToListAsync(ct);
        db.Waypoints.RemoveRange(existing);

        var sequence = 0;
        foreach (var waypoint in waypoints)
        {
            waypoint.Id = Guid.NewGuid();
            waypoint.TripId = tripId;
            waypoint.Sequence = sequence++;
            db.Waypoints.Add(waypoint);
        }

        await db.SaveChangesAsync(ct);
        return [.. waypoints.Select(ToRecord)];
    }

    // --- mapping -----------------------------------------------------------

    private static MessageRecord ToRecord(MessageEntity row) => new(
        row.Id,
        row.From,
        row.Body,
        row.At,
        row.ReceivedAt,
        row.ReadBy.Split(',', StringSplitOptions.RemoveEmptyEntries));

    private static IncidentRecord ToRecord(IncidentEntity row) => new(
        row.Id,
        row.Kind,
        row.Severity,
        row.At,
        row.Lat,
        row.Lon,
        row.Note,
        row.ReportedBy,
        row.PhotoIds.Split(',', StringSplitOptions.RemoveEmptyEntries),
        row.ResolvedAt);

    private static WaypointRecord ToRecord(WaypointEntity row) => new(
        row.Id,
        row.Name,
        row.Kind,
        row.Lat,
        row.Lon,
        row.RadiusM,
        row.Sequence);
}
