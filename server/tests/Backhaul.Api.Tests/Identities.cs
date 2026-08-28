using System.Net.Http.Headers;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Entities;
using Backhaul.Infrastructure.Repositories;
using Microsoft.Extensions.DependencyInjection;

namespace Backhaul.Api.Tests;

/// <summary>
/// Real tokens, issued through the real repository, for tests to carry.
/// </summary>
/// <remarks>
/// Nothing is stubbed. The tests exercise the same middleware, the same hash
/// and the same query filters a request from a phone would — a suite that
/// bypasses authorisation to test authorisation tests nothing.
/// </remarks>
public sealed class Identity
{
    public required Guid UserId { get; init; }

    public required Role Role { get; init; }

    public required string Token { get; init; }

    /// <summary>
    /// The number this identity signed in with, in the shape the API takes.
    /// </summary>
    /// <remarks>
    /// Opening a trip names the other two parties by phone (ADR-0016), so a
    /// test that wants a known driver on a trip has to be able to say which
    /// number is theirs. Every identity gets a real account row for the same
    /// reason: a token whose id has no account behind it is a caller who could
    /// never have signed in, and a trip opened against them would resolve to a
    /// different account than the one holding the token.
    /// </remarks>
    public required string Phone { get; init; }

    public HttpClient Carrying(HttpClient client)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        return client;
    }
}

public static class Identities
{
    private static readonly DateTimeOffset Issued = new(2026, 3, 4, 0, 0, 0, TimeSpan.Zero);

    /// <remarks>
    /// Takes <see cref="IServiceProvider"/> rather than <see cref="ApiFactory"/>
    /// so a test that boots its own application — the rate-limit tests need
    /// their own, because a limiter is per-application state — can still mint
    /// a real token through the real repository.
    /// </remarks>
    public static Task<Identity> IssueAsync(ApiFactory factory, Role role) =>
        IssueAsync(factory.Services, role);

    public static async Task<Identity> IssueAsync(IServiceProvider services, Role role)
    {
        using var scope = services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<TokenRepository>();
        var db = scope.ServiceProvider.GetRequiredService<BackhaulDbContext>();

        var userId = Guid.NewGuid();
        var phone = NextPhone();

        db.Accounts.Add(new AccountEntity
        {
            Id = userId,
            Phone = phone,
            Role = role.ToString().ToLowerInvariant(),
            Name = string.Empty,
            CreatedAt = Issued,
        });
        await db.SaveChangesAsync();

        var token = await tokens.IssueAsync(
            userId,
            role,
            label: "test",
            issuedAt: Issued,
            expiresAt: Issued.AddYears(1));

        return new Identity { UserId = userId, Role = role, Token = token, Phone = phone };
    }

    private static int minted;

    /// <summary>
    /// A distinct MTN number per identity, in the E.164 shape the API stores.
    /// </summary>
    /// <remarks>
    /// Distinct because two identities sharing a number would share an
    /// account, and the test that noticed would be some unrelated one failing
    /// for a reason nobody could see. Counted rather than random so a failure
    /// is the same failure twice.
    /// </remarks>
    public static string NextPhone() =>
        $"+23480{Interlocked.Increment(ref minted):D8}";

    /// <summary>A token that has already expired.</summary>
    public static async Task<Identity> IssueExpiredAsync(ApiFactory factory, Role role)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<TokenRepository>();

        var userId = Guid.NewGuid();
        var token = await tokens.IssueAsync(
            userId,
            role,
            label: "test, expired",
            issuedAt: Issued.AddYears(-2),
            expiresAt: Issued.AddYears(-1));

        return new Identity { UserId = userId, Role = role, Token = token, Phone = NextPhone() };
    }
}
