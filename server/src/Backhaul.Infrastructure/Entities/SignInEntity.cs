using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>A code that was sent to a phone.</summary>
/// <remarks>
/// The code is never stored — only a SHA-256 of it, the same as every other
/// secret here. A leaked database should be a set of useless hashes, and a
/// six-digit code is short enough that "we would notice" is not a defence.
/// </remarks>
public sealed class SignInChallengeEntity
{
    public Guid Id { get; set; }

    /// <summary>E.164, normalised. Never what the user typed.</summary>
    [MaxLength(20)]
    public string Phone { get; set; } = string.Empty;

    /// <summary>SHA-256 of the code, hex, lower case.</summary>
    [MaxLength(64)]
    public string Hash { get; set; } = string.Empty;

    public DateTimeOffset IssuedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Wrong guesses so far. Five and the code is burned.</summary>
    public int Attempts { get; set; }

    /// <summary>Set when it was signed in with. A used code never works twice.</summary>
    public DateTimeOffset? ConsumedAt { get; set; }
}

/// <summary>Somebody who can sign in.</summary>
/// <remarks>
/// Deliberately thin. A name and a role, keyed by phone — everything else
/// about a person lives on the things they are party to, and an account
/// record that accumulates fields is one that eventually holds something
/// nobody meant to store about a driver.
/// </remarks>
public sealed class AccountEntity
{
    public Guid Id { get; set; }

    [MaxLength(20)]
    public string Phone { get; set; } = string.Empty;

    /// <summary>driver, carrier or shipper.</summary>
    [MaxLength(16)]
    public string Role { get; set; } = "driver";

    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }
}
