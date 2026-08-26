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

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<TripEntity>(trip =>
        {
            trip.HasKey(t => t.Id);
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
    }
}
