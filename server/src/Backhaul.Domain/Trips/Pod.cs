using Backhaul.Domain.Tracking;

namespace Backhaul.Domain.Trips;

public enum ExceptionKind
{
    Short,
    Damaged,
    Refused,
}

public sealed record DeliveryException(ExceptionKind Kind, int? Quantity, string Note);

public sealed record Signature(string Name, string Role, string ImageId);

/// <summary>What was captured at the handover.</summary>
public sealed record Delivery(
    DateTimeOffset At,
    IReadOnlyList<string> PhotoIds,
    Signature? Signature,
    Position? CapturedAt,
    string Note,
    DeliveryException? Exception);

public enum PodRefusal
{
    NoPhotos,
    NoSignature,
    NoName,
}

public abstract record PodResult
{
    public sealed record Sealed : PodResult;

    public sealed record Refused(PodRefusal Reason, string Detail) : PodResult;
}

/// <summary>
/// Proof of delivery.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/pod.ts</c> and is held to it by the parity
/// fixtures, wording included. A driver who is told one thing by the app and
/// another by the server, standing in a market with a queue behind them, will
/// conclude the app is broken — and they will be right.
/// </remarks>
public static class Pod
{
    /// <summary>
    /// The fewest photographs that make a delivery arguable.
    /// </summary>
    /// <remarks>
    /// Two: the goods, and the place. One photograph of a pallet could have
    /// been taken anywhere; a second showing the gate makes the pair hard to
    /// assemble after the fact.
    /// </remarks>
    public const int MinimumPhotos = 2;

    /// <summary>
    /// How far from the destination a capture may be and still be believed.
    /// </summary>
    /// <remarks>
    /// Generous — a kilometre — because a market address in Kano is a district
    /// rather than a gate. It is a <b>flag, not a refusal</b>: the delivery
    /// still records and the distance is shown to whoever reads it.
    /// </remarks>
    public const double CaptureRadiusM = 1_000;

    /// <summary>
    /// Whether this is enough to call a delivery proved.
    /// </summary>
    /// <remarks>
    /// Deliberately short. Every extra requirement is another thing a driver
    /// does standing in a market with a queue behind them, and a proof
    /// requirement that does not get met produces no proof at all.
    /// </remarks>
    public static PodResult Seal(Delivery delivery)
    {
        if (delivery.PhotoIds.Count < MinimumPhotos)
        {
            var short_ = MinimumPhotos - delivery.PhotoIds.Count;
            return new PodResult.Refused(
                PodRefusal.NoPhotos,
                $"Take {short_} more photo{(short_ == 1 ? "" : "s")} — the goods, and where you are.");
        }

        if (delivery.Signature is null)
        {
            return new PodResult.Refused(
                PodRefusal.NoSignature,
                "Ask whoever is receiving to sign.");
        }

        if (delivery.Signature.Name.Trim().Length == 0)
        {
            return new PodResult.Refused(
                PodRefusal.NoName,
                "Write the name of the person signing.");
        }

        return new PodResult.Sealed();
    }

    /// <summary>
    /// How far the capture was from where it should have been, or null.
    /// </summary>
    /// <remarks>
    /// Null covers both "no fix" and "no destination on file", and the two
    /// read the same: nothing is claimed either way. Claiming a delivery was
    /// made at the right place on the strength of no evidence is worse than
    /// claiming nothing.
    /// </remarks>
    public static long? CapturedNear(Delivery delivery, Waypoint? destination)
    {
        if (delivery.CapturedAt is null || destination is null) return null;

        return Geo.Distance(
            delivery.CapturedAt,
            new Position(destination.Lat, destination.Lon, 0, delivery.At));
    }

    /// <summary>
    /// Whether a delivery with an exception should still settle.
    /// </summary>
    /// <remarks>
    /// It should. A short delivery is a delivery, and holding the whole
    /// payment until a quantity dispute resolves punishes a carrier for a
    /// discrepancy that is usually the loading end's. A refusal is the one
    /// case where nothing was handed over.
    /// </remarks>
    public static bool SettlesDespite(DeliveryException? exception) =>
        exception is null || exception.Kind != ExceptionKind.Refused;

    public static string ToWire(ExceptionKind kind) => kind switch
    {
        ExceptionKind.Short => "short",
        ExceptionKind.Damaged => "damaged",
        ExceptionKind.Refused => "refused",
        _ => throw new InvalidOperationException($"unmapped exception kind {kind}"),
    };

    public static ExceptionKind? ExceptionFromWire(string wire) => wire switch
    {
        "short" => ExceptionKind.Short,
        "damaged" => ExceptionKind.Damaged,
        "refused" => ExceptionKind.Refused,
        _ => null,
    };

    public static string ToWire(PodRefusal reason) => reason switch
    {
        PodRefusal.NoPhotos => "no_photos",
        PodRefusal.NoSignature => "no_signature",
        PodRefusal.NoName => "no_name",
        _ => throw new InvalidOperationException($"unmapped pod refusal {reason}"),
    };
}
