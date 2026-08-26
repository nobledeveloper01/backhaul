using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class OpenTripRequest
{
    /// <summary>Who carries it.</summary>
    /// <remarks>
    /// The three parties are fixed when the trip opens and are what every
    /// later read is filtered against. "The carrier who employs this driver"
    /// changes over time; who could see a trip in March is a fact about March.
    /// See ADR-0008.
    /// </remarks>
    [Required]
    public Guid DriverId { get; set; }

    /// <summary>Who owns the truck.</summary>
    [Required]
    public Guid CarrierId { get; set; }

    /// <summary>Who owns the goods.</summary>
    [Required]
    public Guid ShipperId { get; set; }

    [Required]
    public DateTimeOffset At { get; set; }

    /// <summary>shipper, carrier, driver or system.</summary>
    /// <example>shipper</example>
    [Required]
    [RegularExpression("^(shipper|carrier|driver|system)$")]
    public string Actor { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Note { get; set; }
}

public sealed class TripEventRequest
{
    /// <summary>
    /// The state to move to. The server holds the same machine the device does
    /// and refuses a transition it does not permit — a client can be modified,
    /// and a trip history is evidence.
    /// </summary>
    /// <example>in_transit</example>
    [Required]
    [RegularExpression(
        "^(open|assigned|loading|in_transit|signal_lost|stalled|arrived|delivered|disputed|cancelled)$")]
    public string State { get; set; } = string.Empty;

    [Required]
    public DateTimeOffset At { get; set; }

    /// <example>driver</example>
    [Required]
    [RegularExpression("^(shipper|carrier|driver|system)$")]
    public string Actor { get; set; } = string.Empty;

    /// <summary>Shown verbatim in a dispute pack.</summary>
    [MaxLength(500)]
    public string? Note { get; set; }
}

public sealed class TripEventResponse
{
    public string State { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }

    public string Actor { get; set; } = string.Empty;

    public string? Note { get; set; }
}

public sealed class TripResponse
{
    public Guid Id { get; set; }

    public string State { get; set; } = string.Empty;

    /// <summary>Whether the device should be recording positions right now.</summary>
    public bool Tracking { get; set; }

    /// <summary>
    /// Where the trip may go next. Sent so a client renders the actions the
    /// machine actually permits rather than its own idea of them.
    /// </summary>
    public List<string> AllowedNext { get; set; } = [];

    public List<TripEventResponse> History { get; set; } = [];
}

/// <summary>A refusal, in the machine's own words.</summary>
public sealed class RefusalResponse
{
    /// <summary>Written to be shown to a driver at a loading bay, not logged.</summary>
    public string Message { get; set; } = string.Empty;

    /// <summary>not_allowed, terminal or out_of_order.</summary>
    public string Refusal { get; set; } = string.Empty;
}
