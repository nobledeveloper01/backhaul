using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain.Access;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Backhaul.Api.Controllers;

/// <summary>
/// The public end of a share link.
/// </summary>
/// <remarks>
/// <b>The only unauthenticated route that returns a truck's position.</b>
/// Everything about why it exists, why the token is the whole authorisation,
/// and why this one place answers "revoked" and "expired" differently rather
/// than 404-ing both like ADR-0008 requires elsewhere, is in ADR-0010.
/// </remarks>
[ApiController]
[Route("v1/share")]
[Tags("share")]
[EnableRateLimiting(RateLimits.PublicShare)]
public sealed class ShareController(
    ShareRepository links,
    TripRepository trips,
    PositionRepository positions,
    TimeProvider clock) : ControllerBase
{
    /// <summary>Follow a trip with a link and no account.</summary>
    /// <remarks>
    /// The scope on the stored row decides the shape of the response. A holder
    /// cannot widen it, because it is not something they send.
    /// </remarks>
    [HttpGet("{token}")]
    [ProducesResponseType<SharedTripResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ShareRefusalResponse>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ShareRefusalResponse>(StatusCodes.Status410Gone)]
    public async Task<ActionResult<SharedTripResponse>> Follow(
        string token,
        CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var (share, refusal) = await links.ResolveAsync(token, now, ct);

        if (share is null)
        {
            var body = Refused(refusal ?? ShareRefusal.Unknown);
            // 410 for a link that worked once, 404 for one that never did.
            // The distinction costs nothing an attacker could use — they would
            // need a valid 32-byte token to see either — and it is the whole
            // difference between "your link ran out" and "somebody cut you
            // off", which are different phone calls to a haulier.
            return refusal == ShareRefusal.Unknown
                ? NotFound(body)
                : StatusCode(StatusCodes.Status410Gone, body);
        }

        var corridor = await trips.CorridorForSharedAsync(share, ct);
        if (corridor is null)
        {
            // A link to a trip that is not there. Answered as unknown rather
            // than 500: from the holder's side it is the same situation, and
            // there is nothing they can do about the difference.
            return NotFound(Refused(ShareRefusal.Unknown));
        }

        var raw = await positions.ForSharedTripAsync(share, ct);
        var cleaned = Geo.Clean(raw);
        var silent = Tracker.SilentFor(cleaned.Kept, now);
        var visible = Visible.Under(share.Scope);

        return new SharedTripResponse
        {
            Origin = corridor.Origin,
            Destination = corridor.Destination,
            Observation = Tracker.Observe(cleaned.Kept, now).ToString().ToLowerInvariant(),
            SilentForMs = silent is null ? null : (long)silent.Value.TotalMilliseconds,
            DistanceMetres = Geo.DistanceTravelled(cleaned),
            ExpiresAt = share.ExpiresAt,

            // Three fields, one condition each, all from the same flag set.
            // Written as `visible.X ? … : null` rather than as an if-ladder so
            // that a field added without a flag stands out as the odd one.
            Quality = visible.TrackQuality ? Geo.FixQuality(cleaned) : null,
            Dropped = visible.TrackQuality ? cleaned.Dropped.Count : null,
            Track = visible.History
                ? [.. cleaned.Kept.Select(fix => new SharedFixResponse
                {
                    Lat = fix.Lat,
                    Lon = fix.Lon,
                    At = fix.At,
                })]
                : null,
        };
    }

    /// <summary>
    /// The refusal, in the same words the mobile client uses.
    /// </summary>
    /// <remarks>
    /// Character-for-character the sentences in
    /// <c>packages/domain/src/sharing.ts</c>. The parity fixtures exist because
    /// two implementations of one rule drift, and copy is a rule: a holder who
    /// sees one wording in the app and another on the web has found a seam.
    /// </remarks>
    /// <remarks>
    /// The codes are namespaced — <c>link_expired</c> rather than
    /// <c>expired</c> — because a client maps codes to its own wording and a
    /// sign-in code that expired is a different sentence from a share link that
    /// ran out. `refusal.ToString().ToLowerInvariant()` would have collided the
    /// two, and the collision would have shown up as one wrong sentence on one
    /// screen in one language.
    /// </remarks>
    private static ShareRefusalResponse Refused(ShareRefusal refusal) => new()
    {
        Refusal = refusal switch
        {
            ShareRefusal.Revoked => "revoked",
            ShareRefusal.Expired => "link_expired",
            _ => "unknown_link",
        },
        Message = refusal switch
        {
            ShareRefusal.Revoked =>
                "This link was turned off. Ask whoever sent it for a new one.",
            ShareRefusal.Expired =>
                "This link has expired. Ask whoever sent it for a new one.",
            _ => "This link is not one we issued. Ask for a new one.",
        },
    };
}

