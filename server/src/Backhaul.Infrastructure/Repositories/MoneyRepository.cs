using Backhaul.Domain.Access;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>The commercial terms of a trip, as the money engines need them.</summary>
public sealed record TermsRecord(
    Guid TripId,
    string Truck,
    long AgreedKobo,
    DateTimeOffset AcceptedAt,
    double DistanceM,
    long DriverPayKobo,
    long DriverAdvanceKobo,
    DateTimeOffset? DriverPaidAt,
    // When the shipper was promised it, or null if nobody said. The only thing
    // a carrier's punctuality can honestly be measured against.
    DateTimeOffset? DeliverBy);

/// <summary>What the platform already knows when a release is being decided.</summary>
public sealed record EvidenceRecord(
    string State,
    long MovingForMs,
    bool PodSealed,
    DateTimeOffset? DeliveredAt,
    bool ExceptionRaised);

/// <summary>One delivered trip from the driver's side, for a statement.</summary>
public sealed record EarningRecord(
    Guid TripId,
    string Corridor,
    DateTimeOffset DeliveredAt,
    double DistanceM,
    long PayKobo,
    long AdvanceKobo,
    long SpentKobo,
    DateTimeOffset? PaidAt);

/// <summary>
/// What a trip is worth, what it cost, and what is still owed.
/// </summary>
/// <remarks>
/// No arithmetic lives here. Every figure this hands back is read from a row;
/// the rules that turn rows into money are in <c>Backhaul.Domain.Money</c>,
/// which the parity fixtures hold to the same answers the app gives.
///
/// Every method takes a <see cref="Principal"/> and composes it into the
/// query, and an unauthorised read is a 404 rather than a 403. See ADR-0008.
/// </remarks>
public sealed class MoneyRepository(BackhaulDbContext db)
{
    private IQueryable<TripEntity> Visible(Principal principal) =>
        db.Trips.Where(trip =>
            (principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
            (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
            (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId));

    /// <summary>
    /// Save what a trip was agreed for, or null when the caller may not see it.
    /// </summary>
    /// <remarks>
    /// The write lives here rather than in the controller so the principal is
    /// composed into the query that finds the trip, exactly as every read does.
    /// A controller that builds its own filter is a controller that will get it
    /// slightly wrong the second time somebody copies it.
    ///
    /// A replace rather than an append: terms are agreed once by two people and
    /// then do not move. The trip's own history is append-only and stays that
    /// way — see ADR-0003.
    /// </remarks>
    public async Task<TermsRecord?> SaveTermsAsync(
        Guid tripId,
        Principal principal,
        Action<TripTermsEntity> fill,
        CancellationToken ct = default)
    {
        if (!await Visible(principal).AnyAsync(t => t.Id == tripId, ct)) return null;

        var row = await db.TripTerms.FirstOrDefaultAsync(t => t.TripId == tripId, ct);
        if (row is null)
        {
            row = new TripTermsEntity { TripId = tripId };
            db.TripTerms.Add(row);
        }

        fill(row);
        await db.SaveChangesAsync(ct);

        return new TermsRecord(
            row.TripId,
            row.Truck,
            row.AgreedKobo,
            row.AcceptedAt,
            row.DistanceM,
            row.DriverPayKobo,
            row.DriverAdvanceKobo,
            row.DriverPaidAt,
            row.DeliverBy);
    }

    public async Task<TermsRecord?> TermsAsync(Guid tripId, Principal principal, CancellationToken ct = default)
    {
        var found = await Visible(principal)
            .Where(trip => trip.Id == tripId)
            .Join(db.TripTerms, trip => trip.Id, terms => terms.TripId, (_, terms) => terms)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        return found is null
            ? null
            : new TermsRecord(
                found.TripId,
                found.Truck,
                found.AgreedKobo,
                found.AcceptedAt,
                found.DistanceM,
                found.DriverPayKobo,
                found.DriverAdvanceKobo,
                found.DriverPaidAt,
                found.DeliverBy);
    }

    /// <summary>
    /// What the platform can prove about a trip, right now.
    /// </summary>
    /// <remarks>
    /// Every field is read from evidence the platform already holds — the trip
    /// machine's own state, the sealed proof of delivery, an open exception.
    /// None of it is somebody's word for it, which is the whole reason the
    /// milestones are worth anything.
    /// </remarks>
    public async Task<EvidenceRecord?> EvidenceAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default)
    {
        var trip = await Visible(principal).AsNoTracking().FirstOrDefaultAsync(t => t.Id == tripId, ct);
        if (trip is null) return null;

        var delivery = await db.Deliveries.AsNoTracking().FirstOrDefaultAsync(d => d.TripId == tripId, ct);

        // The second milestone's condition is "moving with positions
        // arriving", so the evidence is the positions themselves rather than
        // the state machine. `signal_lost` is a *state*, and counting it as
        // covered time would credit a carrier for precisely the stretch
        // nobody can account for — which is the stretch a shipper disputes.
        var arriving = await db.Positions
            .Where(p => p.TripId == tripId)
            .AsNoTracking()
            .OrderBy(p => p.At)
            .Select(p => p.At)
            .ToListAsync(ct);

        long movingMs = 0;
        for (var i = 1; i < arriving.Count; i++)
        {
            var step = arriving[i] - arriving[i - 1];
            // A gap longer than the tracker's own silence threshold is not
            // covered time. The same number both sides use to call a trip
            // silent decides what counts here.
            if (step < Tracker.SignalLostAfter) movingMs += (long)step.TotalMilliseconds;
        }

        var exceptionOpen = await db.Incidents
            .AnyAsync(i => i.TripId == tripId && i.ResolvedAt == null, ct);

        return new EvidenceRecord(
            trip.State,
            movingMs,
            delivery?.SealedAt is not null,
            delivery?.SealedAt,
            exceptionOpen);
    }

    /// <summary>What the road took on this trip, from the levies the driver recorded.</summary>
    public async Task<long> LeviesAsync(Guid tripId, Principal principal, CancellationToken ct = default)
    {
        if (!await Visible(principal).AnyAsync(t => t.Id == tripId, ct)) return 0;

        return await db.Levies.Where(l => l.TripId == tripId).SumAsync(l => l.AmountKobo, ct);
    }

    /// <summary>
    /// Every delivered trip this driver has terms for, in a window.
    /// </summary>
    /// <remarks>
    /// Driver-scoped by construction: a statement is one person's pay, and the
    /// query composes the principal rather than filtering afterwards.
    /// </remarks>
    public async Task<IReadOnlyList<EarningRecord>> EarningsAsync(
        Principal principal,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken ct = default)
    {
        var rows = await Visible(principal)
            .Where(trip => trip.State == "delivered")
            .Join(db.TripTerms, trip => trip.Id, terms => terms.TripId, (trip, terms) => new { trip, terms })
            .AsNoTracking()
            .ToListAsync(ct);

        var ids = rows.Select(r => r.trip.Id).ToList();

        var deliveredAt = await db.Deliveries
            .Where(d => ids.Contains(d.TripId) && d.SealedAt != null)
            .Select(d => new { d.TripId, d.SealedAt })
            .AsNoTracking()
            .ToDictionaryAsync(d => d.TripId, d => d.SealedAt!.Value, ct);

        var spent = await db.Levies
            .Where(l => ids.Contains(l.TripId))
            .GroupBy(l => l.TripId)
            .Select(g => new { TripId = g.Key, Total = g.Sum(l => l.AmountKobo) })
            .AsNoTracking()
            .ToDictionaryAsync(g => g.TripId, g => g.Total, ct);

        return rows
            // A delivered trip with no sealed proof has no date to hang the
            // pay on. It is not dropped silently: it is not yet earned, which
            // is what an unsealed delivery means.
            .Where(r => deliveredAt.ContainsKey(r.trip.Id))
            .Select(r => new EarningRecord(
                r.trip.Id,
                $"{r.trip.Origin}–{r.trip.Destination}",
                deliveredAt[r.trip.Id],
                r.terms.DistanceM,
                r.terms.DriverPayKobo,
                r.terms.DriverAdvanceKobo,
                spent.TryGetValue(r.trip.Id, out var total) ? total : 0,
                r.terms.DriverPaidAt))
            .Where(e => e.DeliveredAt >= from && e.DeliveredAt <= to)
            .ToList();
    }
}
