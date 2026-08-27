using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record ReviewRecord(
    Guid Id,
    Guid TripId,
    string By,
    Guid AboutUserId,
    IReadOnlyDictionary<string, bool> Answers,
    string Note,
    DateTimeOffset At);

/// <summary>Why a review could not be left.</summary>
public enum ReviewRefusal
{
    NoSuchTrip,
    NotDelivered,
    WindowClosed,
    WrongSide,
}

/// <summary>
/// What each side said about the other.
/// </summary>
/// <remarks>
/// The three-state answer is the whole shape: yes, no, and <em>not asked</em>.
/// Storing a boolean per claim would collapse the third into the second, and a
/// shipper who never needed to phone the driver would be counted as saying the
/// driver could not be reached.
/// </remarks>
public sealed class ReviewRepository(BackhaulDbContext db)
{
    private IQueryable<TripEntity> Visible(Principal principal) =>
        db.Trips.Where(trip =>
            (principal.Role == Role.Driver && trip.DriverId == principal.UserId) ||
            (principal.Role == Role.Carrier && trip.CarrierId == principal.UserId) ||
            (principal.Role == Role.Shipper && trip.ShipperId == principal.UserId));

    /// <summary>
    /// Leave or replace a review of a trip.
    /// </summary>
    /// <remarks>
    /// Replaceable within the window rather than append-only, unlike the trip's
    /// own history: a review is somebody's current opinion and they are allowed
    /// to change it before it closes. What is not allowed is two of them.
    /// </remarks>
    public async Task<(ReviewRecord? Review, ReviewRefusal? Refusal)> SaveAsync(
        Guid tripId,
        Principal principal,
        IReadOnlyDictionary<string, bool> answers,
        string note,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        if (principal.Role == Role.Driver) return (null, ReviewRefusal.WrongSide);

        var trip = await Visible(principal).AsNoTracking().FirstOrDefaultAsync(t => t.Id == tripId, ct);
        if (trip is null) return (null, ReviewRefusal.NoSuchTrip);

        var delivery = await db.Deliveries.AsNoTracking()
            .FirstOrDefaultAsync(d => d.TripId == tripId, ct);

        // The trip is reviewable from the moment there is *proof* it finished,
        // not from the moment somebody said so. A state is a claim.
        if (delivery?.SealedAt is not { } deliveredAt) return (null, ReviewRefusal.NotDelivered);

        if (!Ratings.Reviewable(deliveredAt, now)) return (null, ReviewRefusal.WindowClosed);

        var by = principal.Role == Role.Shipper ? "shipper" : "carrier";

        // A shipper reviews the carrier; a carrier reviews the shipper.
        var about = principal.Role == Role.Shipper ? trip.CarrierId : trip.ShipperId;

        var row = await db.Reviews.FirstOrDefaultAsync(r => r.TripId == tripId && r.By == by, ct);
        if (row is null)
        {
            row = new ReviewEntity { Id = Guid.NewGuid(), TripId = tripId, By = by };
            db.Reviews.Add(row);
        }

        row.AboutUserId = about;
        row.Yes = string.Join(',', answers.Where(a => a.Value).Select(a => a.Key));
        row.No = string.Join(',', answers.Where(a => !a.Value).Select(a => a.Key));
        row.Note = note;
        row.At = now;

        await db.SaveChangesAsync(ct);

        return (ToRecord(row), null);
    }

    /// <summary>
    /// Every review about one person.
    /// </summary>
    /// <remarks>
    /// Not principal-filtered, and deliberately: a record exists so a stranger
    /// can decide whether to trade with somebody, and one only its subject can
    /// read is not a record. It carries no trip ids and no note author — what a
    /// reader gets is counts.
    /// </remarks>
    public async Task<IReadOnlyList<ReviewRecord>> AboutAsync(
        Guid userId,
        CancellationToken ct = default)
    {
        var rows = await db.Reviews
            .Where(r => r.AboutUserId == userId)
            .AsNoTracking()
            .ToListAsync(ct);

        return rows.Select(ToRecord).ToList();
    }

    private static ReviewRecord ToRecord(ReviewEntity row)
    {
        var answers = new Dictionary<string, bool>();

        foreach (var claim in row.Yes.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            answers[claim] = true;
        }

        foreach (var claim in row.No.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            answers[claim] = false;
        }

        return new ReviewRecord(row.Id, row.TripId, row.By, row.AboutUserId, answers, row.Note, row.At);
    }
}
