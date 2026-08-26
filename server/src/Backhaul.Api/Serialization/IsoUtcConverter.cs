using System.Text.Json;
using System.Text.Json.Serialization;

using Backhaul.Domain;

namespace Backhaul.Api.Serialization;

/// <summary>
/// Writes every timestamp the way the rest of the product writes them:
/// <c>2026-03-04T08:00:00.000Z</c>.
/// </summary>
/// <remarks>
/// <para>
/// System.Text.Json's default for <see cref="DateTimeOffset"/> is the
/// round-trip format, which renders UTC as <c>+00:00</c>. That is valid ISO
/// 8601 and it is not what JavaScript's <c>toISOString()</c> produces, so
/// without this the API emitted two different spellings of the same instant —
/// <c>+00:00</c> in response bodies and <c>Z</c> inside the refusal messages,
/// which are built by the domain.
/// </para>
/// <para>
/// Found by reading a response rather than by a test. Both forms parse, so
/// nothing would have failed; it would just have been quietly inconsistent
/// forever, and a client written against one spelling would look wrong beside
/// a client written against the other.
/// </para>
/// <para>
/// Reading stays permissive: a device sends what its platform gives it, and
/// refusing an offset-bearing timestamp would reject valid uploads.
/// </para>
/// </remarks>
public sealed class IsoUtcConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options) => reader.GetDateTimeOffset();

    public override void Write(
        Utf8JsonWriter writer,
        DateTimeOffset value,
        JsonSerializerOptions options) => writer.WriteStringValue(Iso.Utc(value));
}
