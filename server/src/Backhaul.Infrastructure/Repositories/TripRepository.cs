using Backhaul.Domain.Access;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record Corridor(string Origin, string Destination);

public sealed record TripRecord(
    Guid Id,
    Corridor Corridor,
    TripParties Parties,
    IReadOnlyList<TripEvent> History);

/// <summary>
/// One trip on a list, without its history.
/// </summary>
/// <remarks>
/// The list view loads a row per trip and no events at all. Loading a
/// three-day trip's history to render one line of it is what makes a list of
/// twenty trips a list nobody opens twice — and the denormalised state column
/// exists precisely so this query does not have to.
/// </remarks>
public sealed record TripSummaryRecord(
    Guid Id,
    string Origin,
    string Destination,
    TripState State,
    DateTimeOffset StartedAt,
    DateTimeOffset? LastSeenAt,
    bool HasOpenIncident);

/// <summary>
/// Trips, and who may see them.
/// </summary>
/// <remarks>
/// <para>
/// **Every method that returns a trip takes a <see cref="Principal"/>**, and
/// the principal is composed into the query rather than checked after it. A
/// controller check protects the endpoint you remembered; a query filter
/// protects the ones written next year. See ADR-0008.
/// </para>
/// <para>
/// An unauthorised read comes back empty rather than forbidden. The existence
/// of a trip id is itself information, and a 403 confirms it.
/// </para>
/// </remarks>
public sealed class TripRepository(BackhaulDbContext db)
{
    /// <summary>
    /// The trips this caller may see. The only way into the table.
    /// </summary>
    /// <remarks>
    /// Private on purpose. Nothing outside this class gets an unfiltered
    /// <c>IQueryable&lt;TripEntity&gt;</c> to build on.
    /// </remarks>
    private IQueryable<TripEntity> Visible(Principal principal) =>
        db.Trips.Where(trip =>
            (principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
            (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
            (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId));

    public async Task<TripRecord?> GetAsync(
        Guid id,
        Principal principal,
        CancellationToken ct = default)
    {
        var trip = await Visible(principal)
            .Where(t => t.Id == id)
            .Select(t => new { t.DriverId, t.CarrierId, t.ShipperId, t.Origin, t.Destination })
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (trip is null)
        {
            return null;
        }

        var events = await db.TripEvents
            .Where(e => e.TripId == id)
            .OrderBy(e => e.Sequence)
            .AsNoTracking()
            .ToListAsync(ct);

        return events.Count == 0
            ? null
            : new TripRecord(
                id,
                new Corridor(trip.Origin, trip.Destination),
                new TripParties(trip.DriverId, trip.CarrierId, trip.ShipperId),
                [.. events.Select(ToDomain)]);
    }

    /// <summary>
    /// Every trip this caller may see, newest first.
    /// </summary>
    /// <remarks>
    /// No history and no positions: one row per trip plus the two facts a list
    /// renders beside it — when a position last arrived, and whether anything
    /// is unresolved. Both are aggregates, so both are one query rather than
    /// one query per trip.
    /// </remarks>
    public async Task<IReadOnlyList<TripSummaryRecord>> MineAsync(
        Principal principal,
        CancellationToken ct = default)
    {
        var trips = await Visible(principal)
            .Select(t => new { t.Id, t.Origin, t.Destination, t.State })
            .AsNoTracking()
            .ToListAsync(ct);

        var ids = trips.Select(t => t.Id).ToList();

        var opened = await db.TripEvents
            .Where(e => ids.Contains(e.TripId))
            .GroupBy(e => e.TripId)
            .Select(g => new { TripId = g.Key, At = g.Min(e => e.At) })
            .AsNoTracking()
            .ToDictionaryAsync(g => g.TripId, g => g.At, ct);

        var lastSeen = await db.Positions
            .Where(p => ids.Contains(p.TripId))
            .GroupBy(p => p.TripId)
            .Select(g => new { TripId = g.Key, At = g.Max(p => p.At) })
            .AsNoTracking()
            .ToDictionaryAsync(g => g.TripId, g => g.At, ct);

        var open = await db.Incidents
            .Where(i => ids.Contains(i.TripId) && i.ResolvedAt == null)
            .AsNoTracking()
            .Select(i => i.TripId)
            .Distinct()
            .ToListAsync(ct);

        return trips
            .Select(t => new TripSummaryRecord(
                t.Id,
                t.Origin,
                t.Destination,
                TripMachine.FromWire(t.State) ?? TripState.Open,
                opened.TryGetValue(t.Id, out var at) ? at : DateTimeOffset.MinValue,
                lastSeen.TryGetValue(t.Id, out var seen) ? seen : null,
                open.Contains(t.Id)))
            .OrderByDescending(t => t.StartedAt)
            .ToList();
    }

    /// <summary>The trip's state and its parties, for the ingest path.</summary>
    /// <remarks>
    /// Reads the denormalised state column rather than the history: the ingest
    /// path asks this on every batch and must not pay for loading a three-day
    /// trip's events to answer it.
    /// </remarks>
    public async Task<(TripState State, TripParties Parties)?> StateOfAsync(
        Guid id,
        Principal principal,
        CancellationToken ct = default)
    {
        var row = await Visible(principal)
            .Where(t => t.Id == id)
            .Select(t => new { t.State, t.DriverId, t.CarrierId, t.ShipperId })
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (row is null)
        {
            return null;
        }

        var state = TripMachine.FromWire(row.State);
        return state is null
            ? null
            : (state.Value, new TripParties(row.DriverId, row.CarrierId, row.ShipperId));
    }

    public async Task<bool> ExistsAsync(
        Guid id,
        Principal principal,
        CancellationToken ct = default) =>
        await Visible(principal).AnyAsync(t => t.Id == id, ct);

    /// <summary>
    /// Whether the id is taken, ignoring who may see it.
    /// </summary>
    /// <remarks>
    /// The one query that deliberately does not filter, and the only caller is
    /// trip creation. Without it, two shippers could be handed the same trip id
    /// because neither can see the other's trip — and the second write would
    /// fail on the primary key with a message about nothing.
    ///
    /// It answers a boolean about an id the caller already holds, so it leaks
    /// nothing they did not bring with them.
    /// </remarks>
    public async Task<bool> IdIsTakenAsync(Guid id, CancellationToken ct = default) =>
        await db.Trips.AnyAsync(t => t.Id == id, ct);

    public async Task<TripRecord> CreateAsync(
        Guid id,
        Corridor corridor,
        TripParties parties,
        TripEvent first,
        DateTimeOffset recordedAt,
        CancellationToken ct = default)
    {
        db.Trips.Add(new TripEntity
        {
            Id = id,
            State = TripMachine.ToWire(first.State),
            DriverId = parties.DriverId,
            CarrierId = parties.CarrierId,
            ShipperId = parties.ShipperId,
            Origin = corridor.Origin,
            Destination = corridor.Destination,
        });
        db.TripEvents.Add(ToEntity(id, 0, first, recordedAt));
        await db.SaveChangesAsync(ct);
        return new TripRecord(id, corridor, parties, [first]);
    }

    /// <summary>Appends an event and moves the denormalised state with it.</summary>
    /// <remarks>
    /// One <c>SaveChanges</c>, so the event and the state it implies land
    /// together. Written separately they can diverge across a crash, and a
    /// trip whose state disagrees with its own history is worse than one with
    /// no state at all.
    /// </remarks>
    public async Task<TripRecord> AppendAsync(
        Guid id,
        Principal principal,
        Corridor corridor,
        TripParties parties,
        IReadOnlyList<TripEvent> history,
        TripEvent added,
        DateTimeOffset recordedAt,
        CancellationToken ct = default)
    {
        // Filtered again on the write, not only on the read that preceded it.
        // A caller who cannot see the trip cannot move it, and reusing the
        // same predicate means there is one definition of "may touch this".
        var trip = await Visible(principal).FirstAsync(t => t.Id == id, ct);
        trip.State = TripMachine.ToWire(added.State);

        db.TripEvents.Add(ToEntity(id, history.Count, added, recordedAt));
        await db.SaveChangesAsync(ct);

        return new TripRecord(id, corridor, parties, [.. history, added]);
    }

    /// <summary>
    /// The corridor of a trip a <b>share link</b> resolved to.
    /// </summary>
    /// <remarks>
    /// Unfiltered, and takes a <see cref="ResolvedShare"/> rather than a bare
    /// id so it cannot be reached without a link that a lookup produced. Same
    /// reasoning as <c>PositionRepository.ForSharedTripAsync</c>; see ADR-0010.
    /// </remarks>
    public async Task<Corridor?> CorridorForSharedAsync(
        ResolvedShare share,
        CancellationToken ct = default) =>
        await db.Trips
            .Where(t => t.Id == share.TripId)
            .Select(t => new Corridor(t.Origin, t.Destination))
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

    private static TripEventEntity ToEntity(
        Guid tripId,
        int sequence,
        TripEvent evt,
        DateTimeOffset recordedAt) => new()
        {
            TripId = tripId,
            Sequence = sequence,
            State = TripMachine.ToWire(evt.State),
            At = evt.At,
            Actor = evt.Actor.ToString().ToLowerInvariant(),
            Note = evt.Note,
            RecordedAt = recordedAt,
        };

    private static TripEvent ToDomain(TripEventEntity entity) => new(
        TripMachine.FromWire(entity.State)
            ?? throw new InvalidOperationException(
                $"Trip {entity.TripId} holds state '{entity.State}', which the machine " +
                "does not know. A state was removed without a migration."),
        entity.At,
        Enum.Parse<TripActor>(entity.Actor, ignoreCase: true),
        entity.Note);
}
