namespace Backhaul.Api;

/// <summary>The names of the rate-limiting policies.</summary>
/// <remarks>
/// A constant rather than a string in two places. A policy attribute whose
/// name does not match a registered policy throws at request time, not at
/// start-up — so the typo ships and fails on the route nobody tested.
/// </remarks>
public static class RateLimits
{
    /// <summary>The public share route. See ADR-0010.</summary>
    public const string PublicShare = "public-share";
}
