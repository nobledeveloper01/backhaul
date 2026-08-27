using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain.Tracking;
using Backhaul.Domain.Trips;
using Backhaul.Infrastructure.Entities;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>Proof of delivery.</summary>
/// <remarks>
/// A draft while a driver is filling it in at a gate, and evidence the moment
/// it is sealed. `seal` is the line between the two and it only crosses one
/// way.
/// </remarks>
[ApiController]
[Route("v1/trips/{tripId:guid}/delivery")]
[Tags("delivery")]
public sealed class DeliveryController(
    DeliveryRepository deliveries,
    TripDetailRepository details,
    TimeProvider clock) : AuthorisedController
{
    [HttpGet]
    [ProducesResponseType<DeliveryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeliveryResponse>> Get(Guid tripId, CancellationToken ct)
    {
        var row = await deliveries.DeliveryAsync(tripId, Caller, ct);
        if (row is null) return NotFound("Nothing captured for this trip yet.");

        return await ToResponseAsync(row, tripId, ct);
    }

    /// <summary>Save what has been captured so far.</summary>
    [HttpPut]
    [ProducesResponseType<DeliveryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DeliveryResponse>> Put(
        Guid tripId,
        [FromBody] DeliveryRequest body,
        CancellationToken ct)
    {
        var (row, alreadySealed) = await deliveries.SaveAsync(
            tripId,
            Caller,
            existing =>
            {
                existing.At = body.At;
                existing.PhotoIds = string.Join(',', body.PhotoIds);
                existing.SignatureName = body.SignatureName;
                existing.SignatureRole = body.SignatureRole;
                existing.SignatureImageId = body.SignatureImageId;
                existing.CapturedLat = body.CapturedLat;
                existing.CapturedLon = body.CapturedLon;
                existing.CapturedAccuracy = body.CapturedAccuracy;
                existing.Note = body.Note;
                existing.ExceptionKind = body.ExceptionKind;
                existing.ExceptionQuantity = body.ExceptionQuantity;
                existing.ExceptionNote = body.ExceptionNote;
            },
            ct);

        if (row is null) return NotFound("No such trip.");

        if (alreadySealed)
        {
            return Conflict("This delivery has been signed for and cannot be changed.");
        }

        return await ToResponseAsync(row, tripId, ct);
    }

    /// <summary>Turn the draft into proof.</summary>
    /// <remarks>
    /// Runs the same `seal` the app runs, so a driver is never told one thing
    /// by the phone and another by the server while standing in a market with
    /// a queue behind them. The refusal is the domain's own sentence.
    /// </remarks>
    [HttpPost("seal")]
    [ProducesResponseType<DeliveryResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<RefusalResponse>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<DeliveryResponse>> Seal(Guid tripId, CancellationToken ct)
    {
        var row = await deliveries.DeliveryAsync(tripId, Caller, ct);
        if (row is null) return NotFound("Nothing captured for this trip yet.");

        var result = Pod.Seal(ToDomain(row));
        if (result is PodResult.Refused refused)
        {
            return UnprocessableEntity(new RefusalResponse
            {
                Refusal = Pod.ToWire(refused.Reason),
                Message = refused.Detail,
            });
        }

        await deliveries.SealAsync(tripId, Caller, clock.GetUtcNow(), ct);

        var sealed_ = await deliveries.DeliveryAsync(tripId, Caller, ct);
        return await ToResponseAsync(sealed_!, tripId, ct);
    }

    private async Task<DeliveryResponse> ToResponseAsync(
        DeliveryEntity row,
        Guid tripId,
        CancellationToken ct)
    {
        var delivery = ToDomain(row);
        var result = Pod.Seal(delivery);

        // The destination, for the "how far from where it should have been"
        // figure. Absent when nobody declared a route, and then nothing is
        // claimed either way.
        var route = await details.WaypointsAsync(tripId, Caller, ct);
        var destination = route.FirstOrDefault(w => w.Kind == "destination");

        var near = destination is null
            ? null
            : Pod.CapturedNear(
                delivery,
                new Waypoint(
                    destination.Id,
                    destination.Name,
                    destination.Lat,
                    destination.Lon,
                    WaypointKind.Destination,
                    destination.RadiusM));

        return new DeliveryResponse
        {
            At = row.At,
            PhotoIds = [.. row.PhotoIds.Split(',', StringSplitOptions.RemoveEmptyEntries)],
            SignatureName = row.SignatureName,
            SignatureRole = row.SignatureRole,
            Note = row.Note,
            ExceptionKind = row.ExceptionKind,
            ExceptionQuantity = row.ExceptionQuantity,
            ExceptionNote = row.ExceptionNote,
            SealedAt = row.SealedAt,
            CanSeal = result is PodResult.Sealed,
            Missing = result is PodResult.Refused refused ? refused.Detail : null,
            CapturedNearM = near,
            Settles = Pod.SettlesDespite(delivery.Exception),
        };
    }

    private static Delivery ToDomain(DeliveryEntity row) => new(
        row.At,
        [.. row.PhotoIds.Split(',', StringSplitOptions.RemoveEmptyEntries)],
        row.SignatureName is null
            ? null
            : new Signature(row.SignatureName, row.SignatureRole ?? string.Empty, row.SignatureImageId ?? string.Empty),
        row.CapturedLat is null || row.CapturedLon is null
            ? null
            : new Position(row.CapturedLat.Value, row.CapturedLon.Value, row.CapturedAccuracy ?? 0, row.At),
        row.Note,
        row.ExceptionKind is null
            ? null
            : new DeliveryException(
                Pod.ExceptionFromWire(row.ExceptionKind) ?? ExceptionKind.Short,
                row.ExceptionQuantity,
                row.ExceptionNote ?? string.Empty));
}

/// <summary>One truck, several deliveries.</summary>
[ApiController]
[Route("v1/trips/{tripId:guid}/drops")]
[Tags("delivery")]
public sealed class DropsController(DeliveryRepository deliveries) : AuthorisedController
{
    [HttpGet]
    [ProducesResponseType<DropsResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<DropsResponse>> Get(Guid tripId, CancellationToken ct) =>
        ToResponse(await deliveries.DropsAsync(tripId, Caller, ct));

    /// <summary>Set the drop list.</summary>
    /// <remarks>
    /// Refuses once anything has been signed for. Reordering a trailer that is
    /// half unloaded is not a plan change, it is a mistake.
    /// </remarks>
    [HttpPut]
    [ProducesResponseType<DropsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DropsResponse>> Put(
        Guid tripId,
        [FromBody] List<DropRequest> body,
        CancellationToken ct)
    {
        var (rows, alreadyStarted) = await deliveries.SetDropsAsync(
            tripId,
            Caller,
            [
                .. body.Select(d => new DropEntity
                {
                    Consignee = d.Consignee,
                    Goods = d.Goods,
                    Units = d.Units,
                    WeightKg = d.WeightKg,
                }),
            ],
            ct);

        if (rows is null) return NotFound("No such trip.");

        if (alreadyStarted)
        {
            return Conflict("Some of these drops have been signed for and cannot be reordered.");
        }

        return ToResponse(rows);
    }

    /// <summary>Sign for one.</summary>
    [HttpPost("{dropId:guid}/sign")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Sign(
        Guid tripId,
        Guid dropId,
        [FromBody] SignDropRequest body,
        CancellationToken ct)
    {
        var found = await deliveries.SignDropAsync(
            tripId,
            dropId,
            Caller,
            body.At,
            body.Exception,
            ct);

        return found ? NoContent() : NotFound("No such drop on this trip.");
    }

    private static DropsResponse ToResponse(IReadOnlyList<DropEntity> rows)
    {
        var domain = rows
            .Select(r => new Drop(r.Id, r.Consignee, r.Goods, r.Units, r.WeightKg, r.Sequence, r.DeliveredAt))
            .ToList();

        return new DropsResponse
        {
            Drops =
            [
                .. rows.Select(r => new DropResponse
                {
                    Id = r.Id,
                    Consignee = r.Consignee,
                    Goods = r.Goods,
                    Units = r.Units,
                    WeightKg = r.WeightKg,
                    Sequence = r.Sequence,
                    DeliveredAt = r.DeliveredAt,
                    Exception = r.Exception,
                }),
            ],
            WeightAboardKg = Drops.WeightAboard(domain),
            DropFeeKobo = Drops.Fee(domain.Count).Value,
            Complete = Drops.IsComplete(domain),
            OutOfOrder = [.. Drops.OutOfOrder(domain).Select(d => d.Id)],
        };
    }
}

/// <summary>What the road took.</summary>
[ApiController]
[Route("v1/trips/{tripId:guid}/levies")]
[Tags("delivery")]
public sealed class LeviesController(DeliveryRepository deliveries) : AuthorisedController
{
    /// <summary>The ledger, and what is left of the advance.</summary>
    /// <remarks>
    /// The balance goes <b>negative</b> when the driver has spent more than
    /// they were given, which is the common case on a long run and the number
    /// they actually care about.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType<LeviesResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<LeviesResponse>> Get(
        Guid tripId,
        [FromQuery] long advanceKobo,
        CancellationToken ct)
    {
        var rows = await deliveries.LeviesAsync(tripId, Caller, ct);
        var total = rows.Sum(r => r.AmountKobo);

        return new LeviesResponse
        {
            Levies = [.. rows.Select(ToResponse)],
            TotalKobo = total,
            BalanceKobo = advanceKobo - total,
        };
    }

    [HttpPost]
    [ProducesResponseType<LevyResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<LevyResponse>> Post(
        Guid tripId,
        [FromBody] LevyRequest body,
        CancellationToken ct)
    {
        var row = await deliveries.AddLevyAsync(
            tripId,
            Caller,
            new LevyEntity
            {
                Id = body.Id,
                Kind = body.Kind,
                AmountKobo = body.AmountKobo,
                At = body.At,
                Lat = body.Lat,
                Lon = body.Lon,
                Note = body.Note,
                PhotoId = body.PhotoId,
            },
            ct);

        return row is null
            ? NotFound("No such trip.")
            : StatusCode(StatusCodes.Status201Created, ToResponse(row));
    }

    private static LevyResponse ToResponse(LevyEntity row) => new()
    {
        Id = row.Id,
        Kind = row.Kind,
        AmountKobo = row.AmountKobo,
        At = row.At,
        Note = row.Note,
        PhotoId = row.PhotoId,
    };
}
