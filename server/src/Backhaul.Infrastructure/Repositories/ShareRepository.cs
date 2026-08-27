using System.Security.Cryptography;
using System.Text;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>A link that resolved, and what it may show.</summary>
public sealed record ResolvedShare(Guid TripId, ShareScope Scope, DateTimeOffset ExpiresAt);

/// <summary>A link as its issuer sees it. Never carries the token.</summary>
public sealed record IssuedShare(
    Guid Id,
    Guid TripId,
    ShareScope Scope,
    string Label,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? RevokedAt);

/// <summary>Issues, resolves and revokes share links. See ADR-0010.</summary>
public sealed class ShareRepository(BackhaulDbContext db)
{
    /// <summary>
    /// Mints a link and returns the token — the only time it exists in
    /// readable form.
    /// </summary>
    /// <remarks>
    /// 32 bytes from <see cref="RandomNumberGenerator"/>, the same as a bearer
    /// token, because holding it is the whole of the claim. There is no
    /// overload without an expiry: a link with no expiry is a permanent,
    /// unauthenticated view of where a truck is.
    /// </remarks>
    public async Task<(string Token, IssuedShare Link)> IssueAsync(
        Guid tripId,
        ShareScope scope,
        string label,
        Guid issuedBy,
        DateTimeOffset issuedAt,
        DateTimeOffset expiresAt,
        CancellationToken ct = default)
    {
        var token = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        var id = Guid.NewGuid();

        db.ShareLinks.Add(new ShareLinkEntity
        {
            Hash = Hash(token),
            Id = id,
            TripId = tripId,
            Scope = scope.ToString().ToLowerInvariant(),
            Label = label,
            IssuedBy = issuedBy,
            IssuedAt = issuedAt,
            ExpiresAt = expiresAt,
        });
        await db.SaveChangesAsync(ct);

        return (token, new IssuedShare(id, tripId, scope, label, issuedAt, expiresAt, null));
    }

    /// <summary>
    /// What a token resolves to, or why it did not.
    /// </summary>
    /// <remarks>
    /// Unlike <c>TokenRepository.ResolveAsync</c>, the expiry and revocation
    /// conditions are <b>not</b> folded into the query. They are read back and
    /// answered separately on purpose: a cargo owner whose link lapsed and one
    /// who was deliberately cut off need different sentences, and a query that
    /// filters them out can only ever say "no". ADR-0010 has the reasoning,
    /// including why this departs from ADR-0008's "everything is 404".
    /// </remarks>
    public async Task<(ResolvedShare? Link, ShareRefusal? Refusal)> ResolveAsync(
        string token,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return (null, ShareRefusal.Unknown);
        }

        var hash = Hash(token);

        var row = await db.ShareLinks
            .Where(l => l.Hash == hash)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (row is null)
        {
            return (null, ShareRefusal.Unknown);
        }

        // Revocation beats expiry when both are true: somebody who turned a
        // link off should be told it was turned off, even if it would have
        // lapsed anyway by the time they looked.
        if (row.RevokedAt is not null)
        {
            return (null, ShareRefusal.Revoked);
        }

        if (row.ExpiresAt is not null && row.ExpiresAt <= now)
        {
            return (null, ShareRefusal.Expired);
        }

        if (!Enum.TryParse<ShareScope>(row.Scope, ignoreCase: true, out var scope))
        {
            // A scope this build does not recognise is not a reason to widen
            // what gets shown. Treated as unknown rather than defaulting.
            return (null, ShareRefusal.Unknown);
        }

        return (new ResolvedShare(row.TripId, scope, row.ExpiresAt ?? DateTimeOffset.MaxValue), null);
    }

    /// <summary>Every link on a trip, for whoever may already read the trip.</summary>
    public async Task<IReadOnlyList<IssuedShare>> ForTripAsync(
        Guid tripId,
        CancellationToken ct = default)
    {
        var rows = await db.ShareLinks
            .Where(l => l.TripId == tripId)
            .OrderByDescending(l => l.IssuedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        return rows
            .Select(row => new IssuedShare(
                row.Id,
                row.TripId,
                Enum.TryParse<ShareScope>(row.Scope, ignoreCase: true, out var scope)
                    ? scope
                    : ShareScope.Position,
                row.Label,
                row.IssuedAt,
                row.ExpiresAt ?? DateTimeOffset.MaxValue,
                row.RevokedAt))
            .ToList();
    }

    /// <summary>
    /// Turns a link off. Idempotent, and it never un-revokes.
    /// </summary>
    /// <remarks>
    /// Revoking twice keeps the first time. The moment a link stopped working
    /// is evidence in the same way a trip event is, and overwriting it with a
    /// later timestamp would quietly move it.
    /// </remarks>
    public async Task<bool> RevokeAsync(
        Guid linkId,
        Guid tripId,
        DateTimeOffset at,
        CancellationToken ct = default)
    {
        var row = await db.ShareLinks
            .Where(l => l.Id == linkId && l.TripId == tripId)
            .FirstOrDefaultAsync(ct);

        if (row is null)
        {
            return false;
        }

        row.RevokedAt ??= at;
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <inheritdoc cref="TokenRepository"/>
    private static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
