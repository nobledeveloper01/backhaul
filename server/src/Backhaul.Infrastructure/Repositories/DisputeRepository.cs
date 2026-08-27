using Backhaul.Domain.Access;
using Backhaul.Domain.Tracking;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>
/// Everything that happened on a trip, in one list.
/// </summary>
/// <remarks>
/// <para>
/// This is what the append-only history has been for. It reads six tables and
/// converts each row into one <see cref="Evidence"/> item — and it does not
/// summarise, weigh or judge any of them. <c>Dispute.Assemble</c> orders them
/// and says how confident each is; the humans do the rest.
/// </para>
/// <para>
/// Positions are the one thing that is <em>not</em> one row per item. A trip
/// has thousands of fixes and a pack with thousands of lines is a pack nobody
/// reads, so consecutive fixes are collapsed into runs — and a run carries the
/// interval it covers, which is the rule the gap finder needs.
/// </para>
/// </remarks>
public sealed class DisputeRepository(BackhaulDbContext db)
{
    private IQueryable<TripEntity> Visible(Principal principal) =>
        db.Trips.Where(trip =>
            (principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
            (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
            (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId));

    public async Task<IReadOnlyList<Evidence>?> EvidenceAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default)
    {
        if (!await Visible(principal).AnyAsync(t => t.Id == tripId, ct)) return null;

        var found = new List<Evidence>();

        var events = await db.TripEvents
            .Where(e => e.TripId == tripId)
            .AsNoTracking()
            .OrderBy(e => e.At)
            .ToListAsync(ct);

        foreach (var step in events)
        {
            found.Add(new Evidence(
                EvidenceKind.TripEvent,
                step.At,
                null,
                null,
                step.State,
                EvidenceSource.System));
        }

        found.AddRange(await RunsAsync(tripId, ct));

        var messages = await db.Messages
            .Where(m => m.TripId == tripId)
            .AsNoTracking()
            .ToListAsync(ct);

        foreach (var message in messages)
        {
            found.Add(new Evidence(
                EvidenceKind.Message,
                message.At,
                null,
                message.ReceivedAt,
                message.Body,
                SourceOf(message.From)));
        }

        var incidents = await db.Incidents
            .Where(i => i.TripId == tripId)
            .AsNoTracking()
            .ToListAsync(ct);

        foreach (var incident in incidents)
        {
            found.Add(new Evidence(
                EvidenceKind.Incident,
                incident.At,
                incident.ResolvedAt,
                incident.At,
                $"{incident.Kind} — {incident.Note}",
                SourceOf(incident.ReportedBy)));
        }

        var delivery = await db.Deliveries
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.TripId == tripId, ct);

        if (delivery?.SealedAt is { } sealedAt)
        {
            found.Add(new Evidence(
                EvidenceKind.Signature,
                delivery.At,
                null,
                sealedAt,
                $"Signed by {delivery.SignatureName}",
                EvidenceSource.Driver));

            foreach (var photo in delivery.PhotoIds.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                found.Add(new Evidence(
                    EvidenceKind.Photo,
                    delivery.At,
                    null,
                    sealedAt,
                    photo,
                    EvidenceSource.Driver));
            }
        }

        var links = await db.ShareLinks
            .Where(l => l.TripId == tripId)
            .AsNoTracking()
            .ToListAsync(ct);

        foreach (var link in links)
        {
            found.Add(new Evidence(
                EvidenceKind.ShareLink,
                link.IssuedAt,
                link.RevokedAt ?? link.ExpiresAt,
                null,
                link.Scope,
                EvidenceSource.System));
        }

        return found;
    }

    /// <summary>
    /// Consecutive fixes collapsed into runs.
    /// </summary>
    /// <remarks>
    /// A run breaks where the tracker itself would call the trip silent, so
    /// the pack's idea of a gap and the tracker's idea of one are the same
    /// number. Each run carries the interval it covers — treating a run as an
    /// instant is what made a continuously covered trip report nine holes.
    /// </remarks>
    private async Task<IReadOnlyList<Evidence>> RunsAsync(Guid tripId, CancellationToken ct)
    {
        var fixes = await db.Positions
            .Where(p => p.TripId == tripId)
            .AsNoTracking()
            .OrderBy(p => p.At)
            .Select(p => p.At)
            .ToListAsync(ct);

        var runs = new List<Evidence>();
        if (fixes.Count == 0) return runs;

        var from = fixes[0];
        var previous = fixes[0];
        var count = 1;

        void Close(DateTimeOffset to, int fixCount) => runs.Add(new Evidence(
            EvidenceKind.Position,
            from,
            to,
            null,
            $"{fixCount} fixes",
            EvidenceSource.System));

        for (var i = 1; i < fixes.Count; i++)
        {
            if (fixes[i] - previous >= Tracker.SignalLostAfter)
            {
                Close(previous, count);
                from = fixes[i];
                count = 0;
            }

            previous = fixes[i];
            count++;
        }

        Close(previous, count);
        return runs;
    }

    private static EvidenceSource SourceOf(string wire) => wire switch
    {
        "shipper" => EvidenceSource.Shipper,
        "carrier" => EvidenceSource.Carrier,
        "driver" => EvidenceSource.Driver,
        _ => EvidenceSource.System,
    };
}
