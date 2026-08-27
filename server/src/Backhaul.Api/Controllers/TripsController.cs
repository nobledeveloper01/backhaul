using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain;
using Backhaul.Domain.Access;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

[ApiController]
[Route("v1/trips")]
[Tags("trips")]
public sealed class TripsController(TripRepository trips, TimeProvider clock)
    : AuthorisedController
{
    /// <summary>Open a trip.</summary>
    /// <remarks>
    /// The client supplies the id. Trips are created on a phone that may be
    /// offline for days, so the identifier cannot come from the server without
    /// making trip creation require a network — which is exactly what the
    /// product promises it does not.
    /// </remarks>
    [HttpPost("{tripId:guid}")]
    [ProducesResponseType<TripResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<TripResponse>> Open(
        Guid tripId,
        [FromBody] OpenTripRequest body,
        CancellationToken ct)
    {
        // Unfiltered on purpose, and the only such query. Without it two
        // shippers could be handed the same id because neither can see the
        // other's trip, and the second write would fail on the primary key
        // with a message about nothing. It answers a boolean about an id the
        // caller already holds.
        if (await trips.IdIsTakenAsync(tripId, ct))
        {
            return Conflict("A trip with this id already exists.");
        }

        var parties = new TripParties(body.DriverId, body.CarrierId, body.ShipperId);

        // A trip you would not be able to see is a trip you cannot open. It is
        // otherwise possible to create a record and immediately lose it.
        if (!parties.Admit(Caller))
        {
            return BadRequest("You must be one of the three parties on a trip you open.");
        }

        var opened = TripHistory.Apply(
            [],
            TripState.Open,
            body.At,
            Enum.Parse<TripActor>(body.Actor, ignoreCase: true),
            body.Note);

        // The machine cannot refuse the first `open`, but the result is a
        // closed hierarchy and unwrapping it with a cast would be the first
        // place this file stopped trusting the type system.
        if (opened is not TransitionResult.Accepted accepted)
        {
            throw new InvalidOperationException("Opening a trip was refused.");
        }

        var record = await trips.CreateAsync(
            tripId,
            new Corridor(body.Origin, body.Destination),
            parties,
            accepted.Event,
            clock.GetUtcNow(),
            ct);

        return CreatedAtAction(nameof(Get), new { tripId }, ToResponse(record));
    }

    /// <summary>A trip and its full history.</summary>
    [HttpGet("{tripId:guid}")]
    [ProducesResponseType<TripResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<TripResponse>> Get(Guid tripId, CancellationToken ct)
    {
        var record = await trips.GetAsync(tripId, Caller, ct);
        // A trip the caller may not see is reported as absent rather than
        // forbidden: the existence of a trip id is itself information, and a
        // 403 confirms it.
        return record is null ? NotFound("No such trip.") : ToResponse(record);
    }

    /// <summary>Record a state transition.</summary>
    /// <remarks>
    /// Append-only. A correction is a new event; the original always survives.
    ///
    /// The device already ran this exact check before it queued the event —
    /// offline, where the decision had to be made. The server runs it again
    /// because a client can be modified, and refusals carry the machine's own
    /// sentence, written to be shown to a driver rather than logged.
    /// </remarks>
    [HttpPost("{tripId:guid}/events")]
    [ProducesResponseType<TripResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<RefusalResponse>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<TripResponse>> Append(
        Guid tripId,
        [FromBody] TripEventRequest body,
        CancellationToken ct)
    {
        var record = await trips.GetAsync(tripId, Caller, ct);
        if (record is null)
        {
            return NotFound("No such trip.");
        }

        var state = TripMachine.FromWire(body.State);
        if (state is null)
        {
            return BadRequest($"Unknown state '{body.State}'.");
        }

        var result = TripHistory.Apply(
            record.History,
            state.Value,
            body.At,
            Enum.Parse<TripActor>(body.Actor, ignoreCase: true),
            body.Note);

        if (result is TransitionResult.Refused refused)
        {
            return UnprocessableEntity(new RefusalResponse
            {
                Message = refused.Detail,
                Refusal = refused.Reason switch
                {
                    TransitionRefusal.NotAllowed => "not_allowed",
                    TransitionRefusal.Terminal => "terminal",
                    TransitionRefusal.OutOfOrder => "out_of_order",
                    _ => "not_allowed",
                },
            });
        }

        var accepted = (TransitionResult.Accepted)result;
        var updated = await trips.AppendAsync(
            tripId,
            Caller,
            record.Corridor,
            record.Parties,
            record.History,
            accepted.Event,
            clock.GetUtcNow(),
            ct);

        return ToResponse(updated);
    }

    private static TripResponse ToResponse(TripRecord record)
    {
        var state = record.History[^1].State;
        return new TripResponse
        {
            Id = record.Id,
            Origin = record.Corridor.Origin,
            Destination = record.Corridor.Destination,
            State = TripMachine.ToWire(state),
            Tracking = TripMachine.ShouldTrack(state),
            AllowedNext = [.. TripMachine.AllowedFrom(state).Select(TripMachine.ToWire)],
            History =
            [
                .. record.History.Select(e => new TripEventResponse
                {
                    State = TripMachine.ToWire(e.State),
                    At = e.At,
                    Actor = e.Actor.ToString().ToLowerInvariant(),
                    Note = e.Note,
                }),
            ],
        };
    }
}
