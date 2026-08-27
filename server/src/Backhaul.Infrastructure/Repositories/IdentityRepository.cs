using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>Who a carrier is, what they drive, and when a driver is in trouble.</summary>
public sealed class IdentityRepository(BackhaulDbContext db)
{
    // --- the carrier's own profile -----------------------------------------

    /// <summary>
    /// The caller's own profile, created empty the first time.
    /// </summary>
    /// <remarks>
    /// Keyed by the caller rather than by an id in the path: there is no route
    /// here that reads somebody else's papers, because a tier is the only part
    /// of this anybody else needs and it travels on a bid.
    /// </remarks>
    public async Task<CarrierProfileEntity> ProfileAsync(
        Guid userId,
        CancellationToken ct = default)
    {
        var row = await db.CarrierProfiles.FirstOrDefaultAsync(p => p.UserId == userId, ct);
        if (row is not null) return row;

        row = new CarrierProfileEntity { UserId = userId };
        db.CarrierProfiles.Add(row);
        await db.SaveChangesAsync(ct);
        return row;
    }

    /// <summary>
    /// Records that a paper is held.
    /// </summary>
    /// <remarks>
    /// Records that it exists, not that it is genuine. Verification is a human
    /// step this endpoint does not pretend to perform, and the tier it feeds
    /// is only as good as whoever checks the upload.
    /// </remarks>
    public async Task<CarrierProfileEntity> SetPaperAsync(
        Guid userId,
        Paper paper,
        bool held,
        CancellationToken ct = default)
    {
        var row = await ProfileAsync(userId, ct);

        switch (paper)
        {
            case Paper.Identity: row.HasIdentity = held; break;
            case Paper.Licence: row.HasLicence = held; break;
            case Paper.Registration: row.HasRegistration = held; break;
            case Paper.Insurance: row.HasInsurance = held; break;
        }

        await db.SaveChangesAsync(ct);
        return row;
    }

    // --- vehicles ----------------------------------------------------------

    public async Task<IReadOnlyList<VehicleEntity>> VehiclesAsync(
        Guid carrierId,
        CancellationToken ct = default) =>
        await db.Vehicles
            .Where(v => v.CarrierId == carrierId)
            .OrderBy(v => v.Plate)
            .AsNoTracking()
            .ToListAsync(ct);

    public async Task<VehicleEntity> SaveVehicleAsync(
        VehicleEntity vehicle,
        CancellationToken ct = default)
    {
        var existing = await db.Vehicles
            .FirstOrDefaultAsync(v => v.CarrierId == vehicle.CarrierId && v.Plate == vehicle.Plate, ct);

        if (existing is null)
        {
            vehicle.Id = Guid.NewGuid();
            db.Vehicles.Add(vehicle);
            await db.SaveChangesAsync(ct);
            return vehicle;
        }

        existing.Truck = vehicle.Truck;
        existing.LicenceExpires = vehicle.LicenceExpires;
        existing.RoadworthinessExpires = vehicle.RoadworthinessExpires;
        existing.InsuranceExpires = vehicle.InsuranceExpires;
        existing.PermitExpires = vehicle.PermitExpires;
        existing.RetiredAt = vehicle.RetiredAt;

        await db.SaveChangesAsync(ct);
        return existing;
    }

    // --- duress ------------------------------------------------------------

    /// <summary>
    /// Records an alarm.
    /// </summary>
    /// <remarks>
    /// Deliberately unconditional on trip membership. A driver raising an
    /// alarm on a trip the server thinks they are not on is exactly the
    /// situation where refusing would be worst, and the signal is worth more
    /// than the tidiness of the record.
    /// </remarks>
    public async Task<DuressEntity> RaiseAsync(
        DuressEntity signal,
        CancellationToken ct = default)
    {
        signal.Id = Guid.NewGuid();
        db.DuressSignals.Add(signal);
        await db.SaveChangesAsync(ct);
        return signal;
    }

    /// <summary>Open alarms on a trip.</summary>
    public async Task<IReadOnlyList<DuressEntity>> OpenDuressAsync(
        Guid tripId,
        CancellationToken ct = default) =>
        await db.DuressSignals
            .Where(d => d.TripId == tripId && d.ClearedAt == null)
            .OrderByDescending(d => d.At)
            .AsNoTracking()
            .ToListAsync(ct);

    /// <summary>A person says it is over. Never a timer.</summary>
    public async Task<bool> ClearDuressAsync(
        Guid id,
        Guid clearedBy,
        DateTimeOffset at,
        CancellationToken ct = default)
    {
        var row = await db.DuressSignals.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (row is null) return false;

        row.ClearedAt ??= at;
        row.ClearedBy ??= clearedBy;
        await db.SaveChangesAsync(ct);
        return true;
    }
}
