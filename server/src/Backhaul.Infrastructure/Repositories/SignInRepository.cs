using System.Security.Cryptography;
using System.Text;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore;

namespace Backhaul.Infrastructure.Repositories;

public sealed record SignedIn(Guid UserId, Role Role, string Name, bool IsNew);

/// <summary>Issuing and checking sign-in codes.</summary>
/// <remarks>
/// The policy — how long a code lives, how many guesses, how many per hour —
/// is <see cref="Otp"/>, which is held to the TypeScript by the parity
/// fixtures. This is only the storage around it.
/// </remarks>
public sealed class SignInRepository(BackhaulDbContext db)
{
    /// <summary>
    /// Mints a code and returns it — the only time it exists in readable form.
    /// </summary>
    /// <remarks>
    /// Six digits from <see cref="RandomNumberGenerator"/>, not
    /// <c>Random</c>: two codes minted in the same tick from a clock-seeded
    /// generator match, and this one is short enough for that to matter.
    /// </remarks>
    public async Task<string> IssueAsync(
        string phone,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var code = RandomNumberGenerator
            .GetInt32(0, (int)Math.Pow(10, Otp.CodeLength))
            .ToString(new string('0', Otp.CodeLength));

        db.SignInChallenges.Add(new SignInChallengeEntity
        {
            Id = Guid.NewGuid(),
            Phone = phone,
            Hash = Hash(code),
            IssuedAt = now,
            ExpiresAt = now.Add(Otp.CodeLives),
            Attempts = 0,
        });
        await db.SaveChangesAsync(ct);

        return code;
    }

    /// <summary>The newest challenge for a number, whatever state it is in.</summary>
    /// <remarks>
    /// The newest, not the newest *live* one: a burned or used code has to be
    /// distinguishable from no code at all, because the two need different
    /// sentences. Filtering here would collapse both into "unknown".
    /// </remarks>
    public async Task<(Challenge? Challenge, Guid Id)> NewestAsync(
        string phone,
        CancellationToken ct = default)
    {
        var row = await db.SignInChallenges
            .Where(c => c.Phone == phone)
            .OrderByDescending(c => c.IssuedAt)
            .AsNoTracking()
            .FirstOrDefaultAsync(ct);

        if (row is null)
        {
            return (null, Guid.Empty);
        }

        return (
            new Challenge(row.Phone, row.IssuedAt, row.ExpiresAt, row.Attempts, row.ConsumedAt),
            row.Id);
    }

    public async Task<bool> MatchesAsync(Guid id, string code, CancellationToken ct = default)
    {
        var hash = Hash(code);
        return await db.SignInChallenges.AnyAsync(c => c.Id == id && c.Hash == hash, ct);
    }

    /// <summary>When codes were asked for in the last hour, for the rate limit.</summary>
    public async Task<IReadOnlyList<DateTimeOffset>> IssuedSinceAsync(
        string phone,
        DateTimeOffset since,
        CancellationToken ct = default) =>
        await db.SignInChallenges
            .AsNoTracking()
            .Where(c => c.Phone == phone && c.IssuedAt >= since)
            .Select(c => c.IssuedAt)
            .ToListAsync(ct);

    public async Task CountAttemptAsync(Guid id, CancellationToken ct = default)
    {
        var row = await db.SignInChallenges.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (row is null) return;

        row.Attempts += 1;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Marks the code used and returns the account behind the number,
    /// creating one the first time.
    /// </summary>
    /// <remarks>
    /// Both in one <c>SaveChanges</c>: a code consumed without an account, or
    /// an account created against a code that was not consumed, are both
    /// states somebody would have to reason about later.
    ///
    /// A first-time number becomes a <c>driver</c>. Not because most users are
    /// drivers, but because it is the role that can see the least — a carrier
    /// or shipper is something an existing account grants, and guessing
    /// upward on a first sign-in would hand somebody a fleet.
    /// </remarks>
    public async Task<SignedIn> ConsumeAsync(
        Guid challengeId,
        string phone,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var challenge = await db.SignInChallenges.FirstAsync(c => c.Id == challengeId, ct);
        challenge.ConsumedAt = now;

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Phone == phone, ct);
        var isNew = account is null;

        if (account is null)
        {
            account = new AccountEntity
            {
                Id = Guid.NewGuid(),
                Phone = phone,
                Role = "driver",
                Name = string.Empty,
                CreatedAt = now,
            };
            db.Accounts.Add(account);
        }

        await db.SaveChangesAsync(ct);

        var role = Enum.TryParse<Role>(account.Role, ignoreCase: true, out var parsed)
            ? parsed
            : Role.Driver;

        return new SignedIn(account.Id, role, account.Name, isNew);
    }

    /// <summary>What a person calls themselves. Set once, after the first code.</summary>
    public async Task<bool> NameAsync(Guid userId, string name, CancellationToken ct = default)
    {
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == userId, ct);
        if (account is null) return false;

        account.Name = name;
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <inheritdoc cref="TokenRepository"/>
    private static string Hash(string code) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(code)));
}
