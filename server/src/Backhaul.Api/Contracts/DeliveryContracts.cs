using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class DeliveryRequest
{
    [Required]
    public DateTimeOffset At { get; set; }

    public List<string> PhotoIds { get; set; } = [];

    [MaxLength(80)]
    public string? SignatureName { get; set; }

    [MaxLength(40)]
    public string? SignatureRole { get; set; }

    [MaxLength(64)]
    public string? SignatureImageId { get; set; }

    public double? CapturedLat { get; set; }

    public double? CapturedLon { get; set; }

    public double? CapturedAccuracy { get; set; }

    [MaxLength(500)]
    public string Note { get; set; } = string.Empty;

    /// <summary>short, damaged or refused.</summary>
    [RegularExpression("^(short|damaged|refused)$")]
    public string? ExceptionKind { get; set; }

    public int? ExceptionQuantity { get; set; }

    [MaxLength(500)]
    public string? ExceptionNote { get; set; }
}

public sealed class DeliveryResponse
{
    public DateTimeOffset At { get; set; }

    public List<string> PhotoIds { get; set; } = [];

    public string? SignatureName { get; set; }

    public string? SignatureRole { get; set; }

    public string Note { get; set; } = string.Empty;

    public string? ExceptionKind { get; set; }

    public int? ExceptionQuantity { get; set; }

    public string? ExceptionNote { get; set; }

    public DateTimeOffset? SealedAt { get; set; }

    /// <summary>Whether it is enough to be proof, and what is missing if not.</summary>
    public bool CanSeal { get; set; }

    /// <summary>Null once it can be sealed. The domain's own sentence.</summary>
    public string? Missing { get; set; }

    /// <summary>
    /// How far the capture was from the destination, in metres.
    /// </summary>
    /// <remarks>
    /// Null when there was no fix or no destination on file, and the two read
    /// the same: nothing is claimed either way. A capture more than a kilometre
    /// out is flagged rather than refused — a market address in Kano is a
    /// district, not a gate.
    /// </remarks>
    public long? CapturedNearM { get; set; }

    /// <summary>Whether the trip still settles despite an exception.</summary>
    public bool Settles { get; set; }
}

public sealed class DropRequest
{
    [Required]
    [MaxLength(80)]
    public string Consignee { get; set; } = string.Empty;

    [Required]
    [MaxLength(120)]
    public string Goods { get; set; } = string.Empty;

    public int? Units { get; set; }

    [Range(0, 60_000)]
    public double WeightKg { get; set; }
}

public sealed class SignDropRequest
{
    [Required]
    public DateTimeOffset At { get; set; }

    /// <summary>Short, damaged, refused — in words, if there was one.</summary>
    [MaxLength(120)]
    public string? Exception { get; set; }
}

public sealed class DropResponse
{
    public Guid Id { get; set; }

    public string Consignee { get; set; } = string.Empty;

    public string Goods { get; set; } = string.Empty;

    public int? Units { get; set; }

    public double WeightKg { get; set; }

    public int Sequence { get; set; }

    public DateTimeOffset? DeliveredAt { get; set; }

    public string? Exception { get; set; }
}

public sealed class DropsResponse
{
    public List<DropResponse> Drops { get; set; } = [];

    /// <summary>Weight still aboard. What a weighbridge will read.</summary>
    public double WeightAboardKg { get; set; }

    /// <summary>What the extra stops add to the fare, in kobo.</summary>
    /// <remarks>
    /// The first drop is the delivery; every one after it is a detour, a wait
    /// and a second set of papers.
    /// </remarks>
    public long DropFeeKobo { get; set; }

    /// <summary>
    /// Whether the trip may close.
    /// </summary>
    /// <remarks>
    /// On the last signature, not on arriving at the last address.
    /// </remarks>
    public bool Complete { get; set; }

    /// <summary>Drops signed for while an earlier one was still aboard.</summary>
    public List<Guid> OutOfOrder { get; set; } = [];
}

public sealed class LevyRequest
{
    /// <summary>Client-generated, so a retry from a checkpoint is a no-op.</summary>
    [Required]
    public Guid Id { get; set; }

    /// <example>police</example>
    [Required]
    [RegularExpression("^(police|state_revenue|union|weighbridge|park|ferry|other)$")]
    public string Kind { get; set; } = string.Empty;

    [Range(1, 100_000_000)]
    public long AmountKobo { get; set; }

    [Required]
    public DateTimeOffset At { get; set; }

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    [MaxLength(200)]
    public string Note { get; set; } = string.Empty;

    [MaxLength(64)]
    public string? PhotoId { get; set; }
}

public sealed class LevyResponse
{
    public Guid Id { get; set; }

    public string Kind { get; set; } = string.Empty;

    public long AmountKobo { get; set; }

    public DateTimeOffset At { get; set; }

    public string Note { get; set; } = string.Empty;

    public string? PhotoId { get; set; }
}

public sealed class LeviesResponse
{
    public List<LevyResponse> Levies { get; set; } = [];

    public long TotalKobo { get; set; }

    /// <summary>
    /// What is left of the advance — <b>negative</b> when the driver is out of
    /// pocket.
    /// </summary>
    /// <remarks>
    /// The common case on a long run, and the number a driver actually cares
    /// about. Flooring it at zero would hide exactly that.
    /// </remarks>
    public long BalanceKobo { get; set; }
}
