namespace Backhaul.Domain.Trips;

public enum IncidentKind
{
    /// <summary>Mechanical. The most common by a distance.</summary>
    Breakdown,
    /// <summary>Armed robbery, hijack, theft from the load.</summary>
    Security,
    Accident,
    /// <summary>Held by police, customs, a union, a weighbridge.</summary>
    Detained,
    /// <summary>Impassable road, flood, closure.</summary>
    Road,
    /// <summary>Damage or shortage found on the load.</summary>
    Cargo,
}

public enum Severity
{
    Blocking,
    Delaying,
    Noted,
}

/// <summary>
/// Something that went wrong on the road.
/// </summary>
/// <remarks>
/// Mirrors <c>packages/domain/src/incidents.ts</c> and is held to it by the
/// parity fixtures. A report is a <b>claim</b>, never a verdict: "upheld" is a
/// human decision recorded elsewhere, and it is what costs a carrier a tier.
/// </remarks>
public static class Incidents
{
    /// <summary>
    /// How severe each kind is when nobody says otherwise.
    /// </summary>
    /// <remarks>
    /// A default rather than a fixed answer: a driver reporting a breakdown at
    /// the roadside should not have to classify their own emergency, and a
    /// wrong default is better than a dropdown between them and telling
    /// somebody.
    /// </remarks>
    public static Severity DefaultSeverity(IncidentKind kind) => kind switch
    {
        IncidentKind.Breakdown => Severity.Blocking,
        IncidentKind.Security => Severity.Blocking,
        IncidentKind.Accident => Severity.Blocking,
        IncidentKind.Detained => Severity.Delaying,
        IncidentKind.Road => Severity.Delaying,
        IncidentKind.Cargo => Severity.Noted,
        _ => throw new InvalidOperationException($"unmapped incident kind {kind}"),
    };

    /// <summary>
    /// Whether an incident raises the trip to disputed on its own.
    /// </summary>
    /// <remarks>
    /// Only cargo and security. A breakdown is a delay, not a dispute — and
    /// raising every breakdown would make the disputed state mean "something
    /// happened" instead of "the two sides disagree", after which nobody reads
    /// the list.
    /// </remarks>
    public static bool RaisesDispute(IncidentKind kind) =>
        kind is IncidentKind.Cargo or IncidentKind.Security;

    /// <summary>
    /// Whether a report of this kind needs a photograph to be worth anything.
    /// </summary>
    /// <remarks>
    /// Cargo and accident reports without a picture are one person's word, and
    /// one person's word is what the product exists to replace. Security is
    /// deliberately exempt: nobody photographs a hijack, and demanding it
    /// would mean the report that matters most is the one that cannot be
    /// filed.
    /// </remarks>
    public static bool NeedsPhoto(IncidentKind kind) =>
        kind is IncidentKind.Cargo or IncidentKind.Accident;

    // wired-check: the mirror of a rule that is now enforced on the app side
    // and has nowhere to run on this one. This gate found it callerless on
    // BOTH sides, which meant "arrives 18:40" could sit beside "broken down
    // near Jebba" on a live trip — `eta()` in packages/domain now takes the
    // trip's incidents and refuses with `blocked` before it measures anything,
    // so the app is fixed. Here there is still no ETA path to call it from.
    // It stays because ADR-0005 says a rule that exists on both sides is held
    // to the fixtures, and because the day the server serves an ETA — or
    // decides ShareScope's `Eta` flag on more than the scope — this is the
    // check it must not reinvent. Not a caller yet; a mirror kept honest.
    /// <summary>Whether the arrival estimate should stop being shown.</summary>
    /// <remarks>
    /// "Arrives 18:40" beside "broken down near Jebba" is the product
    /// contradicting itself.
    /// </remarks>
    public static bool SuppressesEta(IReadOnlyList<Severity> open) =>
        open.Any(s => s == Severity.Blocking);

    public static string ToWire(IncidentKind kind) => kind switch
    {
        IncidentKind.Breakdown => "breakdown",
        IncidentKind.Security => "security",
        IncidentKind.Accident => "accident",
        IncidentKind.Detained => "detained",
        IncidentKind.Road => "road",
        IncidentKind.Cargo => "cargo",
        _ => throw new InvalidOperationException($"unmapped incident kind {kind}"),
    };

    public static IncidentKind? FromWire(string wire) => wire switch
    {
        "breakdown" => IncidentKind.Breakdown,
        "security" => IncidentKind.Security,
        "accident" => IncidentKind.Accident,
        "detained" => IncidentKind.Detained,
        "road" => IncidentKind.Road,
        "cargo" => IncidentKind.Cargo,
        _ => null,
    };

    public static string ToWire(Severity severity) => severity switch
    {
        Severity.Blocking => "blocking",
        Severity.Delaying => "delaying",
        Severity.Noted => "noted",
        _ => throw new InvalidOperationException($"unmapped severity {severity}"),
    };

    public static Severity? SeverityFromWire(string wire) => wire switch
    {
        "blocking" => Severity.Blocking,
        "delaying" => Severity.Delaying,
        "noted" => Severity.Noted,
        _ => null,
    };
}
