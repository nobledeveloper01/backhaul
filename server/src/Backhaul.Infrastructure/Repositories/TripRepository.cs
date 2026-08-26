using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record TripRecord(Guid Id, IReadOnlyList<TripEvent> History);

public sealed class TripRepository(BackhaulDbContext db)
{
    public async Task<TripRecord?> GetAsync(Guid id, CancellationToken ct = default)
    {
        var events = await db.TripEvents
            .Where(e => e.TripId == id)
            .OrderBy(e => e.Sequence)
            .AsNoTracking()
            .ToListAsync(ct);

        return events.Count == 0 ? null : new TripRecord(id, [.. events.Select(ToDomain)]);
    }

    public async Task<TripState?> StateOfAsync(Guid id, CancellationToken ct = default)
    {
        // Reads the denormalised column rather than the history: the ingest
        // path asks this on every batch and must not pay for loading a
        // three-day trip's events to answer it.
        var state = await db.Trips
            .Where(t => t.Id == id)
            .Select(t => t.State)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        return state is null ? null : TripMachine.FromWire(state);
    }

    public async Task<bool> ExistsAsync(Guid id, CancellationToken ct = default) =>
        await db.Trips.AnyAsync(t => t.Id == id, ct);

    public async Task<TripRecord> CreateAsync(
        Guid id,
        TripEvent first,
        DateTimeOffset recordedAt,
        CancellationToken ct = default)
    {
        db.Trips.Add(new TripEntity { Id = id, State = TripMachine.ToWire(first.State) });
        db.TripEvents.Add(ToEntity(id, 0, first, recordedAt));
        await db.SaveChangesAsync(ct);
        return new TripRecord(id, [first]);
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
        IReadOnlyList<TripEvent> history,
        TripEvent added,
        DateTimeOffset recordedAt,
        CancellationToken ct = default)
    {
        var trip = await db.Trips.FirstAsync(t => t.Id == id, ct);
        trip.State = TripMachine.ToWire(added.State);

        db.TripEvents.Add(ToEntity(id, history.Count, added, recordedAt));
        await db.SaveChangesAsync(ct);

        return new TripRecord(id, [.. history, added]);
    }

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
