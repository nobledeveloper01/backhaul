using System.Net.Http.Headers;

using Backhaul.Domain.Access;
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

    public HttpClient Carrying(HttpClient client)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        return client;
    }
}

public static class Identities
{
    private static readonly DateTimeOffset Issued = new(2026, 3, 4, 0, 0, 0, TimeSpan.Zero);

    public static async Task<Identity> IssueAsync(ApiFactory factory, Role role)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<TokenRepository>();

        var userId = Guid.NewGuid();
        var token = await tokens.IssueAsync(
            userId,
            role,
            label: "test",
            issuedAt: Issued,
            expiresAt: Issued.AddYears(1));

        return new Identity { UserId = userId, Role = role, Token = token };
    }

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

        return new Identity { UserId = userId, Role = role, Token = token };
    }
}
