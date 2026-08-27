using System.ComponentModel.DataAnnotations;

namespace Backhaul.Api.Contracts;

public sealed class RequestCodeRequest
{
    /// <summary>
    /// A Nigerian mobile number, written however the person writes it.
    /// </summary>
    /// <remarks>
    /// `0803 123 4567`, `+2348031234567` and `8031234567` are the same driver.
    /// The server normalises; the client does not have to guess.
    /// </remarks>
    /// <example>0803 123 4567</example>
    [Required]
    [MaxLength(24)]
    public string Phone { get; set; } = string.Empty;
}

public sealed class RequestCodeResponse
{
    /// <summary>The number as it will be shown back: <c>0803 123 4567</c>.</summary>
    public string Phone { get; set; } = string.Empty;

    /// <summary>How long until another code may be asked for.</summary>
    /// <remarks>
    /// Sent so the client can count down rather than disable a button with no
    /// explanation — somebody whose SMS has not arrived needs to know they are
    /// waiting rather than that something is broken.
    /// </remarks>
    public long ResendInMs { get; set; }

    /// <summary>
    /// The code, when there is no SMS gateway configured.
    /// </summary>
    /// <remarks>
    /// Development only, and <c>Program.cs</c> refuses to start in this mode
    /// against a real database. It is here so a reviewer can sign in without
    /// provisioning a gateway; it is <b>null</b> the moment one exists.
    /// </remarks>
    public string? DevelopmentCode { get; set; }
}

public sealed class VerifyCodeRequest
{
    [Required]
    [MaxLength(24)]
    public string Phone { get; set; } = string.Empty;

    /// <example>418293</example>
    [Required]
    [RegularExpression(@"^\d{6}$")]
    public string Code { get; set; } = string.Empty;
}

public sealed class SignedInResponse
{
    /// <summary>The bearer token. Shown once; only a hash is stored.</summary>
    public string Token { get; set; } = string.Empty;

    public Guid UserId { get; set; }

    /// <summary>driver, carrier or shipper.</summary>
    public string Role { get; set; } = "driver";

    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Whether this number has just been seen for the first time.
    /// </summary>
    /// <remarks>
    /// The client asks a new account for a name and takes an existing one
    /// straight to their trips. Sent rather than inferred from an empty name,
    /// because somebody may legitimately not have set one.
    /// </remarks>
    public bool IsNew { get; set; }
}

public sealed class NameRequest
{
    /// <example>Musa Danjuma</example>
    [Required]
    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;
}

/// <summary>A refusal, in the same words the app uses.</summary>
public sealed class AuthRefusalResponse
{
    /// <summary>unknown, expired, exhausted, used, wrong, or too_many.</summary>
    public string Refusal { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    /// <summary>Set on <c>too_many</c>: when to try again.</summary>
    public long? RetryInMs { get; set; }
}
