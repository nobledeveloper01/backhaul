using Backhaul.Api.Auth;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>A phone asking to be told things.</summary>
/// <param name="Token">The push token, from APNs or FCM.</param>
/// <param name="Platform">ios or android.</param>
/// <param name="UtcOffsetMinutes">
/// Minutes east of UTC, as the phone reports it. Lagos is 60.
/// <para>
/// Sent by the client because quiet hours belong to the reader. The alerts
/// screen can be asked what hour it is; a dispatcher running at three in the
/// morning cannot, and assuming West Africa Time inside the server is how this
/// breaks the first time somebody ships from Accra.
/// </para>
/// </param>
public sealed record DeviceRequest(string Token, string Platform, int UtcOffsetMinutes);

/// <summary>Where notifications go.</summary>
/// <remarks>
/// One row per install, keyed on the token — a person with a work phone and
/// their own phone gets both, and a reinstall replaces its own row rather than
/// leaving a dead token beside it.
/// </remarks>
[ApiController]
[Route("v1/me/devices")]
[Tags("alerts")]
public sealed class DevicesController(
    NotificationRepository devices,
    TimeProvider clock) : AuthorisedController
{
    /// <summary>Register or refresh this install.</summary>
    [HttpPut]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Put([FromBody] DeviceRequest body, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Token)) return BadRequest("A device needs a token.");

        if (body.Platform is not ("ios" or "android"))
        {
            return BadRequest($"Unknown platform '{body.Platform}'.");
        }

        // The real range is −12:00 to +14:00. Anything outside it is a bug on
        // the client rather than somebody in an unusual place, and accepting
        // it would put quiet hours in the wrong half of the day.
        if (body.UtcOffsetMinutes is < -720 or > 840)
        {
            return BadRequest("That is not a real UTC offset.");
        }

        await devices.RegisterAsync(
            body.Token,
            Caller.UserId,
            body.Platform,
            body.UtcOffsetMinutes,
            clock.GetUtcNow(),
            ct);

        return NoContent();
    }

    /// <summary>Stop sending to this install.</summary>
    /// <remarks>
    /// Filtered on the caller as well as the token. A push token is not a
    /// secret — it is on the wire every time the phone talks to a gateway —
    /// and without the filter anybody holding one could silence somebody else.
    /// </remarks>
    [HttpDelete("{token}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(string token, CancellationToken ct) =>
        await devices.ForgetAsync(token, Caller.UserId, ct)
            ? NoContent()
            : NotFound("No such device.");
}
