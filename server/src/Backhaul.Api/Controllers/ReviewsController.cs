using System.ComponentModel.DataAnnotations;

using Backhaul.Api.Auth;
using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>Answers to the four questions, and a note.</summary>
/// <remarks>
/// Only the claims actually answered belong here. A claim left out is left out
/// — not a no.
/// </remarks>
public sealed class ReviewRequest
{
    [Required]
    public Dictionary<string, bool> Answers { get; set; } = [];

    [MaxLength(500)]
    public string Note { get; set; } = string.Empty;
}

public sealed record ReviewResponse(Guid Id, string By, DateTimeOffset At);

/// <summary>How often one claim was true, and out of how many.</summary>
public sealed record TallyResponse(string Claim, string Label, int Yes, int Asked, bool WorthShowing);

public sealed record RecordResponse(int Reviews, IReadOnlyList<TallyResponse> Tallies);

/// <summary>
/// What each side says about the other after a trip.
/// </summary>
/// <remarks>
/// <b>Not stars.</b> A five-star average compresses "arrived late twice" and
/// "damaged the load" into the same 4.2, and on a two-sided market it drifts
/// upward until everyone is 4.8 and the rating carries no information at all.
/// What a reader gets is counts, with the denominator, because "2 of 2" and
/// "34 of 34" are the same fraction and not the same evidence.
/// </remarks>
[ApiController]
[Tags("ratings")]
public sealed class ReviewsController(ReviewRepository reviews, TimeProvider clock) : AuthorisedController
{
    /// <summary>Leave or amend a review of a trip.</summary>
    /// <remarks>
    /// Amendable inside the week-long window, unlike the trip's own history: a
    /// review is somebody's current opinion and they may change it. What is not
    /// allowed is two of them.
    /// </remarks>
    [HttpPut("v1/trips/{tripId:guid}/review")]
    [ProducesResponseType<ReviewResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<ReviewResponse>> Put(
        Guid tripId,
        [FromBody] ReviewRequest body,
        CancellationToken ct)
    {
        var known = Caller.Role == Role.Shipper
            ? Ratings.CarrierClaims.Select(Ratings.CarrierWire).ToHashSet()
            : Ratings.ShipperClaims.Select(Ratings.ShipperWire).ToHashSet();

        var unknown = body.Answers.Keys.Where(claim => !known.Contains(claim)).ToList();
        if (unknown.Count > 0)
        {
            return UnprocessableEntity($"Not a question on this form: {string.Join(", ", unknown)}.");
        }

        var (saved, refusal) = await reviews.SaveAsync(
            tripId,
            Caller,
            body.Answers,
            body.Note,
            clock.GetUtcNow(),
            ct);

        if (saved is not null) return new ReviewResponse(saved.Id, saved.By, saved.At);

        return refusal switch
        {
            ReviewRefusal.NoSuchTrip => NotFound("No such trip."),

            // A state is a claim somebody made; the proof is what a review
            // hangs off. Saying "not delivered" of a trip whose proof is
            // unsealed is the honest answer.
            ReviewRefusal.NotDelivered => UnprocessableEntity(
                "This trip has no proof of delivery yet, so there is nothing to review."),

            ReviewRefusal.WindowClosed => UnprocessableEntity(
                $"Reviews close {Ratings.ReviewWindowDays} days after delivery."),

            ReviewRefusal.WrongSide => UnprocessableEntity(
                "A driver does not review the trip; the carrier and the shipper review each other."),

            _ => NotFound("No such trip."),
        };
    }

    /// <summary>
    /// Somebody's record: how often each claim was true.
    /// </summary>
    /// <remarks>
    /// Readable by anybody signed in, deliberately. A record exists so a
    /// stranger can decide whether to trade with somebody, and one only its
    /// subject can read is not a record. It carries no trip ids and no notes —
    /// counts and the questions they answer.
    /// </remarks>
    /// <param name="userId">Whose record.</param>
    /// <param name="side">carrier or shipper — which set of questions applies.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet("v1/people/{userId:guid}/record")]
    [ProducesResponseType<RecordResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<RecordResponse>> GetRecord(
        Guid userId,
        [FromQuery] string side,
        CancellationToken ct)
    {
        if (side is not ("carrier" or "shipper"))
        {
            return BadRequest($"Unknown side '{side}' — expected carrier or shipper.");
        }

        var found = await reviews.AboutAsync(userId, ct);

        var claims = side == "carrier"
            ? Ratings.CarrierClaims.Select(Ratings.CarrierWire).ToList()
            : Ratings.ShipperClaims.Select(Ratings.ShipperWire).ToList();

        var labels = side == "carrier"
            ? Ratings.CarrierClaims.Select(Ratings.LabelCarrier).ToList()
            : Ratings.ShipperClaims.Select(Ratings.LabelShipper).ToList();

        var tallies = Ratings.Tallies(
            found.Select(r => new Review(r.TripId, r.At, r.Answers, r.Note)).ToList(),
            claims);

        return new RecordResponse(
            found.Count,
            tallies
                .Select((tally, i) => new TallyResponse(
                    tally.Claim,
                    labels[i],
                    tally.Yes,
                    tally.Asked,
                    Ratings.WorthShowing(tally)))
                .ToList());
    }
}
