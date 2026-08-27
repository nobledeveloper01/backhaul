using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class PositionSampleRequest
{
    /// <summary>
    /// Client-generated, and the deduplication key. The device assigns it once
    /// when the fix is captured and never changes it, so a batch delivered
    /// twice is harmless by construction.
    /// </summary>
    [Required]
    public Guid Id { get; set; }

    /// <example>6.455</example>
    [Range(-90, 90)]
    public double Lat { get; set; }

    /// <example>3.3841</example>
    [Range(-180, 180)]
    public double Lon { get; set; }

    /// <summary>
    /// Metres of horizontal uncertainty as reported by the OS. Stored as sent —
    /// the server never discards a fix for being imprecise, because a track
    /// that lost half its fixes is something a shipper is owed the sight of.
    /// Cleaning happens on read.
    /// </summary>
    /// <example>12.5</example>
    [Range(0, 100_000)]
    public double Accuracy { get; set; }

    [Required]
    public DateTimeOffset At { get; set; }

    /// <summary>Metres per second, when the OS supplies it.</summary>
    [Range(0, 200)]
    public double? Speed { get; set; }

    /// <summary>
    /// Battery at the moment of the fix, 0–1. Carried because a trip that goes
    /// dark at 3% is a flat phone, not a driver hiding, and the difference
    /// decides whether anyone gets accused of anything.
    /// </summary>
    [Range(0, 1)]
    public double? Battery { get; set; }
}

public sealed class TrackingBatchRequest
{
    /// <summary>The largest batch the endpoint accepts; the device's queue drain size.</summary>
    public const int MaxBatch = 200;

    /// <summary>
    /// Idempotency key for the whole batch. A device that does not receive an
    /// acknowledgement retries with the same key, and gets the original
    /// outcome rather than a second write.
    /// </summary>
    [Required]
    public Guid BatchId { get; set; }

    [Required]
    public Guid TripId { get; set; }

    [Required]
    [MinLength(1)]
    [MaxLength(MaxBatch)]
    public List<PositionSampleRequest> Samples { get; set; } = [];
}

public sealed class TrackingBatchResponse
{
    /// <summary>Echoed back so the device can match the acknowledgement.</summary>
    public Guid BatchId { get; set; }

    /// <summary>Samples durably stored by this call.</summary>
    public int Accepted { get; set; }

    /// <summary>
    /// Samples already held. Not an error — duplicate delivery is the expected
    /// consequence of a device that only deletes on acknowledgement.
    /// </summary>
    public int Duplicate { get; set; }

    /// <summary>
    /// True when this exact batch had already been acknowledged and this
    /// response is a replay of that outcome.
    /// </summary>
    public bool Replayed { get; set; }
}

/// <summary>One cleaned fix, as a screen draws it.</summary>
/// <remarks>
/// Accuracy travels with every fix and is not decoration: the movement rule
/// requires a step to clear the combined accuracy of both ends, and a client
/// that redraws a corridor without it would draw the parked-truck jitter that
/// rule exists to exclude.
/// </remarks>
public sealed class FixResponse
{
    public double Lat { get; set; }

    public double Lon { get; set; }

    public double Accuracy { get; set; }

    public DateTimeOffset At { get; set; }

    public double? Speed { get; set; }
}

/// <summary>Why one fix was thrown away.</summary>
public sealed class DroppedFixResponse
{
    public FixResponse Fix { get; set; } = new();

    /// <summary>too_imprecise, out_of_order or implausible_jump.</summary>
    public string Problem { get; set; } = string.Empty;
}

/// <summary>
/// The whole cleaned track, fix by fix.
/// </summary>
/// <remarks>
/// <para>
/// Separate from <see cref="TrackResponse"/>, which is a summary. A list draws
/// a status chip from the summary and must not pay for two thousand fixes to
/// do it; a trip screen draws a corridor, a pace chart and the stops, and
/// cannot do any of that from five numbers.
/// </para>
/// <para>
/// <b>The dropped fixes travel too.</b> A driver whose distance is disputed is
/// owed the answer to "what did you throw away?", and a screen that shows a
/// distance without the share of fixes it came from is a screen presenting an
/// estimate as a measurement.
/// </para>
/// </remarks>
public sealed class CleanedTrackResponse
{
    public List<FixResponse> Kept { get; set; } = [];

    public List<DroppedFixResponse> Dropped { get; set; } = [];
}

public sealed class TrackResponse
{
    public int Kept { get; set; }

    public int Dropped { get; set; }

    /// <summary>
    /// Share of fixes that survived cleaning, 0–1. Travels with
    /// <see cref="DistanceMetres"/> and is not optional: a distance computed
    /// from 30% of the fixes is not wrong, but nobody should be shown it
    /// without knowing that.
    /// </summary>
    public double Quality { get; set; }

    /// <summary>
    /// The measured path, never the straight line — a detour a driver was made
    /// to take is distance they drove.
    /// </summary>
    public long DistanceMetres { get; set; }

    /// <summary>moving, stopped, stalled, silent, or unknown.</summary>
    public string Observation { get; set; } = "unknown";

    /// <summary>
    /// Null when there are no fixes at all, which is different from having been
    /// silent forever — it renders as "not started", not "no signal for 9 hours".
    /// </summary>
    public long? SilentForMs { get; set; }
}
