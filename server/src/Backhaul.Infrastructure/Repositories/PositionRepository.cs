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

    /// <summary>Every sample for a trip, oldest first, exactly as sent.</summary>
    public async Task<IReadOnlyList<Position>> ForTripAsync(
        Guid tripId,
        CancellationToken ct = default)
    {
        var rows = await db.Positions
            .Where(p => p.TripId == tripId)
            .OrderBy(p => p.At)
            .AsNoTracking()
            .ToListAsync(ct);

        return [.. rows.Select(r => new Position(r.Lat, r.Lon, r.Accuracy, r.At, r.Speed, r.Battery))];
    }
}
