namespace Backhaul.Domain.Access;

/// <summary>What a share link lets its holder see.</summary>
/// <remarks>
/// Mirrors <c>ShareScope</c> in <c>packages/domain/src/sharing.ts</c>. Named
/// rather than boolean, because "share the trip" means different things to a
/// cargo owner and to somebody's brother-in-law, and the difference is whose
/// phone number is on the screen.
/// </remarks>
public enum ShareScope
{
    /// <summary>Where it is, when it arrives, and nothing else.</summary>
    Position,

    /// <summary>Position, plus the history and what the track discarded.</summary>
    Evidence,
}

/// <summary>Why a link did not work.</summary>
public enum ShareRefusal
{
    /// <summary>Turned off by whoever issued it.</summary>
    Revoked,

    /// <summary>Ran out.</summary>
    Expired,

    /// <summary>Not one we issued.</summary>
    Unknown,
}

/// <summary>What a holder of a link may be shown.</summary>
/// <remarks>
/// A flag set rather than a check at each render site, for the same reason
/// authorisation is a query filter: a field added to a response inherits the
/// decision instead of forgetting it.
///
/// <see cref="ContactDetails"/> and <see cref="Money"/> are not properties that
/// happen to be false — they are constants. There is no scope that turns them
/// on and no constructor argument that could.
/// </remarks>
public sealed record Visible(bool Position, bool Eta, bool History, bool TrackQuality)
{
    /// <summary>Never. A share link is not a route to somebody's phone number.</summary>
    public bool ContactDetails => false;

    /// <summary>Never. What a load is worth is between the two parties on it.</summary>
    public bool Money => false;

    /// <summary>The flags for a scope. The one place the mapping lives.</summary>
    public static Visible Under(ShareScope scope) => new(
        Position: true,
        Eta: true,
        History: scope == ShareScope.Evidence,
        TrackQuality: scope == ShareScope.Evidence);
}
