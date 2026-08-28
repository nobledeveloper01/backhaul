using Backhaul.Domain;
using Backhaul.Domain.Access;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record LoadRecord(
    Guid Id,
    Guid ShipperId,
    string OriginName,
    string DestinationName,
    double OriginLat,
    double OriginLon,
    double DestinationLat,
    double DestinationLon,
    string Cargo,
    double WeightTonnes,
    string Requires,
    long? OfferedKobo,
    DateTimeOffset ReadyBy,
    DateTimeOffset ExpiresAt,
    Guid? AwardedToCarrierId);

public sealed record BidRecord(
    Guid Id,
    Guid LoadId,
    Guid CarrierId,
    long AmountKobo,
    double AtLat,
    double AtLon,
    DateTimeOffset PlacedAt,
    int TripsCompleted,
    int TripsPromised,
    int TripsOnTime);

/// <summary>
/// The load board and the offers on it.
/// </summary>
/// <remarks>
/// <para>
/// The one repository whose main read is not principal-filtered, and it says
/// so out loud. A load board that only shows a carrier their own loads is not
/// a load board; what is filtered instead is <em>what is on offer</em> — open,
/// unexpired, not yet awarded. Writes are principal-filtered as usual.
/// </para>
/// <para>
/// A load carries no phone number and no contact of any kind. What a carrier
/// gets from the board is where, what, when and how much; who is behind it
/// becomes knowable when a bid is accepted, which is the point at which the
/// two parties have agreed to know each other.
/// </para>
/// </remarks>
public sealed class MarketRepository(BackhaulDbContext db, TripRepository trips)
{
    /// <summary>What is still on offer, soonest to expire first.</summary>
    public async Task<IReadOnlyList<LoadRecord>> BoardAsync(
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var rows = await db.Loads
            .Where(l => l.AwardedAt == null && l.ExpiresAt > now)
            .OrderBy(l => l.ExpiresAt)
            .AsNoTracking()
            .ToListAsync(ct);

        return rows.Select(ToRecord).ToList();
    }

    /// <summary>
    /// A shipper's own loads, newest first, awarded ones included.
    /// </summary>
    /// <remarks>
    /// Not the board. The board is what is still on offer; this is what a
    /// shipper posted, and the two diverge the moment one is awarded — a
    /// shipper who could no longer see a load they had posted would have no
    /// way to reach the bids on it.
    /// </remarks>
    public async Task<IReadOnlyList<LoadRecord>> MineAsync(
        Principal principal,
        CancellationToken ct = default)
    {
        if (principal.Role != Role.Shipper) return [];

        var rows = await db.Loads
            .Where(l => l.ShipperId == principal.UserId)
            .OrderByDescending(l => l.ReadyBy)
            .AsNoTracking()
            .ToListAsync(ct);

        return rows.Select(ToRecord).ToList();
    }

