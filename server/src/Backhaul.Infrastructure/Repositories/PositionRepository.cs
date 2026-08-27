using Backhaul.Domain.Access;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record BatchOutcome(int Accepted, int Duplicate, bool Replayed);

public sealed record IncomingSample(
    Guid Id,
    double Lat,
    double Lon,
    double Accuracy,
    DateTimeOffset At,
    double? Speed,
    double? Battery);

public sealed class PositionRepository(BackhaulDbContext db)
{
    /// <summary>
    /// Buffers a batch durably, or replays the outcome of one already seen.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This must not return until the samples survive a restart.</b> The
    /// device deletes its local rows on the acknowledgement this produces and
    /// on nothing else, so returning early does not make the endpoint fast —
    /// it makes it destroy evidence.
    /// </para>
    /// <para>
    /// Duplicate delivery is expected rather than exceptional: a device that
    /// does not receive an acknowledgement retries. Deduplication is on the
    /// client-generated sample id, which is the primary key, so a duplicate is
    /// a no-op by construction.
    /// </para>
    /// </remarks>
    public async Task<BatchOutcome> AppendAsync(
        Guid batchId,
        Guid tripId,
        IReadOnlyList<IncomingSample> incoming,
        DateTimeOffset recordedAt,
        CancellationToken ct = default)
    {
        var seen = await db.IngestBatches
            .Where(b => b.Id == batchId)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (seen is not null)
        {
            return new BatchOutcome(seen.Accepted, seen.Duplicate, Replayed: true);
        }

        var ids = incoming.Select(s => s.Id).ToList();
        var existing = await db.Positions
            .Where(p => ids.Contains(p.Id))
            .Select(p => p.Id)
            .ToListAsync(ct);

        var already = existing.ToHashSet();
        var fresh = incoming
            .Where(s => !already.Contains(s.Id))
            // A batch that repeats an id within itself would otherwise fail on
            // the primary key and take the whole upload with it.
            .GroupBy(s => s.Id)
            .Select(group => group.First())
            .ToList();

        foreach (var sample in fresh)
        {
            db.Positions.Add(new PositionSampleEntity
            {
                Id = sample.Id,
                TripId = tripId,
                Lat = sample.Lat,
                Lon = sample.Lon,
                Accuracy = sample.Accuracy,
                At = sample.At,
                Speed = sample.Speed,
                Battery = sample.Battery,
                RecordedAt = recordedAt,
            });
        }

        db.IngestBatches.Add(new IngestBatchEntity
        {
            Id = batchId,
            TripId = tripId,
            Accepted = fresh.Count,
            Duplicate = incoming.Count - fresh.Count,
            RecordedAt = recordedAt,
        });

        // The batch row and the samples commit together. If they did not, a
        // crash between them could acknowledge a batch whose samples were
        // never written — and the device would have deleted them.
        await db.SaveChangesAsync(ct);

        return new BatchOutcome(fresh.Count, incoming.Count - fresh.Count, Replayed: false);
    }

    /// <summary>
    /// Every sample for a trip, oldest first, exactly as sent — and only for a
    /// caller who is on the trip.
    /// </summary>
    /// <remarks>
    /// <para>
    /// **This is the only method on this class that returns a position, and it
    /// cannot be called without a principal.** A truck's location history is
    /// exactly what somebody planning a cargo theft would want, and the product
    /// statement lists theft-by-platform as a live risk. See ADR-0008.
    /// </para>
    /// <para>
    /// The join is against the trips the principal may see, so the filter is
    /// part of the query rather than a check performed before it. An
    /// unauthorised read is an empty list, not an error: the existence of a
    /// trip id is itself information.
    /// </para>
    /// </remarks>
    public async Task<IReadOnlyList<Position>> ForTripAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default)
    {
        var rows = await db.Positions
            .Where(p => p.TripId == tripId)
            .Where(p => db.Trips.Any(trip =>
                trip.Id == p.TripId &&
                ((principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
                 (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
                 (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId))))
            .OrderBy(p => p.At)
            .AsNoTracking()
            .ToListAsync(ct);

        return [.. rows.Select(r => new Position(r.Lat, r.Lon, r.Accuracy, r.At, r.Speed, r.Battery))];
    }

    /// <summary>
    /// Positions for a trip a <b>share link</b> resolved to.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is the only unfiltered path to a position row, and it exists on
    /// purpose.</b> ADR-0008 says no other query path returns positions; the
    /// holder of a share link has no principal to filter against, because
    /// having an account is exactly the friction the wedge exists to avoid.
    /// See ADR-0010.
    /// </para>
    /// <para>
    /// It takes a <see cref="ResolvedShare"/> rather than a bare
    /// <see cref="Guid"/>, so it cannot be called without something a
    /// <see cref="ShareRepository"/> lookup produced. A trip id on its own does
    /// not open this door.
    /// </para>
    /// </remarks>
    public async Task<IReadOnlyList<Position>> ForSharedTripAsync(
        ResolvedShare share,
        CancellationToken ct = default)
    {
        var rows = await db.Positions
            .Where(p => p.TripId == share.TripId)
            .OrderBy(p => p.At)
            .AsNoTracking()
            .ToListAsync(ct);

        return [.. rows.Select(r => new Position(r.Lat, r.Lon, r.Accuracy, r.At, r.Speed, r.Battery))];
    }
}
