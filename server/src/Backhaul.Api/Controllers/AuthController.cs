using Backhaul.Api.Auth;
using Backhaul.Api.Contracts;
using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Backhaul.Api.Controllers;

/// <summary>
/// Signing in with a phone number and a code.
/// </summary>
/// <remarks>
/// <para>
/// The only sign-in this product can have. A driver on a northern corridor has
/// a phone number and often no email address, and a password is a thing to
/// forget on a device shared between two drivers on alternate weeks.
/// </para>
/// <para>
/// Both routes are public — they are how a person gets a token in the first
/// place — which puts them in the same category as the share route and under
/// the same scrutiny. The policy behind them lives in
/// <c>packages/domain/src/otp.ts</c> and is held to this C# by the parity
/// fixtures, wording included.
/// </para>
/// </remarks>
[ApiController]
[Route("v1/auth")]
[Tags("auth")]
[EnableRateLimiting(RateLimits.PublicAuth)]
public sealed class AuthController(
    SignInRepository signIn,
    TokenRepository tokens,
    ISmsSender sms,
    TimeProvider clock,
    IConfiguration configuration) : ControllerBase
{
    /// <summary>Ask for a code.</summary>
    /// <remarks>
    /// Answers the same way whether or not the number has an account. Telling
    /// a caller which numbers are registered turns this into a way to find out
    /// who uses Backhaul, and there is no version of that which helps anybody.
    /// </remarks>
    [HttpPost("request")]
    [ProducesResponseType<RequestCodeResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<AuthRefusalResponse>(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<RequestCodeResponse>> RequestCode(
        [FromBody] RequestCodeRequest body,
        CancellationToken ct)
    {
        var phone = Otp.NormalisePhone(body.Phone);
        if (phone is null)
        {
            return BadRequest(new AuthRefusalResponse
            {
                Refusal = "not_a_number",
                Message = "That does not look like a Nigerian mobile number.",
            });
        }

        var now = clock.GetUtcNow();

        var recent = await signIn.IssuedSinceAsync(phone, now.AddHours(-1), ct);
        if (Otp.TooManyRequests(recent, now))
        {
            // Each code is an SMS somebody pays for, and an unauthenticated
            // endpoint that sends messages on request is a way to spend a
            // company's money and to harass a phone number.
            return StatusCode(StatusCodes.Status429TooManyRequests, new AuthRefusalResponse
            {
                Refusal = "too_many",
                Message = "Too many codes for that number. Try again in an hour.",
                RetryInMs = (long)TimeSpan.FromHours(1).TotalMilliseconds,
            });
        }

        var newest = await signIn.NewestAsync(phone, ct);

        // The cooldown applies to a code that is still *outstanding*. One that
        // has already been signed in with is finished, and holding a new
        // request against it conflates "we just sent you something you still
        // need" with "you already used it".
        //
        // It also closed a small information leak: a number that had recently
        // signed in answered differently from one that never had, which is a
        // difference an outsider can measure.
        var outstanding = newest.Challenge is { ConsumedAt: null } ? newest.Challenge : null;
        var wait = Otp.ResendInMs(outstanding?.IssuedAt, now);
        if (wait > 0)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new AuthRefusalResponse
            {
                Refusal = "too_soon",
                Message = "A code was just sent. Wait a moment before asking for another.",
                RetryInMs = wait,
            });
        }

        var code = await signIn.IssueAsync(phone, now, ct);
        await sms.SendAsync(phone, Otp.CodeMessage(code), ct);

        return new RequestCodeResponse
        {
            Phone = Otp.FormatPhone(phone),
            ResendInMs = (long)Otp.ResendAfter.TotalMilliseconds,
            // Only when there is no gateway. `Program.cs` refuses to start in
            // this mode against a real database, so it cannot ship by being
            // forgotten.
            DevelopmentCode = HasSmsGateway ? null : code,
        };
    }

    /// <summary>Turn a code into a token.</summary>
    [HttpPost("verify")]
    [ProducesResponseType<SignedInResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<AuthRefusalResponse>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<SignedInResponse>> Verify(
        [FromBody] VerifyCodeRequest body,
        CancellationToken ct)
    {
        var phone = Otp.NormalisePhone(body.Phone);
        if (phone is null)
        {
            return BadRequest(new AuthRefusalResponse
            {
                Refusal = "not_a_number",
                Message = "That does not look like a Nigerian mobile number.",
            });
        }

        var now = clock.GetUtcNow();
        var (challenge, id) = await signIn.NewestAsync(phone, ct);

        var matches = challenge is not null && await signIn.MatchesAsync(id, body.Code, ct);
        var result = Otp.Check(challenge, matches, now);

        if (result is CodeCheck.Refused refused)
        {
            // A wrong guess counts. Anything else does not: an expired or
            // already-used code is not somebody guessing, and counting it
            // would let a stale code in a client's retry loop burn a fresh
            // one's attempts.
            if (refused.Reason == CodeRefusal.Wrong)
            {
                await signIn.CountAttemptAsync(id, ct);
            }

            return Unauthorized(new AuthRefusalResponse
            {
                Refusal = refused.Reason.ToString().ToLowerInvariant(),
                Message = refused.Detail,
            });
        }

        var account = await signIn.ConsumeAsync(id, phone, now, ct);

        var token = await tokens.IssueAsync(
            account.UserId,
            account.Role,
            label: Otp.FormatPhone(phone),
            issuedAt: now,
            // Ninety days. A driver signs in once and works; making them
            // re-authenticate mid-corridor because a token lapsed is the kind
            // of thing that gets an app deleted.
            expiresAt: now.AddDays(90),
            ct);

        return new SignedInResponse
        {
            Token = token,
            UserId = account.UserId,
            Role = account.Role.ToString().ToLowerInvariant(),
            Name = account.Name,
            IsNew = account.IsNew,
        };
    }

    private bool HasSmsGateway =>
        !string.IsNullOrWhiteSpace(configuration["Sms:Provider"]);
}

/// <summary>Setting your own name. Authenticated, unlike signing in.</summary>
[ApiController]
[Route("v1/me")]
[Tags("auth")]
public sealed class MeController(SignInRepository signIn) : AuthorisedController
{
    /// <summary>Who the caller is.</summary>
    [HttpGet]
    [ProducesResponseType<SignedInResponse>(StatusCodes.Status200OK)]
    public ActionResult<SignedInResponse> Me() => new SignedInResponse
    {
        // Deliberately empty. The token is not re-issued by asking who you
        // are, and an endpoint that hands one back is one that turns a leaked
        // response into a fresh credential.
        Token = string.Empty,
        UserId = Caller.UserId,
        Role = Caller.Role.ToString().ToLowerInvariant(),
        Name = string.Empty,
        IsNew = false,
    };

    /// <summary>Set your name, after a first sign-in.</summary>
    [HttpPut("name")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Name([FromBody] NameRequest body, CancellationToken ct)
    {
        var found = await signIn.NameAsync(Caller.UserId, body.Name.Trim(), ct);
        return found ? NoContent() : NotFound("No such account.");
    }
}
