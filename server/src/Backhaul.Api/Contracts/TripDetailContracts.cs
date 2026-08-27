using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class MessageRequest
{
    /// <summary>Client-generated. The same id twice is the same message.</summary>
    /// <remarks>
    /// A driver who wrote in a dead zone and retried must not end up with two
    /// copies in a thread that a dispute is read from.
    /// </remarks>
    [Required]
    public Guid Id { get; set; }

    /// <summary>shipper, carrier or driver.</summary>
    /// <example>driver</example>
    [Required]
    [RegularExpression("^(shipper|carrier|driver)$")]
    public string From { get; set; } = string.Empty;

    /// <summary>Under 500 characters. Longer than that is a phone call.</summary>
    [Required]
    [MaxLength(500)]
    public string Body { get; set; } = string.Empty;

    /// <summary>When it was written, which is not when it arrives.</summary>
    [Required]
    public DateTimeOffset At { get; set; }
}

public sealed class MessageResponse
{
    public Guid Id { get; set; }

    public string From { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;

    /// <summary>When it was written, as the device believes.</summary>
    public DateTimeOffset At { get; set; }

    /// <summary>
    /// When the server took it.
    /// </summary>
    /// <remarks>
    /// Often hours later than <see cref="At"/>. Both travel, because the gap
    /// is how a late report is told from a late delivery.
    /// </remarks>
    public DateTimeOffset ReceivedAt { get; set; }

    public List<string> ReadBy { get; set; } = [];
}

public sealed class IncidentRequest
{
    /// <example>breakdown</example>
    [Required]
    [RegularExpression("^(breakdown|security|accident|detained|road|cargo)$")]
    public string Kind { get; set; } = string.Empty;

    /// <summary>Optional: the kind's own default is used when absent.</summary>
    /// <remarks>
    /// A driver at a roadside should not have to classify their own emergency,
    /// and a wrong default is better than a dropdown between them and telling
    /// somebody.
    /// </remarks>
    [RegularExpression("^(blocking|delaying|noted)$")]
    public string? Severity { get; set; }

    [Required]
    public DateTimeOffset At { get; set; }

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    [MaxLength(500)]
    public string Note { get; set; } = string.Empty;

    /// <example>driver</example>
    [Required]
    [RegularExpression("^(shipper|carrier|driver)$")]
    public string ReportedBy { get; set; } = string.Empty;

    public List<string> PhotoIds { get; set; } = [];
}

public sealed class IncidentResponse
{
    public Guid Id { get; set; }

    public string Kind { get; set; } = string.Empty;

    public string Severity { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    public string Note { get; set; } = string.Empty;

    public string ReportedBy { get; set; } = string.Empty;

    public List<string> PhotoIds { get; set; } = [];

    public DateTimeOffset? ResolvedAt { get; set; }

    /// <summary>Whether this alone puts the trip under dispute.</summary>
    /// <remarks>
    /// Computed rather than stored: the rule lives in the domain and is shared
    /// with the app, and a stored copy is a copy that can disagree.
    /// </remarks>
    public bool RaisesDispute { get; set; }
}

public sealed class WaypointRequest
{
    [Required]
    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    /// <example>checkpoint</example>
    [Required]
    [RegularExpression("^(origin|destination|checkpoint|rest)$")]
    public string Kind { get; set; } = string.Empty;

    [Required]
    [Range(-90, 90)]
    public double Lat { get; set; }

    [Required]
    [Range(-180, 180)]
    public double Lon { get; set; }

    /// <summary>How close counts as "there", in metres. At least 150.</summary>
    /// <remarks>
    /// Below that, a fix's own uncertainty is larger than the fence and
    /// arrival depends on which way the phone happened to be wrong.
    /// </remarks>
    [Range(150, 20_000)]
    public double RadiusM { get; set; } = 400;
}

public sealed class WaypointResponse
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Kind { get; set; } = string.Empty;

    public double Lat { get; set; }

    public double Lon { get; set; }

    public double RadiusM { get; set; }

    public int Sequence { get; set; }
}

/// <summary>A visit to a waypoint, computed from the cleaned track.</summary>
public sealed class VisitResponse
{
    public Guid WaypointId { get; set; }

    public string Name { get; set; } = string.Empty;

    public DateTimeOffset Arrived { get; set; }

    /// <summary>Null while the truck is still inside the fence.</summary>
    public DateTimeOffset? Left { get; set; }

    public long DurationMs { get; set; }

    public int Fixes { get; set; }
}

public sealed class WaypointsResponse
{
    public List<WaypointResponse> Waypoints { get; set; } = [];

    public List<VisitResponse> Visits { get; set; } = [];

    /// <summary>
    /// Waiting time that counts toward demurrage.
    /// </summary>
    /// <remarks>
    /// Origin and destination only. A queue at a checkpoint is nobody's fault
    /// and nobody's bill; time held at a depot is exactly what demurrage is
    /// for, and the distinction has to live somewhere a screen cannot fudge.
    /// </remarks>
    public long ChargeableWaitingMs { get; set; }
}
