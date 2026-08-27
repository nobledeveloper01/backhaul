using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>A carrier's papers and record.</summary>
/// <remarks>
/// The record half is **never written by the carrier**. Trips completed and
/// trips on time are counted from trips; incidents are counted from upheld
/// reports. A rating somebody can type in is a rating worth nothing.
/// </remarks>
public sealed class CarrierProfileEntity
{
    /// <summary>The account this belongs to.</summary>
    public Guid UserId { get; set; }

    public bool HasIdentity { get; set; }

    public bool HasLicence { get; set; }

    public bool HasRegistration { get; set; }

    public bool HasInsurance { get; set; }

    /// <summary>Expiry per paper, where one was given. ISO dates, comma-separated pairs.</summary>
    [MaxLength(200)]
    public string Expiries { get; set; } = string.Empty;

}

/// <summary>A truck, and the papers that let it work.</summary>
public sealed class VehicleEntity
{
    public Guid Id { get; set; }

    public Guid CarrierId { get; set; }

    [MaxLength(20)]
    public string Plate { get; set; } = string.Empty;

    /// <summary>pickup, canter, truck_15t, trailer_30t or lowbed.</summary>
    [MaxLength(16)]
    public string Truck { get; set; } = string.Empty;

    public DateTimeOffset? LicenceExpires { get; set; }

    public DateTimeOffset? RoadworthinessExpires { get; set; }

    public DateTimeOffset? InsuranceExpires { get; set; }

    public DateTimeOffset? PermitExpires { get; set; }

    /// <summary>Withdrawn from service by its owner. Not a document problem.</summary>
    public DateTimeOffset? RetiredAt { get; set; }
}

/// <summary>A driver's alarm.</summary>
/// <remarks>
/// The one record in the product whose *response* must produce nothing on the
/// screen it came from. See <c>packages/domain/src/duress.ts</c>: whoever is
/// standing over the driver must not be able to tell it happened.
/// </remarks>
public sealed class DuressEntity
{
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    public Guid RaisedBy { get; set; }

    /// <summary>hidden_press, duress_pin or hardware.</summary>
    [MaxLength(20)]
    public string Trigger { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    public double? BatteryFraction { get; set; }

    /// <summary>
    /// When a person said it was over.
    /// </summary>
    /// <remarks>
    /// Never a timer. A truck that went quiet an hour after the alarm is the
    /// case that most needs to stay open.
    /// </remarks>
    public DateTimeOffset? ClearedAt { get; set; }

    public Guid? ClearedBy { get; set; }
}
