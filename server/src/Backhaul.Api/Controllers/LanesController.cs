using System.ComponentModel.DataAnnotations;

using Backhaul.Api.Auth;
using Backhaul.Domain.Market;
using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

public sealed class LaneRequest
{
    [Required]
    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(80)]
    public string Origin { get; set; } = string.Empty;

    [Required]
    [MaxLength(80)]
    public string Destination { get; set; } = string.Empty;

    [Required]
    [MaxLength(120)]
    public string Cargo { get; set; } = string.Empty;

    [Range(1, 60_000)]
    public double WeightKg { get; set; }

    /// <example>trailer_30t</example>
    [Required]
    [RegularExpression("^(pickup|canter|truck_15t|trailer_30t|lowbed)$")]
    public string Truck { get; set; } = string.Empty;

    /// <example>weekly</example>
    [Required]
    [RegularExpression("^(weekly|fortnightly|monthly|ad_hoc)$")]
    public string Cadence { get; set; } = string.Empty;
}

public sealed class LaneRunRequest
{
    [Range(1, long.MaxValue)]
    public long PaidKobo { get; set; }

    [Required]
    public DateTimeOffset At { get; set; }
}

/// <summary>
/// A lane, and when it next comes round.
/// </summary>
/// <remarks>
/// <c>Runs</c> is how many are in the history, not how many are counted.
/// <c>TypicalKobo</c> is the median of the last six, and null below three runs
/// — a typical price from two is arithmetic rather than information.
/// </remarks>
public sealed record LaneResponse(
    Guid Id,
    string Name,
    string Origin,
    string Destination,
    string Cargo,
    double WeightKg,
    string Truck,
    string Cadence,
    string DescribeCadence,
    int Runs,
    long? TypicalKobo,
    string? TypicalNaira,
    long? DueInMs,
    bool Due,
    string DescribeDue);

/// <summary>
/// The runs a shipper makes again.
/// </summary>
/// <remarks>
/// The typical price is the <b>median of the last six</b>, never the average of
/// everything: a lane's price drifts, and one panic-priced trip during a fuel
/// shortage would drag a mean for a year. Below three runs there is no typical
/// price at all, and the field is null rather than a number nobody should act
/// on.
/// </remarks>
[ApiController]
[Route("v1/me/lanes")]
[Tags("market")]
public sealed class LanesController(LaneRepository lanes, TimeProvider clock) : AuthorisedController
{
    /// <summary>A shipper's lanes, the ones coming round first.</summary>
    /// <remarks>
    /// Ad-hoc lanes never sort to the top. A list that prompts about something
    /// with no schedule is a list that prompts about everything.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<LaneResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LaneResponse>>> Get(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var mine = (await lanes.MineAsync(Caller, ct)).Select(ToDomain).ToList();

        var due = Lanes.Due(mine, now);
        var rest = mine.Where(lane => !due.Contains(lane));

        return due.Concat(rest).Select(lane => ToResponse(lane, now)).ToList();
    }

    /// <summary>Add a lane, or amend one.</summary>
    [HttpPut("{laneId:guid}")]
    [ProducesResponseType<LaneResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LaneResponse>> Put(
        Guid laneId,
        [FromBody] LaneRequest body,
        CancellationToken ct)
    {
        var saved = await lanes.SaveAsync(
            laneId,
            Caller,
            row =>
            {
                row.Name = body.Name;
                row.Origin = body.Origin;
                row.Destination = body.Destination;
                row.Cargo = body.Cargo;
                row.WeightKg = body.WeightKg;
                row.Truck = body.Truck;
                row.Cadence = body.Cadence;
            },
            ct);

        return saved is null
            ? NotFound("No such lane.")
            : ToResponse(ToDomain(saved), clock.GetUtcNow());
    }

    /// <summary>
    /// Record what this lane's latest run went for.
    /// </summary>
    /// <remarks>
    /// Appended, never replaced. The history is what the median is taken from,
    /// and a run that could be edited afterwards is a typical price somebody
    /// can move.
    /// </remarks>
    [HttpPost("{laneId:guid}/runs")]
    [ProducesResponseType<LaneResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LaneResponse>> PostRun(
        Guid laneId,
        [FromBody] LaneRunRequest body,
        CancellationToken ct)
    {
        var saved = await lanes.RanAsync(laneId, Caller, body.PaidKobo, body.At, ct);

        return saved is null
            ? NotFound("No such lane.")
            : ToResponse(ToDomain(saved), clock.GetUtcNow());
    }

    /// <summary>
    /// Whether a price is unusual against this lane's own history.
    /// </summary>
    /// <remarks>
    /// A quarter either way, and it is a sentence rather than a refusal. A
    /// shipper paying 40% over their own usual rate may have a reason, and a
    /// platform that blocks it is a platform they work around.
    /// </remarks>
    /// <param name="laneId">The lane.</param>
    /// <param name="offeredKobo">What is being offered this time.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet("{laneId:guid}/unusual")]
    [ProducesResponseType<bool>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<bool>> GetUnusual(
        Guid laneId,
        [FromQuery] long offeredKobo,
        CancellationToken ct)
    {
        var mine = await lanes.MineAsync(Caller, ct);
        var found = mine.FirstOrDefault(l => l.Id == laneId);

        return found is null
            ? NotFound("No such lane.")
            : Lanes.IsUnusual(ToDomain(found), new Kobo(offeredKobo));
    }

    private static Lane ToDomain(LaneRecord row) => new(
        row.Id,
        Guid.Empty,
        row.Name,
        row.Origin,
        row.Destination,
        row.Cargo,
        row.WeightKg,
        Trucks.FromWire(row.Truck) ?? TruckClass.Trailer30t,
        Lanes.FromWire(row.Cadence) ?? Cadence.AdHoc,
        row.HistoryKobo.Select(kobo => new Kobo(kobo)).ToList(),
        row.LastRunAt);

    private static LaneResponse ToResponse(Lane lane, DateTimeOffset now)
    {
        var typical = Lanes.TypicalPrice(lane);

        return new LaneResponse(
            lane.Id,
            lane.Name,
            lane.Origin,
            lane.Destination,
            lane.Cargo,
            lane.WeightKg,
            Trucks.ToWire(lane.Truck),
            Lanes.ToWire(lane.Cadence),
            Lanes.DescribeCadence(lane.Cadence),
            lane.History.Count,
            typical?.Value,
            typical?.ToString(),
            Lanes.DueIn(lane, now),
            Lanes.IsDue(lane, now),
            Lanes.DescribeDue(lane, now));
    }
}
