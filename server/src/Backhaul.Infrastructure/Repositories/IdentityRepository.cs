using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>One paper waiting for a reviewer, and how long it has waited.</summary>
public sealed record QueuedClaim(
    Guid CarrierId,
    string Paper,
    DateTimeOffset ClaimedAt,
    TimeSpan Waited);

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
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var row = await ProfileAsync(userId, ct);

        /*
            The claim as a row, beside the flag.

            The flag is what the tier ladder reads; the row is what a reviewer
            reads, and it is the only thing that knows how long a paper has
            waited. Claiming again while a row is open changes nothing —
            tapping the same switch twice is not two uploads. Claiming after
            a review opens a fresh row, and withdrawing closes the open one
            without an answer. See ADR-0022.
        */
        var name = Wire(paper);
        var open = await db.PaperClaims
            .Where(c => c.CarrierId == userId && c.Paper == name && c.ReviewedAt == null && c.WithdrawnAt == null)
            .FirstOrDefaultAsync(ct);

        if (held && open is null)
        {
            db.PaperClaims.Add(new PaperClaimEntity { CarrierId = userId, Paper = name, ClaimedAt = now });
        }
        else if (!held && open is not null)
        {
            open.WithdrawnAt = now;
        }

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
        Guid reviewerId,
        DateTimeOffset now,
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

        // The answer closes the open claim, if there is one to close. A
        // refusal of a paper nobody currently claims still clears the flag
        // above; it has no row to answer.
        var name = Wire(paper);
        var open = await db.PaperClaims
            .Where(c => c.CarrierId == carrierId && c.Paper == name && c.ReviewedAt == null && c.WithdrawnAt == null)
            .FirstOrDefaultAsync(ct);
        if (open is not null)
        {
            open.ReviewedAt = now;
            open.ReviewedBy = reviewerId;
            open.Verified = verified;
        }

        await db.SaveChangesAsync(ct);
        return row;
    }

    /// <summary>
    /// The papers nobody has answered about, oldest first.
    /// </summary>
    /// <remarks>
    /// Age is the queue's whole point: not that work exists but which of it
    /// has been waiting a week. Computed against the clock passed in, so the
    /// dispatcher and the route agree on what "an hour old" means.
    /// </remarks>
    public async Task<IReadOnlyList<QueuedClaim>> QueueAsync(
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var rows = await db.PaperClaims
            .Where(c => c.ReviewedAt == null && c.WithdrawnAt == null)
            .OrderBy(c => c.ClaimedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        return rows
            .Select(c => new QueuedClaim(c.CarrierId, c.Paper, c.ClaimedAt, now - c.ClaimedAt))
            .ToList();
    }

    /// <summary>The paper's name on the wire, which is also its name in the row.</summary>
    private static string Wire(Paper paper) => paper switch
    {
        Paper.Identity => "identity",
        Paper.Licence => "licence",
        Paper.Registration => "registration",
        Paper.Insurance => "insurance",
        _ => throw new ArgumentOutOfRangeException(nameof(paper)),
    };

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
