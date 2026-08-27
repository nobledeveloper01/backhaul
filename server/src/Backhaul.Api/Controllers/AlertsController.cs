using Backhaul.Api.Auth;
using Backhaul.Domain.Access;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>One thing worth telling somebody about.</summary>
/// <param name="Kind">signal_lost, stalled, incident, duress, delivered…</param>
/// <param name="TripId">The trip it is about.</param>
/// <param name="Corridor">Where to where, as a person would say it.</param>
/// <param name="At">When the condition became true.</param>
/// <param name="Describe">Plain words. Never a state name with an underscore in it.</param>
/// <param name="Urgency">urgent, push or quiet.</param>
/// <param name="WouldSend">Whether it would reach the caller right now.</param>
/// <param name="HeldBecause">Why not, when it would not.</param>
public sealed record AlertResponse(
    string Kind,
    Guid TripId,
    string Corridor,
    DateTimeOffset At,
    string Describe,
    string Urgency,
    bool WouldSend,
    string? HeldBecause);

/// <summary>What reaches the caller's phone, and what is held.</summary>
/// <param name="Alerts">Everything open, most urgent first.</param>
/// <param name="Digest">
/// One sentence for everything held overnight, or null. Releasing four held
/// notifications at 06:00 is four buzzes in a minute, which reads as a
/// malfunction rather than as a summary.
/// </param>
public sealed record AlertsResponse(IReadOnlyList<AlertResponse> Alerts, string? Digest);

/// <summary>
/// Who hears about what, and how loudly.
/// </summary>
/// <remarks>
/// <para>
/// Exactly one kind is urgent — a driver in trouble. If everything is urgent,
/// nothing is.
/// </para>
/// <para>
/// The local hour is a parameter rather than the server's own clock. A shipper
/// in Lagos and a driver in Kano share a timezone today, and assuming that
/// inside the server is how this breaks the first time somebody ships from
/// Accra.
/// </para>
/// </remarks>
[ApiController]
[Route("v1/me/alerts")]
[Tags("alerts")]
public sealed class AlertsController(
    AlertRepository alerts,
    NotificationRepository sent,
    TimeProvider clock) : AuthorisedController
{
    /// <param name="localHour">The reader's own hour of the day, 0–23.</param>
    /// <param name="ct">Cancellation.</param>
    [HttpGet]
    [ProducesResponseType<AlertsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<AlertsResponse>> Get(
        [FromQuery] int localHour,
        CancellationToken ct)
    {
        if (localHour is < 0 or > 23) return BadRequest("localHour must be between 0 and 23.");

        var now = clock.GetUtcNow();
        // With what has already gone out, so this screen agrees with the
        // phone. A shipper who was pushed about a stall an hour ago should see
        // it marked as already sent rather than as pending — the screen and the
        // dispatcher read the same policy against the same record.
        var open = await alerts.OpenAsync(Caller, now, await sent.LastSentAsync(Caller.UserId, ct), ct);

        var audience = Caller.Role switch
        {
            Role.Shipper => Audience.Shipper,
            Role.Carrier => Audience.Carrier,
            _ => Audience.Driver,
        };

        var rendered = new List<AlertResponse>();
        var held = new List<AlertKind>();

        foreach (var row in open)
        {
            var decision = Alerts.Decide(row.Kind, audience, localHour, row.LastSentAt, now);

            // The wrong audience is not "held": it was never for this person,
            // and putting it in their overnight summary would be the server
            // telling a driver about their own signal dropping.
            if (decision is Decision.Hold { Reason: "wrong_audience" }) continue;

            if (decision is Decision.Hold { Reason: "quiet_hours" }) held.Add(row.Kind);

            rendered.Add(new AlertResponse(
                Alerts.ToWire(row.Kind),
                row.TripId,
                row.Corridor,
                row.At,
                Alerts.Describe(row.Kind),
                Alerts.UrgencyWire(Alerts.Policy[row.Kind].Urgency),
                decision is Decision.Send,
                decision is Decision.Hold hold ? hold.Reason : null));
        }

        return new AlertsResponse(
            rendered
                .OrderBy(a => a.Urgency switch { "urgent" => 0, "push" => 1, _ => 2 })
                .ThenByDescending(a => a.At)
                .ToList(),
            Alerts.Digest(held));
    }
}
