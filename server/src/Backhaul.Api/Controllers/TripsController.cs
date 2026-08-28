using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain;
using Backhaul.Domain.Access;
using Backhaul.Domain.Market;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Backhaul.Api.Controllers;

[ApiController]
[Route("v1/trips")]
[Tags("trips")]
public sealed class TripsController(TripRepository trips, SignInRepository accounts, TimeProvider clock)
    : AuthorisedController
{
    /// <summary>Open a trip.</summary>
    /// <remarks>
    /// <para>
    /// The client supplies the id. Trips are created on a phone that may be
    /// offline for days, so the identifier cannot come from the server without
    /// making trip creation require a network — which is exactly what the
    /// product promises it does not.
    /// </para>
    /// <para>
    /// This is the wedge: a trip agreed somewhere else — on WhatsApp, on a
    /// call, in a yard — tracked here, with no marketplace involved. The
    /// parties come as phone numbers because that is what the person who
    /// agreed it has. See ADR-0016 for why there is no lookup to turn one into
    /// an identifier, and why this endpoint answers the same way whether it
    /// found an account or made one.
    /// </para>
    /// </remarks>
    [HttpPost("{tripId:guid}")]
    [EnableRateLimiting(RateLimits.OpenTrip)]
    [ProducesResponseType<TripResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
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

        // The caller's own slot comes from their token, never from the body.
        // A trip you would not be able to see is a trip you cannot open, and
        // filling your own slot from a number you typed is how you create a
        // record and immediately lose it.
        var mine = Caller.Role switch
        {
            Role.Driver => nameof(body.DriverPhone),
            Role.Carrier => nameof(body.CarrierPhone),
            Role.Shipper => nameof(body.ShipperPhone),
            _ => null,
        };

        if (mine is null)
        {
            return BadRequest("Only a driver, a carrier or a shipper can open a trip.");
        }

        var given = new Dictionary<string, string?>
        {
            [nameof(body.DriverPhone)] = body.DriverPhone,
            [nameof(body.CarrierPhone)] = body.CarrierPhone,
            [nameof(body.ShipperPhone)] = body.ShipperPhone,
        };

        // Your own slot may be left out or filled in, but a number that
        // disagrees with your token is refused rather than silently
        // overwritten — that is somebody about to open a trip for a person
        // they are not, and they would be left reading a trip they believe
        // names somebody else. Looked up without creating: a number nobody
        // holds must not mint an account on its way to being rejected, and
        // the only fact this can yield is whether the number is the caller's
        // own, which is not the lookup ADR-0016 forbids.
        if (given[mine] is { } own)
        {
            var normalised = Otp.NormalisePhone(own);
            if (normalised is null || await accounts.FindAsync(normalised, ct) != Caller.UserId)
            {
                return BadRequest($"{Lower(mine)} is not the number you signed in with.");
            }
        }

        var parties = new Dictionary<string, Guid> { [mine] = Caller.UserId };
        var now = clock.GetUtcNow();

        foreach (var (slot, raw) in given)
        {
            if (slot == mine) continue;

            var phone = raw is null ? null : Otp.NormalisePhone(raw);
            if (phone is null)
            {
                return BadRequest(
                    raw is null
                        ? $"{Lower(slot)} is required — a trip has three parties."
                        : $"{Lower(slot)} is not a phone number this can reach.");
            }

            parties[slot] = await accounts.PartyAsync(phone, now, ct);
        }

        var trip = new TripParties(
            parties[nameof(body.DriverPhone)],
            parties[nameof(body.CarrierPhone)],
            parties[nameof(body.ShipperPhone)]);

        // Belt and braces: `mine` is filled from the token, so this cannot
        // fail today. It is the invariant every later read depends on and it
        // costs one comparison to keep saying so out loud.
        if (!trip.Admit(Caller))
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
            trip,
            accepted.Event,
            clock.GetUtcNow(),
            ct);

        return CreatedAtAction(nameof(Get), new { tripId }, ToResponse(record));
    }

    /// <summary>`DriverPhone` as the caller wrote it in the body.</summary>
    /// <remarks>
    /// The message names the field the sender can fix. `nameof` gives the C#
    /// spelling and the wire is camelCase, and an error naming a field that is
    /// not in the request the caller sent is worse than one naming none.
    /// </remarks>
    private static string Lower(string slot) => char.ToLowerInvariant(slot[0]) + slot[1..];

    /// <summary>A trip and its full history.</summary>
    /// <summary>
    /// Every trip this caller may see, newest first.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Filtered by the same engine the app filters with, so a search that finds
    /// a trip on the phone finds it on the server: <c>search.ts</c> flattens
    /// case, accents and punctuation, because three people write the same plate
    /// as <c>LSR-482-XA</c>, <c>lsr 482 xa</c> and <c>lsr482xa</c>.
    /// </para>
    /// <para>
    /// The filter is applied here rather than in the database for the same
    /// reason: matching is a rule, the rule lives in the domain, and a `LIKE`
    /// in SQL would be a second implementation of it that agrees on most inputs.
    /// A caller with enough trips for that to matter is a caller who needs
    /// paging, which is a different change.
    /// </para>
    /// </remarks>
    /// <param name="text">Town, cargo, plate, driver or reference.</param>
    /// <param name="states">Comma-separated trip states.</param>
    /// <param name="onlyWithIncidents">Only trips with something unresolved.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<TripSummaryResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<IReadOnlyList<TripSummaryResponse>>> List(
        [FromQuery] string? text = null,
        [FromQuery] string? states = null,
        [FromQuery] bool onlyWithIncidents = false,
        CancellationToken ct = default)
    {
        var wanted = new List<TripState>();
        foreach (var wire in (states ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var state = TripMachine.FromWire(wire.Trim());
            if (state is null) return BadRequest($"Unknown trip state '{wire.Trim()}'.");
            wanted.Add(state.Value);
        }

        var mine = await trips.MineAsync(Caller, ct);

        var summaries = mine
            .Select(row => new TripSummary(
                row.Id,
                // No reference number in the schema yet; the corridor is what a
                // person actually searches for, and naming the field rather
                // than dropping it keeps the two shapes the same.
                $"{row.Origin}–{row.Destination}",
                row.State,
                row.Origin,
                row.Destination,
                string.Empty,
                string.Empty,
                string.Empty,
                row.StartedAt,
                row.HasOpenIncident,
                false))
            .ToList();

        var filter = new TripFilter(text ?? string.Empty, wanted, false, onlyWithIncidents, null, null);
        var kept = Search.FilterTrips(summaries, filter).Select(s => s.Id).ToHashSet();

        return mine
            .Where(row => kept.Contains(row.Id))
            .Select(row => new TripSummaryResponse
            {
                Id = row.Id,
                Origin = row.Origin,
                Destination = row.Destination,
                State = TripMachine.ToWire(row.State),
                Tracking = TripMachine.ShouldTrack(row.State),
                StartedAt = row.StartedAt,
                LastSeenAt = row.LastSeenAt,
                HasOpenIncident = row.HasOpenIncident,
            })
            .ToList();
    }

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
            DriverId = record.Parties.DriverId,
            CarrierId = record.Parties.CarrierId,
            ShipperId = record.Parties.ShipperId,
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
