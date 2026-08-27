using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Entities;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>What a carrier has proved.</summary>
/// <remarks>
/// The tier is computed on every read and never stored. A stored tier is a
/// stored copy of a rule, and a copy that drifts is a carrier who is one thing
/// on their own screen and another on a shipper's.
/// </remarks>
[ApiController]
[Route("v1/me/verification")]
[Tags("identity")]
public sealed class VerificationController(
    IdentityRepository identity,
    BackhaulDbContext db) : AuthorisedController
{
    [HttpGet]
    [ProducesResponseType<VerificationResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<VerificationResponse>> Get(CancellationToken ct) =>
        ToResponse(
            await identity.ProfileAsync(Caller.UserId, ct),
            await CarrierRecord.ForAsync(db, Caller.UserId, ct));

    /// <summary>
    /// Say a paper is held.
    /// </summary>
    /// <remarks>
    /// Records that it exists, not that it is genuine. Verification is a human
    /// step, and pretending otherwise would put a Trusted badge on an upload
    /// nobody looked at.
    /// </remarks>
    [HttpPut("{paper}")]
    [ProducesResponseType<VerificationResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<VerificationResponse>> Put(
        string paper,
        [FromBody] PaperRequest body,
        CancellationToken ct)
    {
        var which = paper switch
        {
            "identity" => Paper.Identity,
            "licence" => Paper.Licence,
            "registration" => Paper.Registration,
            "insurance" => Paper.Insurance,
            _ => (Paper?)null,
        };

        if (which is null) return BadRequest($"Unknown paper '{paper}'.");

        var row = await identity.SetPaperAsync(Caller.UserId, which.Value, body.Held, ct);
        return ToResponse(row, await CarrierRecord.ForAsync(db, Caller.UserId, ct));
    }

    /*
        The record is counted, not read off the profile.

        `CarrierProfileEntity` had three columns for these and nothing ever
        wrote them, so a carrier's own verification screen showed three zeroes
        while the bid ranking a shipper sees counted for real. One reader now
        answers both — see `CarrierRecord`.
    */
    private static VerificationResponse ToResponse(CarrierProfileEntity row, TrackRecord record)
    {
        var papers = new Papers(row.HasIdentity, row.HasLicence, row.HasRegistration, row.HasInsurance);

        return new VerificationResponse
        {
            Tier = Trust.ToWire(Trust.TierOf(papers, record)),
            HasIdentity = row.HasIdentity,
            HasLicence = row.HasLicence,
            HasRegistration = row.HasRegistration,
            HasInsurance = row.HasInsurance,
            TripsCompleted = record.TripsCompleted,
            TripsPromised = record.TripsPromised,
            TripsOnTime = record.TripsOnTime,
            Incidents = record.Incidents,
            // Null below five trips. "100% on time" from one delivery is true
            // and completely misleading, and it is the number a shipper
            // decides on.
            OnTimeRate = Trust.OnTimeRate(record),
        };
    }
}

/// <summary>The trucks, and the papers that let them work.</summary>
[ApiController]
[Route("v1/me/vehicles")]
[Tags("identity")]
public sealed class VehiclesController(
    IdentityRepository identity,
    TimeProvider clock) : AuthorisedController
{
    /// <summary>The fleet, worst first.</summary>
    /// <remarks>
    /// Sorted by urgency rather than by plate: a list sorted alphabetically is
    /// one nobody scrolls to the bottom of, and the truck at the bottom is the
    /// one with the lapsed certificate.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType<List<VehicleResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<List<VehicleResponse>>> Get(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var rows = await identity.VehiclesAsync(Caller.UserId, ct);

        var rank = new Dictionary<Standing, int>
        {
            [Standing.Lapsed] = 0,
            [Standing.Incomplete] = 1,
            [Standing.Expiring] = 2,
            [Standing.RoadLegal] = 3,
            [Standing.Retired] = 4,
        };

        return rows
            .Select(row => ToResponse(row, now))
            .OrderBy(v => rank[StandingOf(v)])
            // Within a standing, whatever expires soonest — so the truck three
            // days from a lapsed certificate is above the one three months
            // away.
            .ThenBy(v => v.Lapsed.Concat(v.Expiring).Select(p => p.Days).DefaultIfEmpty(9_999).Min())
            .ThenBy(v => v.Plate, StringComparer.Ordinal)
            .ToList();
    }

    [HttpPut]
    [ProducesResponseType<VehicleResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<VehicleResponse>> Put(
        [FromBody] VehicleRequest body,
        CancellationToken ct)
    {
        var saved = await identity.SaveVehicleAsync(
            new VehicleEntity
            {
                CarrierId = Caller.UserId,
                Plate = body.Plate.Trim().ToUpperInvariant(),
                Truck = body.Truck,
                LicenceExpires = body.LicenceExpires,
                RoadworthinessExpires = body.RoadworthinessExpires,
                InsuranceExpires = body.InsuranceExpires,
                PermitExpires = body.PermitExpires,
                RetiredAt = body.RetiredAt,
            },
            ct);

        return ToResponse(saved, clock.GetUtcNow());
    }

    private static Standing StandingOf(VehicleResponse response) => response.Standing switch
    {
        "lapsed" => Standing.Lapsed,
        "incomplete" => Standing.Incomplete,
        "expiring" => Standing.Expiring,
        "retired" => Standing.Retired,
        _ => Standing.RoadLegal,
    };

    private static VehicleResponse ToResponse(VehicleEntity row, DateTimeOffset now)
    {
        var expiries = new Dictionary<VehiclePaper, DateTimeOffset>();
        if (row.LicenceExpires is not null) expiries[VehiclePaper.Licence] = row.LicenceExpires.Value;
        if (row.RoadworthinessExpires is not null)
        {
            expiries[VehiclePaper.Roadworthiness] = row.RoadworthinessExpires.Value;
        }

        if (row.InsuranceExpires is not null) expiries[VehiclePaper.Insurance] = row.InsuranceExpires.Value;
        if (row.PermitExpires is not null) expiries[VehiclePaper.Permit] = row.PermitExpires.Value;

        var assessment = Vehicles.Assess(expiries, row.RetiredAt, now);

        return new VehicleResponse
        {
            Id = row.Id,
            Plate = row.Plate,
            Truck = row.Truck,
            Standing = Vehicles.ToWire(assessment.Standing),
            // A paper that lapses mid-trip never strands a driver; it blocks
            // the next assignment. That is what this flag is for.
            MayCarry = Vehicles.MayCarry(assessment),
            Lapsed = [.. assessment.Lapsed.Select(l => new PaperDays
            {
                Paper = Vehicles.ToWire(l.Paper),
                Days = l.Days,
            })],
            Expiring = [.. assessment.Expiring.Select(e => new PaperDays
            {
                Paper = Vehicles.ToWire(e.Paper),
                Days = e.Days,
            })],
            Missing = [.. assessment.Missing.Select(Vehicles.ToWire)],
        };
    }
}

/// <summary>A driver in trouble.</summary>
/// <remarks>
/// <b>The response says nothing.</b> A driver's phone must show no sign that
/// this was sent — whoever is standing over them must not be able to tell — so
/// the endpoint answers <c>204</c> with an empty body whether or not anything
/// was recorded. See <c>packages/domain/src/duress.ts</c>.
/// </remarks>
[ApiController]
[Route("v1/trips/{tripId:guid}/duress")]
[Tags("identity")]
public sealed class DuressController(
    IdentityRepository identity,
    ILogger<DuressController> log,
    TimeProvider clock) : AuthorisedController
{
    [HttpPost]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Raise(
        Guid tripId,
        [FromBody] DuressRequest body,
        CancellationToken ct)
    {
        await identity.RaiseAsync(
            new DuressEntity
            {
                TripId = tripId,
                RaisedBy = Caller.UserId,
                Trigger = body.Trigger,
                At = clock.GetUtcNow(),
                Lat = body.Lat,
                Lon = body.Lon,
                BatteryFraction = body.BatteryFraction,
            },
            ct);

        // Logged at the highest level the app has. Nothing else here raises a
        // notification yet, and a signal that reaches only a database row is a
        // signal nobody acts on.
        log.LogCritical(
            "DURESS on trip {TripId} from {UserId} at {Lat},{Lon}",
            tripId,
            Caller.UserId,
            body.Lat,
            body.Lon);

        return NoContent();
    }

    /// <summary>Open alarms. Read by the carrier, never by the driver's phone.</summary>
    [HttpGet]
    [ProducesResponseType<List<DuressResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<List<DuressResponse>>> Get(Guid tripId, CancellationToken ct)
    {
        var rows = await identity.OpenDuressAsync(tripId, ct);

        return rows.Select(row => new DuressResponse
        {
            Id = row.Id,
            Trigger = row.Trigger,
            At = row.At,
            Lat = row.Lat,
            Lon = row.Lon,
            BatteryFraction = row.BatteryFraction,
        }).ToList();
    }

    /// <summary>A person says it is over.</summary>
    [HttpPost("{duressId:guid}/clear")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Clear(Guid tripId, Guid duressId, CancellationToken ct)
    {
        var found = await identity.ClearDuressAsync(duressId, Caller.UserId, clock.GetUtcNow(), ct);
        return found ? NoContent() : NotFound("No such alarm.");
    }
}
