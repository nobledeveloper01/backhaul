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

    /// <summary>
    /// Signing in.
    /// </summary>
    /// <remarks>
    /// Tighter than the share route, and for a different reason: every request
    /// here can cost an SMS, and the per-number limit in <c>Otp</c> does not
    /// stop somebody walking through a range of numbers.
    /// </remarks>
    public const string PublicAuth = "public-auth";

    /// <summary>Opening a trip.</summary>
    /// <remarks>
    /// Partitioned by account rather than by address, which is the whole
    /// difference between this and the two above: the caller here is
    /// authenticated, so the limit attaches to something that cost a working
    /// Nigerian SIM to obtain rather than to an address anybody can change.
    ///
    /// Opening a trip names two phone numbers and can cause an SMS to be sent
    /// to each. That is the residual abuse surface ADR-0016 accepts, and this
    /// is what bounds it.
    /// </remarks>
    public const string OpenTrip = "open-trip";
}
