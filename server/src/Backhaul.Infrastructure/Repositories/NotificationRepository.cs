using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>A registered install.</summary>
public sealed record DeviceRecord(
    string Token,
    Guid UserId,
    string Platform,
    int UtcOffsetMinutes);

/// <summary>
/// Who to tell, and what they have already been told.
/// </summary>
/// <remarks>
/// Deliberately the only stored part of the alerting path. The alerts
/// themselves are derived on every read; this holds the two facts that cannot
/// be derived — the token to send to, and that something already went out.
/// </remarks>
public sealed class NotificationRepository(BackhaulDbContext db)
{
    /// <summary>Register or refresh an install.</summary>
    /// <remarks>
    /// Keyed on the token, so a reinstall replaces its own row. A phone handed
    /// to a different driver re-registers under the new person and the old
    /// row's <c>UserId</c> is overwritten rather than left pointing at
    /// somebody who no longer holds it — which would send one person's trips
    /// to another person's phone.
    /// </remarks>
    public async Task RegisterAsync(
        string token,
        Guid userId,
        string platform,
        int utcOffsetMinutes,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var row = await db.Devices.FirstOrDefaultAsync(d => d.Token == token, ct);
        if (row is null)
        {
            row = new DeviceEntity { Token = token };
            db.Devices.Add(row);
        }

        row.UserId = userId;
        row.Platform = platform;
        row.UtcOffsetMinutes = utcOffsetMinutes;
        row.RegisteredAt = now;

        await db.SaveChangesAsync(ct);
    }

    /// <summary>Stop sending to an install.</summary>
    public async Task<bool> ForgetAsync(string token, Guid userId, CancellationToken ct = default)
    {
        // Filtered on the caller as well as the token: a token is not a secret
        // — it is on the wire every time the phone talks to a gateway — and
        // without this anybody holding one could silence somebody else.
        var row = await db.Devices.FirstOrDefaultAsync(d => d.Token == token && d.UserId == userId, ct);
        if (row is null) return false;

        db.Devices.Remove(row);
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<IReadOnlyList<DeviceRecord>> AllAsync(CancellationToken ct = default) =>
        await db.Devices
            .AsNoTracking()
            .Select(d => new DeviceRecord(d.Token, d.UserId, d.Platform, d.UtcOffsetMinutes))
            .ToListAsync(ct);

    /// <summary>What role this person signs in as, from the account itself.</summary>
    /// <remarks>
    /// Read rather than copied onto the device row. The role decides which
    /// alerts are even for this person — a driver is not told their own signal
    /// dropped, which they can see out of the window — and a copy of it beside
    /// the push token is a copy that drifts the day somebody's account changes.
    /// </remarks>
    public async Task<Role?> RoleOfAsync(Guid userId, CancellationToken ct = default)
    {
        /*
            The token first, then the account.

            The role is asserted on a token for *every* principal in this
            system; an account exists only for somebody who signed in with a
            phone number. The seeded development principals and the test
            identities have tokens and no account, and reading only the account
            made the dispatcher skip them without a word — which is how a loop
            that appears to work sends nothing.

            The account is the fallback for the other direction: somebody whose
            tokens have all expired but whose phone is still registered.
        */
        var onToken = await db.AccessTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .OrderByDescending(t => t.IssuedAt)
            .Select(t => t.Role)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (Enum.TryParse<Role>(onToken, ignoreCase: true, out var fromToken)) return fromToken;

        var onAccount = await db.Accounts
            .Where(a => a.Id == userId)
            .Select(a => a.Role)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        return Enum.TryParse<Role>(onAccount, ignoreCase: true, out var parsed) ? parsed : null;
    }

    /// <summary>When each thing was last said to this person, by trip and kind.</summary>
    public async Task<Dictionary<(Guid TripId, string Kind), DateTimeOffset>> LastSentAsync(
        Guid userId,
        CancellationToken ct = default)
    {
        var rows = await db.AlertsSent
            .Where(s => s.UserId == userId)
            .GroupBy(s => new { s.TripId, s.Kind })
            .Select(g => new { g.Key.TripId, g.Key.Kind, SentAt = g.Max(s => s.SentAt) })
            .AsNoTracking()
            .ToListAsync(ct);

        return rows.ToDictionary(r => (r.TripId, r.Kind), r => r.SentAt);
    }

    /// <summary>Record that it went out.</summary>
    /// <remarks>
    /// Called only after a send. A held alert writes nothing, which is exactly
    /// how holding works: the next run finds the condition still true and
    /// still unsent, and quiet hours delay rather than swallow.
    /// </remarks>
    public async Task RecordAsync(
        Guid userId,
        Guid tripId,
        string kind,
        DateTimeOffset sentAt,
        CancellationToken ct = default)
    {
        db.AlertsSent.Add(new AlertSentEntity
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            TripId = tripId,
            Kind = kind,
            SentAt = sentAt,
        });

        await db.SaveChangesAsync(ct);
    }
}
