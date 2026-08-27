using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class IssueShareRequest
{
    /// <summary><c>position</c> or <c>evidence</c>.</summary>
    /// <example>position</example>
    [Required]
    [RegularExpression("^(position|evidence)$")]
    public string Scope { get; set; } = "position";

    /// <summary>Who it is for, in the issuer's words. Shown when revoking.</summary>
    /// <example>Alhaji Bello (receiving)</example>
    [Required]
    [MaxLength(80)]
    public string Label { get; set; } = string.Empty;

    /// <summary>
    /// How long the link lives, in days. 1–30, and there is no "never".
    /// </summary>
    /// <remarks>
    /// A link with no expiry is a permanent, unauthenticated view of where
    /// somebody's truck is, which is a thing worth stealing. See ADR-0010.
    /// </remarks>
    /// <example>14</example>
    [Range(1, 30)]
    public int Days { get; set; } = 14;
}

/// <summary>A link, as its issuer sees it.</summary>
/// <remarks>
/// Carries no token. The sender got it once, at creation, and there is no
/// feature anywhere that needs to show it back to anybody.
/// </remarks>
public class ShareLinkResponse
{
    public Guid Id { get; set; }

    public string Scope { get; set; } = "position";

    public string Label { get; set; } = string.Empty;

    public DateTimeOffset IssuedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }
}

/// <summary>The response to issuing a link. The one time the token exists.</summary>
public sealed class IssuedShareResponse : ShareLinkResponse
{
    /// <summary>Shown once and never retrievable. Only a hash is stored.</summary>
    public string Token { get; set; } = string.Empty;
}

/// <summary>What somebody holding a link is shown.</summary>
/// <remarks>
/// The shape is decided by <c>Visible.Under(scope)</c>, not by this class: a
/// field that should not be visible under a scope is <c>null</c> here, and the
/// controller has one place where that is decided. There is no property for a
/// phone number or a price, and adding one would have to get past ADR-0010.
/// </remarks>
public sealed class SharedTripResponse
{
    public string Origin { get; set; } = string.Empty;

    public string Destination { get; set; } = string.Empty;

    /// <summary>moving, stopped, stalled, silent, or unknown.</summary>
    public string Observation { get; set; } = "unknown";

    /// <summary>Null when nothing has ever been recorded.</summary>
    public long? SilentForMs { get; set; }

    public long DistanceMetres { get; set; }

    /// <summary>When the link stops working. Shown so a holder is not surprised.</summary>
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Null unless the link's scope is <c>evidence</c>.</summary>
    public double? Quality { get; set; }

    /// <summary>Null unless the link's scope is <c>evidence</c>.</summary>
    public int? Dropped { get; set; }

    /// <summary>Null unless the link's scope is <c>evidence</c>.</summary>
    public List<SharedFixResponse>? Track { get; set; }
}

public sealed class SharedFixResponse
{
    public double Lat { get; set; }

    public double Lon { get; set; }

    public DateTimeOffset At { get; set; }
}

/// <summary>Why a link did not work, in words a stranger can act on.</summary>
public sealed class ShareRefusalResponse
{
    /// <summary>revoked, expired or unknown.</summary>
    public string Refusal { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;
}
