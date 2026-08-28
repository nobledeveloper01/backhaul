namespace Backhaul.Domain.Access;

/// <summary>Who is asking.</summary>
public enum Role
{
    /// <summary>Carries the load. Sees the trips they are driving.</summary>
    Driver,

    /// <summary>Owns the truck. Sees every trip their drivers are on.</summary>
    Carrier,

    /// <summary>Owns the goods. Sees the trips carrying them.</summary>
    Shipper,

    /// <summary>
    /// Looks at a carrier's papers and says whether they are what they claim.
    /// </summary>
    /// <remarks>
    /// Deliberately unreachable from any public path. Signing in for the first
    /// time mints a <c>driver</c> — see <c>SignInRepository</c> — and there is
    /// no endpoint that changes a role, so a reviewer token exists only
    /// because ops issued one with <c>--issue-token</c>.
    ///
    /// A reviewer is not a party to any trip, and <see cref="TripParties.Admit"/>
    /// answers false for them everywhere. They can confirm a paper and see
    /// nothing else: not a trip, not a track, not a settlement. See ADR-0017.
    /// </remarks>
    Reviewer,
}

/// <summary>
/// An authenticated caller.
/// </summary>
/// <remarks>
/// Passed into every query that touches a trip or a position, so a new query
/// cannot be written without confronting the question of who is allowed to see
/// the answer. See ADR-0008.
/// </remarks>
public sealed record Principal(Guid UserId, Role Role);

/// <summary>The three parties who can see a trip.</summary>
/// <remarks>
/// Stored on the trip rather than derived, because "the carrier who employs
/// this driver" changes over time and a trip's audience must not change with
/// it. Who could see a trip in March is a fact about March.
/// </remarks>
public sealed record TripParties(Guid DriverId, Guid CarrierId, Guid ShipperId)
{
    /// <summary>
    /// Whether this caller is one of the three.
    /// </summary>
    /// <remarks>
    /// Role and id must both match. A carrier who happens to share an id with
    /// a driver — which should never happen, and which a test asserts about
    /// this method rather than about the id generator — is not thereby both.
    /// </remarks>
    public bool Admit(Principal principal) => principal.Role switch
    {
        Role.Driver => principal.UserId == DriverId,
        Role.Carrier => principal.UserId == CarrierId,
        Role.Shipper => principal.UserId == ShipperId,
        _ => false,
    };

    /// <summary>
    /// Whether this caller may add positions to the trip.
    /// </summary>
    /// <remarks>
    /// Only the driver. A carrier watching the truck and a shipper watching
    /// their goods can both read the track; neither can write to it, and a
    /// position history that a second party can append to is not evidence of
    /// anything.
    /// </remarks>
    public bool MayReport(Principal principal) =>
        principal.Role == Role.Driver && principal.UserId == DriverId;
}
