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
