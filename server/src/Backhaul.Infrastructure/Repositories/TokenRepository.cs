using System.Security.Cryptography;
using System.Text;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

/// <summary>Issues and resolves bearer tokens.</summary>
public sealed class TokenRepository(BackhaulDbContext db)
{
    /// <summary>
    /// Mints a token and returns it — the only time it exists in readable form.
    /// </summary>
    /// <remarks>
    /// 32 bytes from <see cref="RandomNumberGenerator"/>, which is the
    /// cryptographic one. `Random` is seeded from the clock and two tokens
    /// minted in the same tick would match.
    /// </remarks>
    public async Task<string> IssueAsync(
        Guid userId,
        Role role,
        string label,
        DateTimeOffset issuedAt,
        DateTimeOffset? expiresAt,
        CancellationToken ct = default)
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        var token = Convert.ToHexStringLower(bytes);

        db.AccessTokens.Add(new AccessTokenEntity
        {
            Hash = Hash(token),
            UserId = userId,
            Role = role.ToString().ToLowerInvariant(),
            Label = label,
            IssuedAt = issuedAt,
            ExpiresAt = expiresAt,
        });
        await db.SaveChangesAsync(ct);

        return token;
    }

    /// <summary>The principal behind a token, or null if there is not one.</summary>
    /// <remarks>
    /// Expiry and revocation are part of the same lookup rather than a check
    /// after it, for the reason the whole of ADR-0008 gives: a condition that
    /// lives beside a query is a condition a later query can forget.
    /// </remarks>
    public async Task<Principal?> ResolveAsync(
        string token,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        var hash = Hash(token);

        var row = await db.AccessTokens
            .Where(t => t.Hash == hash)
            .Where(t => t.RevokedAt == null)
            .Where(t => t.ExpiresAt == null || t.ExpiresAt > now)
            .Select(t => new { t.UserId, t.Role })
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (row is null) return null;

        /*
            The account's role wins, and the token's is a fallback.

            A role stamped on a token is a stored copy of a fact that lives on
            the account, and this project's argument against stored copies is
            already written down twice — a tier is computed on every read
            because "a copy that drifts is a carrier who is one thing on their
            own screen and another on a shipper's". A role is the same shape of
            thing and it drifted the moment `PUT /v1/me/role` existed: somebody
            said they were a shipper, the account agreed, and every request
            they made for the next year was still a driver's.

            The fallback is for the tokens ops issues directly with
            `--issue-token`, which name a role and may have no account behind
            them at all. See ADR-0020.
        */
        var onAccount = await db.Accounts
            .Where(a => a.Id == row.UserId)
            .Select(a => a.Role)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        var spelling = string.IsNullOrWhiteSpace(onAccount) ? row.Role : onAccount;

        if (!Enum.TryParse<Role>(spelling, ignoreCase: true, out var role))
        {
            return null;
        }

        return new Principal(row.UserId, role);
    }

    /// <summary>
    /// SHA-256, hex, lower case.
    /// </summary>
    /// <remarks>
    /// Not a password hash, and deliberately not one. A 32-byte random token
    /// has no guessable structure, so there is nothing for bcrypt's work
    /// factor to defend against — and this runs on the hot path for every
    /// request, where a deliberately slow hash would be a denial of service
    /// somebody could trigger from outside.
    /// </remarks>
    private static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
