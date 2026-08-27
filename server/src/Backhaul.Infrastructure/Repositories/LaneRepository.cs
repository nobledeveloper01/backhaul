using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record LaneRecord(
    Guid Id,
    string Name,
    string Origin,
    string Destination,
    string Cargo,
    double WeightKg,
    string Truck,
    string Cadence,
    IReadOnlyList<long> HistoryKobo,
    DateTimeOffset? LastRunAt);

/// <summary>
/// The runs a shipper makes again.
/// </summary>
/// <remarks>
/// A shipper's own list and nothing else — every method composes the principal
/// into the query and refuses anybody who is not a shipper. What a lane is
/// worth is a shipper's own commercial history, and it is not a load board.
/// </remarks>
public sealed class LaneRepository(BackhaulDbContext db)
{
    public async Task<IReadOnlyList<LaneRecord>> MineAsync(
        Principal principal,
        CancellationToken ct = default)
    {
        if (principal.Role != Role.Shipper) return [];

        var rows = await db.Lanes
            .Where(l => l.ShipperId == principal.UserId)
            .AsNoTracking()
            .ToListAsync(ct);

        return rows.Select(ToRecord).ToList();
    }

    public async Task<LaneRecord?> SaveAsync(
        Guid laneId,
        Principal principal,
        Action<LaneEntity> fill,
        CancellationToken ct = default)
    {
        if (principal.Role != Role.Shipper) return null;

        var row = await db.Lanes.FirstOrDefaultAsync(l => l.Id == laneId, ct);

        if (row is null)
        {
            row = new LaneEntity { Id = laneId, ShipperId = principal.UserId };
            db.Lanes.Add(row);
        }
        else if (row.ShipperId != principal.UserId)
        {
            return null;
        }

        fill(row);
        await db.SaveChangesAsync(ct);

        return ToRecord(row);
    }

    /// <summary>
    /// Record what this lane's latest run went for.
    /// </summary>
    /// <remarks>
    /// Appended, never replaced — the history is what the median is taken from,
    /// and a run that could be edited afterwards is a typical price somebody
    /// can move. Only the last runs are read, but all of them are kept.
    /// </remarks>
    public async Task<LaneRecord?> RanAsync(
        Guid laneId,
        Principal principal,
        long paidKobo,
        DateTimeOffset at,
        CancellationToken ct = default)
    {
        if (principal.Role != Role.Shipper) return null;

        var row = await db.Lanes.FirstOrDefaultAsync(
            l => l.Id == laneId && l.ShipperId == principal.UserId, ct);
        if (row is null) return null;

        row.History = string.IsNullOrEmpty(row.History)
            ? paidKobo.ToString()
            : $"{row.History},{paidKobo}";
        row.LastRunAt = at;

        await db.SaveChangesAsync(ct);
        return ToRecord(row);
    }

    private static LaneRecord ToRecord(LaneEntity row) => new(
        row.Id,
        row.Name,
        row.Origin,
        row.Destination,
        row.Cargo,
        row.WeightKg,
        row.Truck,
        row.Cadence,
        row.History
            .Split(',', StringSplitOptions.RemoveEmptyEntries)
            .Select(long.Parse)
            .ToList(),
        row.LastRunAt);
}
