using System.ComponentModel.DataAnnotations;

namespace Backhaul.Infrastructure.Entities;

/// <summary>One message on a trip's thread.</summary>
/// <remarks>
/// Append-only, like the trip history and for the same reason: the thread is
/// part of a dispute pack, and a message that can be edited afterwards is
/// worth nothing in one.
/// </remarks>
public sealed class MessageEntity
{
    /// <summary>Client-generated, and the deduplication key.</summary>
    /// <remarks>
    /// A driver writing in a dead zone queues a message and retries when the
    /// signal returns. Same reasoning as a position sample: the id is the
    /// primary key, so a duplicate delivery is a no-op by construction.
    /// </remarks>
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    /// <summary>shipper, carrier or driver.</summary>
    [MaxLength(16)]
    public string From { get; set; } = string.Empty;

    [MaxLength(500)]
    public string Body { get; set; } = string.Empty;

    /// <summary>When it was written, as the device believes.</summary>
    public DateTimeOffset At { get; set; }

    /// <summary>
    /// When the server took it.
    /// </summary>
    /// <remarks>
    /// Not the same as <see cref="At"/>, often by hours. Both are kept: one is
    /// what the driver believes and the other is what can be proved, and a
    /// dispute needs to tell them apart.
    /// </remarks>
    public DateTimeOffset ReceivedAt { get; set; }

    /// <summary>Comma-separated parties who have seen it. Small and bounded.</summary>
    [MaxLength(64)]
    public string ReadBy { get; set; } = string.Empty;
}

/// <summary>Something that went wrong on the road.</summary>
public sealed class IncidentEntity
{
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    /// <summary>breakdown, security, accident, detained, road or cargo.</summary>
    [MaxLength(16)]
    public string Kind { get; set; } = string.Empty;

    /// <summary>blocking, delaying or noted.</summary>
    [MaxLength(16)]
    public string Severity { get; set; } = string.Empty;

    public DateTimeOffset At { get; set; }

    public DateTimeOffset ReceivedAt { get; set; }

    public double? Lat { get; set; }

    public double? Lon { get; set; }

    [MaxLength(500)]
    public string Note { get; set; } = string.Empty;

    [MaxLength(16)]
    public string ReportedBy { get; set; } = string.Empty;

    /// <summary>Comma-separated blob ids. The API never looks inside one.</summary>
    [MaxLength(500)]
    public string PhotoIds { get; set; } = string.Empty;

    /// <summary>
    /// When somebody said it was over.
    /// </summary>
    /// <remarks>
    /// A person, never a timer. A breakdown does not stop being a breakdown
    /// because an hour passed, and a system that closed its own incidents
    /// would close the one nobody dealt with.
    /// </remarks>
    public DateTimeOffset? ResolvedAt { get; set; }
}

/// <summary>A place a trip is meant to pass through.</summary>
public sealed class WaypointEntity
{
    public Guid Id { get; set; }

    public Guid TripId { get; set; }

    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    /// <summary>origin, destination, checkpoint or rest.</summary>
    [MaxLength(16)]
    public string Kind { get; set; } = string.Empty;

    public double Lat { get; set; }

    public double Lon { get; set; }

    /// <summary>
    /// How close counts as "there", in metres.
    /// </summary>
    /// <remarks>
    /// Per waypoint, not global: a depot yard is a couple of hundred metres
    /// and a border post is a queue that can stretch for two kilometres.
    /// </remarks>
    public double RadiusM { get; set; }

    /// <summary>Position in the route. Ordered by this, never by name.</summary>
    public int Sequence { get; set; }
}
