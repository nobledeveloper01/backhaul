namespace Backhaul.Domain.Access;

/// <summary>Why a code did not work.</summary>
public enum CodeRefusal
{
    /// <summary>No code was ever asked for, or it is long gone.</summary>
    Unknown,
    Expired,
    /// <summary>Too many wrong guesses. The code is burned.</summary>
    Exhausted,
    /// <summary>Already signed in with.</summary>
    Used,
    Wrong,
}

/// <summary>A code that was issued, and what has happened to it.</summary>
public sealed record Challenge(
    string Phone,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt,
    int Attempts,
    DateTimeOffset? ConsumedAt);

public abstract record CodeCheck
{
    public sealed record Accepted : CodeCheck;

    public sealed record Refused(CodeRefusal Reason, string Detail) : CodeCheck;
}

/// <summary>
/// Signing in with a phone number and a code.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/otp.ts</c> and is held to it by the parity
/// fixtures — including the refusal wording, character for character. A person
/// who reads one sentence in the app and a different one from the API has
/// found a seam, and a seam in a sign-in flow reads as something being wrong
/// with their account.
/// </remarks>
public static class Otp
{
    /// <summary>Six digits — the length a Nigerian bank or telco sends.</summary>
    public const int CodeLength = 6;

    public static readonly TimeSpan CodeLives = TimeSpan.FromMinutes(10);

    /// <summary>Guesses before the code is burned.</summary>
    public const int MaxAttempts = 5;

    public static readonly TimeSpan ResendAfter = TimeSpan.FromSeconds(60);

    /// <summary>Codes per number per hour. Each one is an SMS somebody pays for.</summary>
    public const int MaxPerHour = 5;

    /// <summary>
    /// Nigerian mobile numbers, normalised to E.164.
    /// </summary>
    /// <remarks>
    /// The same phone is written four ways by four people and every one means
    /// the same driver. Storing what was typed makes a driver who signs in one
    /// way and back another way into two accounts.
    ///
    /// Returns null rather than guessing: a number this does not recognise is
    /// one to ask about, not one to normalise into somebody else's.
    /// </remarks>
    public static string? NormalisePhone(string input)
    {
        var digits = new string(input.Where(c => char.IsDigit(c) || c == '+').ToArray());

        if (digits.StartsWith("+234", StringComparison.Ordinal))
        {
            var rest = digits[4..];
            return rest.Length == 10 ? $"+234{rest}" : null;
        }

        if (digits.StartsWith("234", StringComparison.Ordinal))
        {
            var rest = digits[3..];
            return rest.Length == 10 ? $"+234{rest}" : null;
        }

        if (digits.StartsWith('0'))
        {
            var rest = digits[1..];
            return rest.Length == 10 ? $"+234{rest}" : null;
        }

        if (digits.Length == 10 && digits[0] is '7' or '8' or '9' && digits.All(char.IsDigit))
        {
            return $"+234{digits}";
        }

        return null;
    }

    /// <summary>How it is shown back. Nobody reads +234 out loud.</summary>
    public static string FormatPhone(string e164)
    {
        if (!e164.StartsWith("+234", StringComparison.Ordinal) || e164.Length != 14)
        {
            return e164;
        }

        var national = $"0{e164[4..]}";
        return $"{national[..4]} {national[4..7]} {national[7..]}";
    }

    /// <summary>
    /// Whether a code is good.
    /// </summary>
    /// <remarks>
    /// The comparison itself belongs to the caller, which holds the hash. The
    /// order of these checks is the interesting part: a burned code says so
    /// rather than saying "wrong", because a person who has mistyped five
    /// times needs a new code and not a sixth attempt at the same one.
    /// </remarks>
    public static CodeCheck Check(Challenge? challenge, bool matches, DateTimeOffset now)
    {
        if (challenge is null)
        {
            return new CodeCheck.Refused(
                CodeRefusal.Unknown,
                "Ask for a new code — this one is not one we sent.");
        }

        if (challenge.ConsumedAt is not null)
        {
            return new CodeCheck.Refused(
                CodeRefusal.Used,
                "That code has already been used. Ask for a new one.");
        }

        if (challenge.Attempts >= MaxAttempts)
        {
            return new CodeCheck.Refused(CodeRefusal.Exhausted, "Too many tries. Ask for a new code.");
        }

        if (challenge.ExpiresAt <= now)
        {
            return new CodeCheck.Refused(
                CodeRefusal.Expired,
                "That code has expired. Ask for a new one.");
        }

        if (!matches)
        {
            var left = MaxAttempts - challenge.Attempts - 1;
            return new CodeCheck.Refused(
                CodeRefusal.Wrong,
                left <= 0
                    ? "That code is wrong, and that was the last try. Ask for a new one."
                    : $"That code is wrong. {left} {(left == 1 ? "try" : "tries")} left.");
        }

        return new CodeCheck.Accepted();
    }

    /// <summary>Milliseconds until another code may be asked for, or zero.</summary>
    public static long ResendInMs(DateTimeOffset? lastIssuedAt, DateTimeOffset now)
    {
        if (lastIssuedAt is null)
        {
            return 0;
        }

        var waited = now - lastIssuedAt.Value;
        return waited >= ResendAfter ? 0 : (long)(ResendAfter - waited).TotalMilliseconds;
    }

    public static bool TooManyRequests(IReadOnlyList<DateTimeOffset> issuedAt, DateTimeOffset now)
    {
        var hourAgo = now.AddHours(-1);
        return issuedAt.Count(at => at >= hourAgo) >= MaxPerHour;
    }

    /// <summary>
    /// The message. Under 160 characters, no link.
    /// </summary>
    /// <remarks>
    /// It says not to share the code because the commonest way one is stolen
    /// is somebody phoning the person who just received it and asking for it.
    /// </remarks>
    public static string CodeMessage(string code) =>
        $"{code} is your Backhaul code. It lasts 10 minutes. Do not share it with " +
        "anyone, including anyone who says they are from Backhaul.";
}
