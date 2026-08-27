using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure;

public sealed class BackhaulDbContext(DbContextOptions<BackhaulDbContext> options)
    : DbContext(options)
{
    public DbSet<TripEntity> Trips => Set<TripEntity>();

    public DbSet<TripEventEntity> TripEvents => Set<TripEventEntity>();

    public DbSet<PositionSampleEntity> Positions => Set<PositionSampleEntity>();

    public DbSet<IngestBatchEntity> IngestBatches => Set<IngestBatchEntity>();

    public DbSet<AccessTokenEntity> AccessTokens => Set<AccessTokenEntity>();

    public DbSet<ShareLinkEntity> ShareLinks => Set<ShareLinkEntity>();

    public DbSet<SignInChallengeEntity> SignInChallenges => Set<SignInChallengeEntity>();

    public DbSet<AccountEntity> Accounts => Set<AccountEntity>();

    public DbSet<MessageEntity> Messages => Set<MessageEntity>();

    public DbSet<IncidentEntity> Incidents => Set<IncidentEntity>();

    public DbSet<WaypointEntity> Waypoints => Set<WaypointEntity>();

    public DbSet<DeliveryEntity> Deliveries => Set<DeliveryEntity>();

    public DbSet<DropEntity> Drops => Set<DropEntity>();

    public DbSet<LevyEntity> Levies => Set<LevyEntity>();

    public DbSet<CarrierProfileEntity> CarrierProfiles => Set<CarrierProfileEntity>();

    public DbSet<VehicleEntity> Vehicles => Set<VehicleEntity>();

    public DbSet<DuressEntity> DuressSignals => Set<DuressEntity>();

    /// <summary>What a trip was agreed for. Absent on a tracking-only trip.</summary>
    public DbSet<TripTermsEntity> TripTerms => Set<TripTermsEntity>();

    /// <summary>The load board.</summary>
    public DbSet<LoadEntity> Loads => Set<LoadEntity>();

    /// <summary>Offers on the loads.</summary>
    public DbSet<BidEntity> Bids => Set<BidEntity>();

    /// <summary>What each side said about the other after a trip.</summary>
    public DbSet<ReviewEntity> Reviews => Set<ReviewEntity>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<TripEntity>(trip =>
        {
            trip.HasKey(t => t.Id);

            // Every authorised read filters on one of these three.
            trip.HasIndex(t => t.DriverId);
            trip.HasIndex(t => t.CarrierId);
            trip.HasIndex(t => t.ShipperId);
            trip.HasMany(t => t.Events)
                .WithOne()
                .HasForeignKey(e => e.TripId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        model.Entity<TripEventEntity>(evt =>
        {
            evt.HasKey(e => e.Id);

            // The history's order, and a guard against a concurrent append
            // producing two events claiming the same position in it.
            evt.HasIndex(e => new { e.TripId, e.Sequence }).IsUnique();
        });

        model.Entity<PositionSampleEntity>(sample =>
        {
            // The client-generated id is the primary key, which is what makes
            // duplicate delivery harmless by construction rather than by a
            // check somebody has to remember to write.
            sample.HasKey(s => s.Id);
            sample.HasIndex(s => new { s.TripId, s.At });
        });

        model.Entity<IngestBatchEntity>(batch => batch.HasKey(b => b.Id));

        model.Entity<AccessTokenEntity>(token =>
        {
            // The hash is the key: a lookup is a lookup by hash, and there is
            // no path that finds a token by anything else.
            token.HasKey(t => t.Hash);
            token.HasIndex(t => t.UserId);
        });

        model.Entity<MessageEntity>(message =>
        {
            // The client-generated id is the key, which makes a retried
            // message from a dead zone harmless by construction.
            message.HasKey(m => m.Id);
            message.HasIndex(m => new { m.TripId, m.At });
        });

        model.Entity<IncidentEntity>(incident =>
        {
            incident.HasKey(i => i.Id);
            incident.HasIndex(i => new { i.TripId, i.At });
        });

        model.Entity<WaypointEntity>(waypoint =>
        {
            waypoint.HasKey(w => w.Id);

            // A route's order, and a guard against two waypoints claiming the
            // same position in it.
            waypoint.HasIndex(w => new { w.TripId, w.Sequence }).IsUnique();
        });

        model.Entity<DeliveryEntity>(delivery =>
        {
            // One per trip, keyed by it. Two deliveries for one handover is
            // not a state anybody should have to reason about.
            delivery.HasKey(d => d.TripId);
        });

        model.Entity<DropEntity>(drop =>
        {
            drop.HasKey(d => d.Id);
            drop.HasIndex(d => new { d.TripId, d.Sequence }).IsUnique();
        });

        model.Entity<LevyEntity>(levy =>
        {
            // The client-generated id is the key, so a driver retrying from a
            // checkpoint with no signal does not pay twice on paper.
            levy.HasKey(l => l.Id);
            levy.HasIndex(l => new { l.TripId, l.At });
        });

        model.Entity<CarrierProfileEntity>(profile => profile.HasKey(p => p.UserId));

        model.Entity<VehicleEntity>(vehicle =>
        {
            vehicle.HasKey(v => v.Id);
            vehicle.HasIndex(v => v.CarrierId);

            // One plate per carrier. The same truck registered twice is two
            // sets of papers that can disagree about the same vehicle.
            vehicle.HasIndex(v => new { v.CarrierId, v.Plate }).IsUnique();
        });

        model.Entity<DuressEntity>(duress =>
        {
            duress.HasKey(d => d.Id);

            // Every read is "is anything open on this trip", and the answer
            // has to be instant.
            duress.HasIndex(d => new { d.TripId, d.At });
        });

        model.Entity<TripTermsEntity>(terms =>
        {
            // Keyed by the trip, because there is exactly one set of terms per
            // trip and a surrogate key would allow two.
            terms.HasKey(t => t.TripId);
        });

        model.Entity<LoadEntity>(load =>
        {
            load.HasKey(l => l.Id);

            // The board's own query: what is still open, soonest expiry first.
            load.HasIndex(l => new { l.AwardedAt, l.ExpiresAt });
            load.HasIndex(l => l.ShipperId);
        });

        model.Entity<BidEntity>(bid =>
        {
            bid.HasKey(b => b.Id);
            bid.HasIndex(b => b.LoadId);

            // One live bid per carrier per load. Two would let a carrier
            // bracket the auction and it is not an auction.
            bid.HasIndex(b => new { b.LoadId, b.CarrierId }).IsUnique();
        });

        model.Entity<ReviewEntity>(review =>
        {
            review.HasKey(r => r.Id);

            // The profile read: every review about one person.
            review.HasIndex(r => r.AboutUserId);

            // One review per side per trip. A second would let somebody
            // answer the same question twice and have both counted.
            review.HasIndex(r => new { r.TripId, r.By }).IsUnique();
        });

        model.Entity<SignInChallengeEntity>(challenge =>
        {
            challenge.HasKey(c => c.Id);

            // Every lookup is "the newest challenge for this number", and the
            // rate limit counts them per number per hour.
            challenge.HasIndex(c => new { c.Phone, c.IssuedAt });
        });

        model.Entity<AccountEntity>(account =>
        {
            account.HasKey(a => a.Id);

            // One account per number, enforced by the database rather than by
            // a check before the insert: two requests for a first-time number
            // arriving together would otherwise make two accounts for one
            // driver, and the second one owns none of their trips.
            account.HasIndex(a => a.Phone).IsUnique();
        });

        model.Entity<ShareLinkEntity>(link =>
        {
            // Same shape as a token, for the same reason: the public route
            // looks a link up by hash and by nothing else.
            link.HasKey(l => l.Hash);

            // The owner's side works from the id, which is safe to show. The
            // uniqueness constraint is what makes "revoke this one" a single
            // row rather than a filter.
            link.HasIndex(l => l.Id).IsUnique();
            link.HasIndex(l => l.TripId);
        });
    }
}
