using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>
/// The commercial terms of one trip.
/// </summary>
/// <remarks>
/// <para>
/// Separate from <see cref="TripEntity"/> rather than more columns on it,
/// because the two are written by different things at different times: the
/// trip is appended to by a phone on a road, and the terms are agreed once by
/// two people in an office and then do not move.
/// </para>
/// <para>
/// A trip can exist without terms — a tracking-only trip, which is the whole
/// wedge — so every read of this table has to cope with its absence rather
/// than assume a row.
/// </para>
/// </remarks>
public sealed class TripTermsEntity
{
    public Guid TripId { get; set; }

    /// <summary>The class the fare was priced against.</summary>
    [MaxLength(16)]
    public string Truck { get; set; } = "trailer_30t";

    /// <summary>The agreed fare, in kobo.</summary>
    public long AgreedKobo { get; set; }

    /// <summary>
    /// When the bid was accepted.
    /// </summary>
    /// <remarks>
    /// The clock the free-cancellation window runs from. Not the trip's first
    /// event: a trip is opened when a shipper writes it down, and accepted
    /// when a carrier says yes, and there can be days between the two.
    /// </remarks>
    public DateTimeOffset AcceptedAt { get; set; }

    /// <summary>Road distance the fare was priced over, in metres.</summary>
    public double DistanceM { get; set; }

    /// <summary>The driver's own pay for the trip. Not the fare.</summary>
    public long DriverPayKobo { get; set; }

    /// <summary>Advanced to the driver before the trip, against expenses.</summary>
    public long DriverAdvanceKobo { get; set; }

    /// <summary>When the driver was settled, or null while it is still owed.</summary>
    public DateTimeOffset? DriverPaidAt { get; set; }
}
