using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>An issued bearer token.</summary>
/// <remarks>
/// The token itself is never stored — only a SHA-256 of it. A leaked database
/// should be a set of useless hashes rather than a set of working credentials,
/// and there is no feature anywhere that needs to show a token back to anyone.
/// </remarks>
public sealed class AccessTokenEntity
{
    /// <summary>SHA-256 of the token, hex, lower case.</summary>
    [MaxLength(64)]
    public string Hash { get; set; } = string.Empty;

    public Guid UserId { get; set; }

    /// <summary>driver, carrier or shipper.</summary>
    [MaxLength(16)]
    public string Role { get; set; } = string.Empty;

    /// <summary>Shown in an audit trail; never used for authorisation.</summary>
    [MaxLength(80)]
    public string Label { get; set; } = string.Empty;

    public DateTimeOffset IssuedAt { get; set; }

    /// <summary>Null means it does not expire, which nothing in production should be.</summary>
    public DateTimeOffset? ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }
}