    public async Task<LoadRecord?> LoadAsync(Guid loadId, CancellationToken ct = default)
    {
        var row = await db.Loads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == loadId, ct);
        return row is null ? null : ToRecord(row);
    }

    /// <summary>
    /// Post or amend a load. Null when the caller is not its shipper.
    /// </summary>
    /// <remarks>
    /// A load already awarded is frozen: amending the weight of a load a
    /// carrier is driving to collect is not an amendment, it is a different
    /// load. The caller gets `false` and a sentence rather than a silent
    /// no-op.
    /// </remarks>
    public async Task<(LoadRecord? Load, bool Awarded)> SaveLoadAsync(
        Guid loadId,
        Principal principal,
        Action<LoadEntity> fill,
        CancellationToken ct = default)
    {
        if (principal.Role != Role.Shipper) return (null, false);

        var row = await db.Loads.FirstOrDefaultAsync(l => l.Id == loadId, ct);

        if (row is null)
        {
            row = new LoadEntity { Id = loadId, ShipperId = principal.UserId };
            db.Loads.Add(row);
        }
        else if (row.ShipperId != principal.UserId)
        {
            return (null, false);
        }
        else if (row.AwardedAt is not null)
        {
            return (ToRecord(row), true);
        }

        fill(row);
        await db.SaveChangesAsync(ct);

        return (ToRecord(row), false);
    }

    /// <summary>
    /// Place or replace a carrier's bid on a load.
    /// </summary>
    /// <remarks>
    /// One live bid per carrier per load, replaced rather than appended:
    /// letting a carrier stack three offers lets them bracket the shipper's
    /// decision, and this is a negotiation rather than an auction.
    /// </remarks>
    /// <summary>
    /// The lowest tier this load takes bids from, or null if there is no such
    /// load.
    /// </summary>
    /// <remarks>
    /// Unfiltered by caller on purpose, and it is safe: a load on the board is
    /// readable by every carrier, and the answer is a bar the shipper
    /// published rather than anything about a person.
    /// </remarks>
    public async Task<string?> BarAsync(Guid loadId, CancellationToken ct = default) =>
        await db.Loads
            .AsNoTracking()
            .Where(l => l.Id == loadId)
            .Select(l => l.RequiresTier)
            .FirstOrDefaultAsync(ct);

    public async Task<BidRecord?> PlaceBidAsync(
        Guid loadId,
        Principal principal,
        long amountKobo,
        double lat,
        double lon,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        if (principal.Role != Role.Carrier) return null;

        var load = await db.Loads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == loadId, ct);
        if (load is null || load.AwardedAt is not null || load.ExpiresAt <= now) return null;

        var row = await db.Bids.FirstOrDefaultAsync(
            b => b.LoadId == loadId && b.CarrierId == principal.UserId, ct);

        if (row is null)
        {
            row = new BidEntity { Id = Guid.NewGuid(), LoadId = loadId, CarrierId = principal.UserId };
            db.Bids.Add(row);
        }

        row.AmountKobo = amountKobo;
        row.AtLat = lat;
        row.AtLon = lon;
        row.PlacedAt = now;
        row.WithdrawnAt = null;

        await db.SaveChangesAsync(ct);

        var record = await RecordAsync(row, ct);
        return record;
    }

    /// <summary>
    /// The live bids on a load, with each carrier's record attached.
    /// </summary>
    /// <remarks>
    /// Visible to the load's shipper only. A carrier who could read the other
    /// bids would know exactly what to undercut, and the ranking exists
    /// precisely so the cheapest bid is not automatically the winning one.
    /// </remarks>
    public async Task<IReadOnlyList<BidRecord>?> BidsAsync(
        Guid loadId,
        Principal principal,
        CancellationToken ct = default)
    {
        var load = await db.Loads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == loadId, ct);
        if (load is null) return null;
        if (principal.Role != Role.Shipper || load.ShipperId != principal.UserId) return null;

        var rows = await db.Bids
            .Where(b => b.LoadId == loadId && b.WithdrawnAt == null)
            .AsNoTracking()
            .ToListAsync(ct);

        var records = new List<BidRecord>(rows.Count);
        foreach (var row in rows) records.Add(await RecordAsync(row, ct));
        return records;
    }

    /// <summary>Award the load to a carrier. The load leaves the board.</summary>
    public async Task<bool> AwardAsync(
        Guid loadId,
        Guid bidId,
        Principal principal,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var load = await db.Loads.FirstOrDefaultAsync(l => l.Id == loadId, ct);
        if (load is null || load.AwardedAt is not null) return false;
        if (principal.Role != Role.Shipper || load.ShipperId != principal.UserId) return false;

        var bid = await db.Bids.AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == bidId && b.LoadId == loadId && b.WithdrawnAt == null, ct);
        if (bid is null) return false;

        load.AwardedToCarrierId = bid.CarrierId;
        load.AwardedAt = now;

        /*
            The trip, in the same transaction.

            An awarded load with no trip is a shipper and a carrier who agreed
            inside this product and then have to arrange the rest of it in a
            WhatsApp thread — the exact thing the wedge exists to stop. It was
            the state this repository left behind on every award. See ADR-0019.

            The carrier is in the driver's slot. Most of this market is
            owner-operators, for whom that is simply true; for a fleet it is
            the carrier holding the trip until they hand it to a driver, which
            is a later action and not this one. Nobody has said who is driving
            at the moment a bid is accepted, and a trip with an empty driver
            would put a special case in the query filter that is the whole of
            this server's authorisation.
        */
        var parties = new TripParties(bid.CarrierId, bid.CarrierId, load.ShipperId);
        var opened = TripHistory.Apply(
            [],
            TripState.Open,
            now,
            TripActor.Shipper,
            $"Awarded from the board: {load.Cargo}");

        // The machine cannot refuse a first `open`, and unwrapping a closed
        // hierarchy with a cast is where a file stops trusting its own types.
        if (opened is not TransitionResult.Accepted accepted)
        {
            throw new InvalidOperationException("Opening a trip from an award was refused.");
        }

        trips.Stage(
            TripIdFor(loadId),
            new Corridor(load.OriginName, load.DestinationName),
            parties,
            accepted.Event,
            now);

        // One save. Both rows, or neither.
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>The trip a load becomes when it is awarded.</summary>
    /// <remarks>
    /// Derived rather than generated, so a retry cannot mint a second trip for
    /// one load and a caller who holds the load id already knows what the trip
    /// is called. Guessable, and that is fine: a trip is visible to its three
    /// parties and to nobody else (ADR-0008), so knowing an id buys nothing.
    /// The one route in this product where an id genuinely is a capability is
    /// the public share link, and it is not this. See ADR-0019.
    /// </remarks>
    public static Guid TripIdFor(Guid loadId)
    {
        var seeded = System.Security.Cryptography.SHA256.HashData(loadId.ToByteArray());
        return new Guid(seeded.AsSpan(0, 16));
    }

    /// <summary>
    /// A carrier's completed and on-time counts, for the bid ranking.
    /// </summary>
    /// <remarks>
    /// Counted on every read rather than stored, for the same reason a trust
    /// tier is: a stored count is a stored copy of a rule, and a copy that
    /// drifts is a carrier who is one thing on their own screen and another on
    /// a shipper's.
    /// </remarks>
    private async Task<BidRecord> RecordAsync(BidEntity row, CancellationToken ct)
    {
        var record = await CarrierRecord.ForAsync(db, row.CarrierId, ct);

        return new BidRecord(
            row.Id,
            row.LoadId,
            row.CarrierId,
            row.AmountKobo,
            row.AtLat,
            row.AtLon,
            row.PlacedAt,
            record.TripsCompleted,
            record.TripsPromised,
            record.TripsOnTime);
    }

    private static LoadRecord ToRecord(LoadEntity row) => new(
        row.Id,
        row.ShipperId,
        row.OriginName,
        row.DestinationName,
        row.OriginLat,
        row.OriginLon,
        row.DestinationLat,
        row.DestinationLon,
        row.Cargo,
        row.WeightTonnes,
        row.Requires,
        row.OfferedKobo,
        row.ReadyBy,
        row.ExpiresAt,
        row.AwardedToCarrierId);
}
