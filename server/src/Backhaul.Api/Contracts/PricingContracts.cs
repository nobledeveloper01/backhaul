namespace Backhaul.Api.Contracts;

public sealed class QuoteResponse
{
    /// <summary>Kobo.</summary>
    public long Low { get; set; }

    /// <summary>Kobo.</summary>
    public long Mid { get; set; }

    /// <summary>Kobo.</summary>
    public long High { get; set; }

    /// <summary>
    /// Always true. On the response rather than assumed, so no client can
    /// render the figure without it.
    /// </summary>
    public bool IsIndicative { get; set; }

    /// <summary>The floor decided the price, not the distance.</summary>
    public bool AtMinimum { get; set; }

    /// <summary>One sentence, for rendering beside the figure.</summary>
    public string Basis { get; set; } = string.Empty;

    /// <summary>The range, already formatted in whole naira.</summary>
    public string Display { get; set; } = string.Empty;
}

public sealed class SettlementLineResponse
{
    public string Label { get; set; } = string.Empty;

    /// <summary>Kobo. Negative for a deduction.</summary>
    public long Amount { get; set; }

    /// <summary>Whole naira, as it should appear.</summary>
    public string Display { get; set; } = string.Empty;
}

public sealed class SettlementResponse
{
    public List<SettlementLineResponse> Lines { get; set; } = [];

    /// <summary>How the demurrage figure was arrived at.</summary>
    public string DemurrageBasis { get; set; } = string.Empty;

    /// <summary>
    /// A statement of what each party is owed, not a payment instruction.
    /// Backhaul does not hold money; the parties settle directly.
    /// </summary>
    public string Note { get; set; } = string.Empty;
}
