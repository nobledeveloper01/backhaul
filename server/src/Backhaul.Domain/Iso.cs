using System.Globalization;

namespace Backhaul.Domain;

/// <summary>
/// Timestamps rendered the way the rest of the product renders them.
/// </summary>
/// <remarks>
/// <para>
/// JavaScript's <c>Date.toISOString()</c> produces
/// <c>2026-03-04T06:20:00.000Z</c>: exactly three fractional digits and a
/// literal <c>Z</c>. .NET's round-trip format <c>"O"</c> produces
/// <c>2026-03-04T06:20:00.0000000+00:00</c> — seven digits and a numeric
/// offset. Both are valid ISO 8601 and they are not the same string.
/// </para>
/// <para>
/// That matters here because these timestamps appear inside refusal messages
/// shown to a driver, and the parity fixtures compare those messages
/// character for character. The mismatch was found by the fixtures on their
/// first run, which is the entire reason ADR-0005 requires them.
/// </para>
/// </remarks>
public static class Iso
{
    private const string Format = "yyyy-MM-ddTHH:mm:ss.fff'Z'";

    public static string Utc(DateTimeOffset value) =>
        value.ToUniversalTime().ToString(Format, CultureInfo.InvariantCulture);
}