/// <summary>Issuing and revoking links. Authenticated, unlike following one.</summary>
[ApiController]
[Route("v1/trips/{tripId:guid}/share")]
[Tags("share")]
public sealed class TripShareController(
    ShareRepository links,
    TripRepository trips,
    TimeProvider clock) : AuthorisedController
{
    /// <summary>Issue a link for this trip.</summary>
    /// <remarks>
    /// Only somebody who may already read the trip may issue a link to it —
    /// the same filter, so there is one definition of who is on a trip. The
    /// token comes back once and is never retrievable again.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType<IssuedShareResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IssuedShareResponse>> Issue(
        Guid tripId,
        [FromBody] IssueShareRequest body,
        CancellationToken ct)
    {
        if (!await trips.ExistsAsync(tripId, Caller, ct))
        {
            return NotFound("No such trip.");
        }

        var now = clock.GetUtcNow();
        var scope = Enum.Parse<ShareScope>(body.Scope, ignoreCase: true);

        var (token, link) = await links.IssueAsync(
            tripId,
            scope,
            body.Label,
            Caller.UserId,
            now,
            now.AddDays(body.Days),
            ct);

        return StatusCode(StatusCodes.Status201Created, new IssuedShareResponse
        {
            Id = link.Id,
            Scope = link.Scope.ToString().ToLowerInvariant(),
            Label = link.Label,
            IssuedAt = link.IssuedAt,
            ExpiresAt = link.ExpiresAt,
            RevokedAt = null,
            Token = token,
        });
    }

    /// <summary>Every link on this trip, live and dead.</summary>
    /// <remarks>
    /// Revoked and expired links stay in the list. Who was given sight of a
    /// trip is part of its record, and a list that quietly drops them answers
    /// "who could see this?" wrongly a month later.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType<List<ShareLinkResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<List<ShareLinkResponse>>> List(Guid tripId, CancellationToken ct)
    {
        if (!await trips.ExistsAsync(tripId, Caller, ct))
        {
            return NotFound("No such trip.");
        }

        var rows = await links.ForTripAsync(tripId, ct);
        return rows.Select(ToResponse).ToList();
    }

    /// <summary>Turn a link off.</summary>
    /// <remarks>
    /// Idempotent, and it never un-revokes: revoking twice keeps the first
    /// time. When a link stopped working is evidence in the way a trip event
    /// is, and overwriting it would quietly move it.
    /// </remarks>
    [HttpDelete("{linkId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Revoke(Guid tripId, Guid linkId, CancellationToken ct)
    {
        if (!await trips.ExistsAsync(tripId, Caller, ct))
        {
            return NotFound("No such trip.");
        }

        var found = await links.RevokeAsync(linkId, tripId, clock.GetUtcNow(), ct);
        return found ? NoContent() : NotFound("No such link on this trip.");
    }

    private static ShareLinkResponse ToResponse(IssuedShare link) => new()
    {
        Id = link.Id,
        Scope = link.Scope.ToString().ToLowerInvariant(),
        Label = link.Label,
        IssuedAt = link.IssuedAt,
        ExpiresAt = link.ExpiresAt,
        RevokedAt = link.RevokedAt,
    };
}
