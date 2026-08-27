using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>A link that lets somebody with no account watch one trip.</summary>
/// <remarks>
/// The token is never stored — only a SHA-256 of it, exactly as with
/// <see cref="AccessTokenEntity"/>. A leaked database should be a set of
/// useless hashes rather than a set of working links, and nothing in the
/// product ever shows a link back to anyone: the sender got it once, at
/// creation. See ADR-0010.
/// </remarks>
public sealed class ShareLinkEntity
{
    /// <summary>SHA-256 of the token, hex, lower case. The lookup key.</summary>
    [MaxLength(64)]
    public string Hash { get; set; } = string.Empty;

    /// <summary>What the owner revokes by. Safe to show; the token is not.</summary>
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    /// <summary>
    /// <c>position</c> or <c>evidence</c>.
    /// </summary>
    /// <remarks>
    /// Stored, never requested. A holder cannot widen their own scope by
    /// changing a query parameter, because the scope is not a parameter.
    /// </remarks>
    [MaxLength(16)]
    public string Scope { get; set; } = "position";

    /// <summary>Free text the issuer wrote: "Alhaji Bello (receiving)".</summary>
    [MaxLength(80)]
    public string Label { get; set; } = string.Empty;

    /// <summary>Who issued it. Shown in an audit trail; never authorisation.</summary>
    public Guid IssuedBy { get; set; }

    public DateTimeOffset IssuedAt { get; set; }

    /// <summary>
    /// Never null.
    /// </summary>
    /// <remarks>
    /// Nullable in the column only because the domain's <c>ShareLink</c> allows
    /// it; there is no code path here that writes null. A link with no expiry
    /// is a permanent, unauthenticated view of where a truck is.
    /// </remarks>
    public DateTimeOffset? ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }
}
