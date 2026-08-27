using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>
/// The handover: what was captured, what is on the truck, and what the road
/// took.
/// </summary>
/// <remarks>
/// Same rule as everywhere: every method takes a <see cref="Principal"/> and
/// composes it into the query. See ADR-0008.
/// </remarks>
public sealed class DeliveryRepository(BackhaulDbContext db)
{
    private IQueryable<TripEntity> Visible(Principal principal) =>
        db.Trips.Where(trip =>
            (principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
            (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
            (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId));

    private Task<bool> MayTouchAsync(Guid tripId, Principal principal, CancellationToken ct) =>
        Visible(principal).AnyAsync(t => t.Id == tripId, ct);

    // --- the delivery ------------------------------------------------------

    public async Task<DeliveryEntity?> DeliveryAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default) =>
        await db.Deliveries
            .Where(d => d.TripId == tripId)
            .Where(d => Visible(principal).Any(t => t.Id == d.TripId))
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

    /// <summary>
    /// Creates or updates the draft.
    /// </summary>
    /// <remarks>
    /// Refuses once it is sealed. A driver adds a photograph and a signature
    /// over a few minutes at a gate, so the draft moves — but the moment it
    /// becomes proof, it stops.
    /// </remarks>
    public async Task<(DeliveryEntity? Row, bool AlreadySealed)> SaveAsync(
        Guid tripId,
        Principal principal,
        Action<DeliveryEntity> apply,
        CancellationToken ct = default)
    {
        if (!await MayTouchAsync(tripId, principal, ct)) return (null, false);

        var row = await db.Deliveries.FirstOrDefaultAsync(d => d.TripId == tripId, ct);

        if (row?.SealedAt is not null) return (row, true);

        if (row is null)
        {
            row = new DeliveryEntity { TripId = tripId };
            db.Deliveries.Add(row);
        }

        apply(row);
        await db.SaveChangesAsync(ct);
        return (row, false);
    }

    /// <summary>Marks it proof. Once.</summary>
    public async Task<bool> SealAsync(
        Guid tripId,
        Principal principal,
        DateTimeOffset at,
        CancellationToken ct = default)
    {
        if (!await MayTouchAsync(tripId, principal, ct)) return false;

        var row = await db.Deliveries.FirstOrDefaultAsync(d => d.TripId == tripId, ct);
        if (row is null) return false;

        row.SealedAt ??= at;
        await db.SaveChangesAsync(ct);
        return true;
    }

    // --- drops -------------------------------------------------------------

    public async Task<IReadOnlyList<DropEntity>> DropsAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default) =>
        await db.Drops
            .Where(d => d.TripId == tripId)
            .Where(d => Visible(principal).Any(t => t.Id == d.TripId))
            .OrderBy(d => d.Sequence)
            .AsNoTracking()
            .ToListAsync(ct);

    /// <summary>
    /// Replaces the drop list.
    /// </summary>
    /// <remarks>
    /// Like the route, and for the same reason: a drop list is a plan until
    /// the truck is loaded. Unlike the route, it refuses once anything has
    /// been signed for — reordering a trailer that is half unloaded is not a
    /// plan change, it is a mistake.
    /// </remarks>
    public async Task<(IReadOnlyList<DropEntity>? Rows, bool AlreadyStarted)> SetDropsAsync(
        Guid tripId,
        Principal principal,
        IReadOnlyList<DropEntity> drops,
        CancellationToken ct = default)
    {
        if (!await MayTouchAsync(tripId, principal, ct)) return (null, false);

        var existing = await db.Drops.Where(d => d.TripId == tripId).ToListAsync(ct);
        if (existing.Any(d => d.DeliveredAt is not null)) return (existing, true);

        db.Drops.RemoveRange(existing);

        var sequence = 0;
        foreach (var drop in drops)
        {
            drop.Id = Guid.NewGuid();
            drop.TripId = tripId;
            drop.Sequence = sequence++;
            db.Drops.Add(drop);
        }

        await db.SaveChangesAsync(ct);
        return (drops, false);
    }

    public async Task<bool> SignDropAsync(
        Guid tripId,
        Guid dropId,
        Principal principal,
        DateTimeOffset at,
        string? exception,
        CancellationToken ct = default)
    {
        if (!await MayTouchAsync(tripId, principal, ct)) return false;

        var row = await db.Drops.FirstOrDefaultAsync(d => d.Id == dropId && d.TripId == tripId, ct);
        if (row is null) return false;

        // Never moves an existing signature time. When goods changed hands is
        // the fact the whole drop exists to record.
        row.DeliveredAt ??= at;
        if (exception is not null) row.Exception = exception;

        await db.SaveChangesAsync(ct);
        return true;
    }

    // --- levies ------------------------------------------------------------

    public async Task<IReadOnlyList<LevyEntity>> LeviesAsync(
        Guid tripId,
        Principal principal,
        CancellationToken ct = default) =>
        await db.Levies
            .Where(l => l.TripId == tripId)
            .Where(l => Visible(principal).Any(t => t.Id == l.TripId))
            .OrderByDescending(l => l.At)
            .AsNoTracking()
            .ToListAsync(ct);

    /// <summary>Records a payment, or returns the one already there.</summary>
    public async Task<LevyEntity?> AddLevyAsync(
        Guid tripId,
        Principal principal,
        LevyEntity levy,
        CancellationToken ct = default)
    {
        if (!await MayTouchAsync(tripId, principal, ct)) return null;

        var existing = await db.Levies.FirstOrDefaultAsync(l => l.Id == levy.Id, ct);
        if (existing is not null) return existing;

        levy.TripId = tripId;
        db.Levies.Add(levy);
        await db.SaveChangesAsync(ct);
        return levy;
    }
}
