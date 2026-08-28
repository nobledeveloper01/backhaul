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
    /// Records that a carrier says a paper is held.
    /// </summary>
    /// <remarks>
    /// A claim, and nothing more. It used to be the same flag the tier ladder
    /// read, which meant a carrier could award themselves a Trusted badge in
    /// four taps; see ADR-0017. Withdrawing a claim withdraws the review with
    /// it — a paper nobody says they hold cannot be a paper somebody checked.
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
            case Paper.Identity:
                row.HasIdentity = held;
                if (!held) row.VerifiedIdentity = false;
                break;
            case Paper.Licence:
                row.HasLicence = held;
                if (!held) row.VerifiedLicence = false;
                break;
            case Paper.Registration:
                row.HasRegistration = held;
                if (!held) row.VerifiedRegistration = false;
                break;
            case Paper.Insurance:
                row.HasInsurance = held;
                if (!held) row.VerifiedInsurance = false;
                break;
        }

        await db.SaveChangesAsync(ct);
        return row;
    }

    /// <summary>
    /// A reviewer's answer about a paper somebody claimed.
    /// </summary>
    /// <remarks>
    /// Only a paper that was claimed can be confirmed — confirming one nobody
    /// submitted would be a reviewer inventing evidence rather than reading
    /// it, and the claim is the thing that has an upload attached. Returns
    /// null when there is nothing to answer about.
    /// </remarks>
    public async Task<CarrierProfileEntity?> ReviewPaperAsync(
        Guid carrierId,
        Paper paper,
        bool verified,
        CancellationToken ct = default)
    {
        var row = await ProfileAsync(carrierId, ct);

        var claimed = paper switch
        {
            Paper.Identity => row.HasIdentity,
            Paper.Licence => row.HasLicence,
            Paper.Registration => row.HasRegistration,
            Paper.Insurance => row.HasInsurance,
            _ => false,
        };

        if (verified && !claimed) return null;

        switch (paper)
        {
            case Paper.Identity: row.VerifiedIdentity = verified; break;
            case Paper.Licence: row.VerifiedLicence = verified; break;
            case Paper.Registration: row.VerifiedRegistration = verified; break;
            case Paper.Insurance: row.VerifiedInsurance = verified; break;
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
