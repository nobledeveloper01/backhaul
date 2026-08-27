using Backhaul.Domain.Access;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>One condition that is true right now, on one trip.</summary>
public sealed record OpenAlert(
    AlertKind Kind,
    Guid TripId,
    string Corridor,
    DateTimeOffset At,
    DateTimeOffset? LastSentAt);

/// <summary>
/// What is true right now that somebody should be told about.
/// </summary>
/// <remarks>
/// <para>
/// Alerts are <b>derived, never stored</b>. A stored alert is a stored copy of
/// a condition, and a copy that drifts is a shipper being told a truck is
/// stalled while they watch it move. Every row here is read from the same
/// evidence the trip screens read.
/// </para>
/// <para>
/// <c>LastSentAt</c> comes from what was actually sent — the one stored part
/// of the alerting path, and the reason <c>repeatAfterMs</c> works. Without it
/// a shipper on a northern corridor is told about the same coverage gap every
/// time the dispatcher runs, and then the alert that matters is one of forty
/// they ignored that day.
/// </para>
/// </remarks>
public sealed class AlertRepository(BackhaulDbContext db)
{
    private IQueryable<TripEntity> Visible(Principal principal) =>
        db.Trips.Where(trip =>
            (principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
            (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
            (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId));

    /// <param name="principal">Whose trips.</param>
    /// <param name="now">The clock, passed in.</param>
    /// <param name="lastSent">
    /// When each thing was last said to this person, by trip and kind. Null
    /// when the caller does not care — the alerts screen renders what is true
    /// now, and only the dispatcher is deciding whether to say it again.
    /// </param>
    /// <param name="ct">Cancellation.</param>
    public async Task<IReadOnlyList<OpenAlert>> OpenAsync(
        Principal principal,
        DateTimeOffset now,
        IReadOnlyDictionary<(Guid TripId, string Kind), DateTimeOffset>? lastSent = null,
        CancellationToken ct = default)
    {
        DateTimeOffset? SentAt(Guid tripId, AlertKind kind) =>
            lastSent is not null && lastSent.TryGetValue((tripId, Alerts.ToWire(kind)), out var at)
                ? at
                : null;

        var trips = await Visible(principal).AsNoTracking().ToListAsync(ct);
        var ids = trips.Select(t => t.Id).ToList();

        var found = new List<OpenAlert>();

        foreach (var trip in trips)
        {
            var corridor = $"{trip.Origin}–{trip.Destination}";

            // The trip's own state, which the tracker wrote.
            var kind = trip.State switch
            {
                "signal_lost" => (AlertKind?)AlertKind.SignalLost,
                "stalled" => AlertKind.Stalled,
                _ => null,
            };

            if (kind is { } observed)
            {
                var since = await db.TripEvents
                    .Where(e => e.TripId == trip.Id && e.State == trip.State)
                    .AsNoTracking()
                    .OrderByDescending(e => e.At)
                    .Select(e => e.At)
                    .FirstOrDefaultAsync(ct);

                found.Add(new OpenAlert(observed, trip.Id, corridor, since, SentAt(trip.Id, observed)));
            }
        }

        // An unresolved incident is open however old it is — that is what
        // unresolved means, and a system that closed its own would close the
        // one nobody dealt with.
        var incidents = await db.Incidents
            .Where(i => ids.Contains(i.TripId) && i.ResolvedAt == null)
            .AsNoTracking()
            .ToListAsync(ct);

        foreach (var incident in incidents)
        {
            var trip = trips.First(t => t.Id == incident.TripId);
            found.Add(new OpenAlert(
                AlertKind.Incident,
                incident.TripId,
                $"{trip.Origin}–{trip.Destination}",
                incident.At,
                SentAt(incident.TripId, AlertKind.Incident)));
        }

        var duress = await db.DuressSignals
            .Where(d => ids.Contains(d.TripId))
            .AsNoTracking()
            .ToListAsync(ct);

        foreach (var signal in duress)
        {
            var trip = trips.First(t => t.Id == signal.TripId);
            found.Add(new OpenAlert(
                AlertKind.Duress,
                signal.TripId,
                $"{trip.Origin}–{trip.Destination}",
                signal.At,
                SentAt(signal.TripId, AlertKind.Duress)));
        }

        // A delivery is worth saying once, and only when it is proved.
        var delivered = await db.Deliveries
            .Where(d => ids.Contains(d.TripId) && d.SealedAt != null)
            .AsNoTracking()
            .ToListAsync(ct);

        foreach (var delivery in delivered)
        {
            var trip = trips.First(t => t.Id == delivery.TripId);
            found.Add(new OpenAlert(
                AlertKind.Delivered,
                delivery.TripId,
                $"{trip.Origin}–{trip.Destination}",
                delivery.SealedAt!.Value,
                SentAt(delivery.TripId, AlertKind.Delivered)));
        }

        return found;
    }
}
