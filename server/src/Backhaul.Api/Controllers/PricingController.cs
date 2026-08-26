using Backhaul.Api.Contracts;
using Backhaul.Domain.Money;
using Backhaul.Domain.Pricing;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

/// <summary>
/// Pricing, straight out of the domain.
/// </summary>
/// <remarks>
/// There is no arithmetic in this file. Every figure comes from
/// <c>Backhaul.Domain</c>, which the parity fixtures hold to the same answers
/// the mobile app gives. The controller names fields and formats for display.
/// </remarks>
[ApiController]
[Route("v1/pricing")]
[Tags("pricing")]
public sealed class PricingController : ControllerBase
{
    /// <summary>An indicative range for moving a truck over a distance.</summary>
    /// <remarks>
    /// A range, never a single number: a single number reads as a price, and
    /// this is the middle of a distribution that diesel moves every few weeks.
    ///
    /// Weight is not a parameter. A half-empty trailer costs a full trailer to
    /// move; weight decides the class and stops mattering there.
    /// </remarks>
    /// <param name="truck">pickup, canter, truck_15t, trailer_30t or lowbed.</param>
    /// <param name="distanceMetres">Road distance in metres.</param>
    [HttpGet("quote")]
    [ProducesResponseType<QuoteResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<QuoteResponse> GetQuote(
        [FromQuery] string truck,
        [FromQuery] int distanceMetres)
    {
        var truckClass = Trucks.FromWire(truck);
        if (truckClass is null)
        {
            return BadRequest($"Unknown truck class '{truck}'.");
        }

        if (distanceMetres < 0)
        {
            return BadRequest("distanceMetres cannot be negative.");
        }

        var quote = Quote.For(truckClass.Value, distanceMetres);

        return new QuoteResponse
        {
            Low = quote.Low.Value,
            Mid = quote.Mid.Value,
            High = quote.High.Value,
            IsIndicative = quote.IsIndicative,
            AtMinimum = quote.AtMinimum,
            Basis = quote.Basis,
            Display = $"{quote.Low} – {quote.High}",
        };
    }

    /// <summary>What each party is owed.</summary>
    /// <remarks>
    /// Commission is taken on the agreed fare and never on demurrage —
    /// otherwise the platform earns more the worse the trip goes.
    ///
    /// Every line is whole naira, so the lines add up to each other on screen
    /// as well as in the arithmetic.
    /// </remarks>
    [HttpGet("settlement")]
    [ProducesResponseType<SettlementResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult<SettlementResponse> GetSettlement(
        [FromQuery] string truck,
        [FromQuery] decimal agreedNaira,
        [FromQuery] int waitedMinutes,
        [FromQuery] decimal advanceNaira = 0)
    {
        var truckClass = Trucks.FromWire(truck);
        if (truckClass is null)
        {
            return BadRequest($"Unknown truck class '{truck}'.");
        }

        if (agreedNaira < 0 || advanceNaira < 0 || waitedMinutes < 0)
        {
            return BadRequest("Amounts and waiting time cannot be negative.");
        }

        var waited = Demurrage.For(truckClass.Value, TimeSpan.FromMinutes(waitedMinutes));
        var settlement = Settlement.Of(
            Kobo.FromNaira(agreedNaira),
            waited.Amount,
            Kobo.FromNaira(advanceNaira));

        return new SettlementResponse
        {
            Lines =
            [
                Line("Agreed fare", settlement.Agreed),
                Line("Demurrage", settlement.Demurrage),
                Line("Gross", settlement.Gross),
                Deduction("Backhaul commission", settlement.Commission),
                Deduction("Advance already paid", settlement.Advance),
                Line("Due to carrier", settlement.ToCarrier),
            ],
            DemurrageBasis = waited.Basis,
            Note =
                "A statement of what each party is owed. Backhaul does not hold " +
                "money — the parties settle directly.",
        };
    }

    private static SettlementLineResponse Line(string label, Kobo amount) => new()
    {
        Label = label,
        Amount = amount.Value,
        Display = amount.ToString(),
    };

    private static SettlementLineResponse Deduction(string label, Kobo amount) => new()
    {
        Label = label,
        Amount = -amount.Value,
        Display = $"−{amount}",
    };
}
