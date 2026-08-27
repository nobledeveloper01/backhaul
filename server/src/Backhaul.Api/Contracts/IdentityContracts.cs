using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class PaperRequest
{
    /// <summary>Whether the paper is on file. Not whether it is genuine.</summary>
    public bool Held { get; set; }
}

public sealed class VerificationResponse
{
    /// <summary>unverified, verified, business or trusted.</summary>
    /// <remarks>
    /// Computed on every read and never stored. A stored tier is a stored copy
    /// of a rule, and a copy that drifts is a carrier who is one thing on their
    /// own screen and another on a shipper's.
    /// </remarks>
    public string Tier { get; set; } = "unverified";

    public bool HasIdentity { get; set; }

    public bool HasLicence { get; set; }

    public bool HasRegistration { get; set; }

    public bool HasInsurance { get; set; }

    public int TripsCompleted { get; set; }

    /// <summary>Of the completed trips, those with a promised arrival to be judged against.</summary>
    public int TripsPromised { get; set; }

    public int TripsOnTime { get; set; }

    public int Incidents { get; set; }

    /// <summary>Null below five trips.</summary>
    public double? OnTimeRate { get; set; }
}

public sealed class VehicleRequest
{
    /// <example>LSR-482-XA</example>
    [Required]
    [MaxLength(20)]
    public string Plate { get; set; } = string.Empty;

    /// <example>trailer_30t</example>
    [Required]
    [RegularExpression("^(pickup|canter|truck_15t|trailer_30t|lowbed)$")]
    public string Truck { get; set; } = string.Empty;

    public DateTimeOffset? LicenceExpires { get; set; }

    public DateTimeOffset? RoadworthinessExpires { get; set; }

    public DateTimeOffset? InsuranceExpires { get; set; }

    public DateTimeOffset? PermitExpires { get; set; }

    public DateTimeOffset? RetiredAt { get; set; }
}

public sealed class PaperDays
{
    public string Paper { get; set; } = string.Empty;

    /// <summary>Days until it expires. Negative when it already has.</summary>
    public int Days { get; set; }
}

public sealed class VehicleResponse
{
    public Guid Id { get; set; }

    public string Plate { get; set; } = string.Empty;

    public string Truck { get; set; } = string.Empty;

    /// <summary>road_legal, expiring, lapsed, incomplete or retired.</summary>
    public string Standing { get; set; } = string.Empty;

    /// <summary>Whether this truck may be assigned to a new trip today.</summary>
    /// <remarks>
    /// A paper that lapses mid-trip never strands a driver — it blocks the
    /// next assignment instead.
    /// </remarks>
    public bool MayCarry { get; set; }

    public List<PaperDays> Lapsed { get; set; } = [];

    public List<PaperDays> Expiring { get; set; } = [];

    public List<string> Missing { get; set; } = [];
}

public sealed class DuressRequest
{
    /// <example>hidden_press</example>
    [Required]
    [RegularExpression("^(hidden_press|duress_pin|hardware)$")]
    public string Trigger { get; set; } = string.Empty;

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    [Range(0, 1)]
    public double? BatteryFraction { get; set; }
}

public sealed class DuressResponse
{
    public Guid Id { get; set; }

    public string Trigger { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    public double? BatteryFraction { get; set; }
}
