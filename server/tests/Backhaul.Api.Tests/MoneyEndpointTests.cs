using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// When the money moves, what calling it off costs, and what the road took.
/// </summary>
/// <remarks>
/// The arithmetic itself is held by <c>ParityTests</c> against
/// <c>fixtures/parity.json</c>. What is tested here is the part parity cannot
/// see: that the route reads the right evidence out of the database, and that
/// a trip with no agreed terms is answered with a sentence rather than a
/// schedule of zeroes.
/// </remarks>
public sealed class MoneyEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 6, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_trip_with_no_terms_says_so_rather_than_answering_zero()
    {
        // Tracking is the wedge, so a trip that is tracked and not traded is a
        // first-class thing rather than an incomplete one. A release schedule
        // of four zeroes would read as "you are owed nothing".
        var (trip, client) = await OpenAsync();

        var response = await client.GetAsync($"/v1/trips/{trip}/escrow");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("tracked, not traded", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Nothing_is_released_before_the_truck_starts()
    {
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);

        var escrow = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);

        Assert.Equal(0, escrow!.ReleasedKobo);
        Assert.Equal(escrow.AgreedKobo, escrow.HeldBackKobo);
        Assert.Equal("advance", escrow.NextKind);
        Assert.All(escrow.Releases, release => Assert.False(release.Met));
    }

    [Fact]
    public async Task The_advance_releases_once_loading_has_started()
    {
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);
        await AdvanceAsync(client, trip, "assigned", 10);
        await AdvanceAsync(client, trip, "loading", 40);

        var escrow = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);

        var advance = escrow!.Releases.Single(r => r.Kind == "advance");
        Assert.True(advance.Met);
        Assert.Equal(escrow.AgreedKobo * 30 / 100, escrow.ReleasedKobo);
        Assert.Equal("in_transit", escrow.NextKind);
    }

    [Fact]
    public async Task Six_hours_of_arriving_positions_release_the_second_milestone()
    {
        // The condition says "with positions arriving", so the evidence is the
        // positions. A trip that has been *in the in_transit state* for six
        // hours while sending nothing has not earned this.
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);
        await DriveAsync(client, trip);

        var claimed = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);
        Assert.False(claimed!.Releases.Single(r => r.Kind == "in_transit").Met);

        await SendPositionsAsync(client, trip, hours: 7);

        var proved = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);
        Assert.True(proved!.Releases.Single(r => r.Kind == "in_transit").Met);
        Assert.Equal("delivered", proved.NextKind);
    }

    [Fact]
    public async Task A_long_silence_is_not_counted_as_covered_time()
    {
        // Two hours of fixes, a day of nothing, two hours of fixes. That is
        // four hours of covered time and not twenty-eight — crediting the gap
        // would pay a carrier for precisely the stretch a shipper disputes.
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);
        await DriveAsync(client, trip);

        await SendPositionsAsync(client, trip, hours: 2);
        await SendPositionsAsync(client, trip, hours: 2, fromHour: 26);

        var escrow = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);

        Assert.False(escrow!.Releases.Single(r => r.Kind == "in_transit").Met);
    }

    [Fact]
    public async Task The_delivered_milestone_needs_the_proof_and_not_the_state()
    {
        // A state is a claim somebody made. The proof is photographs, a
        // signature and a position, and the money follows the second one.
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);
        await DriveAsync(client, trip);
        await AdvanceAsync(client, trip, "arrived", 890);
        await AdvanceAsync(client, trip, "delivered", 900);

        var claimed = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);
        Assert.False(claimed!.Releases.Single(r => r.Kind == "delivered").Met);

        await SealAsync(client, trip);

        var proved = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);
        Assert.True(proved!.Releases.Single(r => r.Kind == "delivered").Met);
    }

    [Fact]
    public async Task An_open_incident_holds_the_retention()
    {
        // The retention exists so a shortage discovered at the market has
        // something to be settled against. Releasing it on a timer regardless
        // would make it theatre.
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);
        await DriveAsync(client, trip);
        await AdvanceAsync(client, trip, "arrived", 890);
        await AdvanceAsync(client, trip, "delivered", 900);
        await SealAsync(client, trip);

        var raised = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new
            {
                kind = "cargo",
                at = T0.AddMinutes(910),
                note = "Two bags short.",
                reportedBy = "shipper",
                photoIds = new[] { "p0" },
            });
        raised.EnsureSuccessStatusCode();

        var escrow = await client.GetFromJsonAsync<EscrowView>($"/v1/trips/{trip}/escrow", Json);

        Assert.False(escrow!.Releases.Single(r => r.Kind == "retention").Met);
    }

    [Fact]
    public async Task Cancelling_inside_the_grace_window_costs_nothing()
    {
        var (trip, client) = await OpenAsync();
        await AdvanceAsync(client, trip, "assigned", 10);
        // Accepted just now, so the two-hour window is open.
        await PutTermsAsync(client, trip, acceptedAt: DateTimeOffset.UtcNow.AddMinutes(-30));

        var view = await client.GetFromJsonAsync<CancellationView>(
            $"/v1/trips/{trip}/cancellation?by=shipper", Json);

        Assert.True(view!.Ok);
        Assert.Equal(0, view.FeePct);
        Assert.True(view.WithinGrace);
        Assert.Contains("within two hours", view.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task And_walking_away_at_the_depot_costs_half_the_fare()
    {
        var (trip, client) = await OpenAsync();
        await AdvanceAsync(client, trip, "assigned", 10);
        await AdvanceAsync(client, trip, "loading", 40);
        await PutTermsAsync(client, trip, acceptedAt: DateTimeOffset.UtcNow.AddDays(-1));

        var view = await client.GetFromJsonAsync<CancellationView>(
            $"/v1/trips/{trip}/cancellation?by=carrier", Json);

        Assert.True(view!.Ok);
        Assert.Equal(50, view.FeePct);
        Assert.Contains("the truck was at the depot", view.Detail, StringComparison.Ordinal);

        // A carrier who walks away is somebody else's risk; a shipper who
        // changes their mind about their own load is not.
        Assert.True(view.CountsAgainstRecord);
    }

    [Fact]
    public async Task An_unknown_party_is_refused_rather_than_defaulted()
    {
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);

        var response = await client.GetAsync($"/v1/trips/{trip}/cancellation?by=somebody");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_cost_of_a_run_counts_the_levies_that_were_actually_recorded()
    {
        // Read, never estimated. What the road took is a fact the driver wrote
        // down at a checkpoint, and a modelled figure in its place would be
        // the platform inventing a receipt.
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);

        var levy = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/levies",
            new { kind = "police", amountKobo = 500_000L, at = T0.AddHours(2), note = "Ogere" });
        levy.EnsureSuccessStatusCode();

        var costs = await client.GetFromJsonAsync<CostsView>(
            $"/v1/trips/{trip}/costs?dieselPerLitreKobo=125000", Json);

        Assert.Equal(500_000L, costs!.LeviesKobo);
        Assert.True(costs.FuelKobo > 0);
        Assert.Equal(costs.FuelKobo + costs.RunningKobo + costs.LeviesKobo + costs.OtherKobo, costs.TotalKobo);

        // The floor is above the cost, or it is not a floor.
        Assert.True(costs.WalkAwayBelowKobo > costs.TotalKobo);
        Assert.Null(costs.Margin);
    }

    [Fact]
    public async Task A_fare_below_the_floor_is_advised_against_with_a_reason()
    {
        var (trip, client) = await OpenAsync();
        await PutTermsAsync(client, trip);

        var costs = await client.GetFromJsonAsync<CostsView>(
            $"/v1/trips/{trip}/costs?dieselPerLitreKobo=125000&offeredKobo=1000", Json);

        Assert.NotNull(costs!.Margin);
        Assert.False(costs.Margin!.Take);
        Assert.Contains("loses money", costs.Margin.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_statement_counts_only_deliveries_that_were_actually_proved()
    {
        // A delivered trip with no sealed proof has no date to hang the pay
        // on, and an unsealed delivery is exactly the case where nobody yet
        // agrees the trip finished.
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());

        var proved = await OpenAsync(client);
        var claimed = await OpenAsync(client);

        foreach (var trip in new[] { proved, claimed })
        {
            await PutTermsAsync(client, trip, payKobo: 18_000_000, advanceKobo: 8_000_000);
            await DriveAsync(client, trip);
            await AdvanceAsync(client, trip, "arrived", 890);
        await AdvanceAsync(client, trip, "delivered", 900);
        }

        await SealAsync(client, proved);

        var from = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddYears(-1).ToString("O"));
        var to = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddYears(1).ToString("O"));

        var statement = await client.GetFromJsonAsync<EarningsView>(
            $"/v1/me/earnings?from={from}&to={to}", Json);

        Assert.Equal(1, statement!.Trips);
        Assert.Equal(18_000_000L, statement.EarnedKobo);

        // Below three trips there is no rate, for the same reason `onTimeRate`
        // refuses one: a figure from a single run is arithmetic, not
        // information.
        Assert.Null(statement.PerKilometreKobo);
        Assert.Single(statement.Unpaid);
    }

    [Fact]
    public async Task A_window_that_runs_backwards_is_refused()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());

        var from = Uri.EscapeDataString(DateTimeOffset.UtcNow.ToString("O"));
        var to = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(-1).ToString("O"));

        var response = await client.GetAsync($"/v1/me/earnings?from={from}&to={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Somebody_elses_trip_is_a_404_and_not_a_403()
    {
        // The existence of a trip id is itself information. See ADR-0008.
        var (trip, _) = await OpenAsync();

        var stranger = await Identities.IssueAsync(factory, Role.Carrier);
        var theirs = stranger.Carrying(factory.CreateClient());

        var response = await theirs.GetAsync($"/v1/trips/{trip}/escrow");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Trip, HttpClient Client)> OpenAsync()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());
        return (await OpenAsync(client), client);
    }

    private static async Task<Guid> OpenAsync(HttpClient client)
    {
        var trip = Guid.NewGuid();

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                carrierPhone = Identities.NextPhone(),
                shipperPhone = Identities.NextPhone(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        response.EnsureSuccessStatusCode();

        return trip;
    }

    private static async Task PutTermsAsync(
        HttpClient client,
        Guid trip,
        DateTimeOffset? acceptedAt = null,
        long payKobo = 18_000_000,
        long advanceKobo = 8_000_000)
    {
        var response = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/terms",
            new
            {
                truck = "trailer_30t",
                agreedKobo = 224_000_000L,
                acceptedAt = acceptedAt ?? T0,
                distanceM = 830_000.0,
                driverPayKobo = payKobo,
                driverAdvanceKobo = advanceKobo,
                driverPaidAt = (DateTimeOffset?)null,
            });
        response.EnsureSuccessStatusCode();
    }

    /// <summary>
    /// Assigned, loading, in transit — the states a trip has to pass through
    /// before the ingest endpoint will take a position from it.
    /// </summary>
    private static async Task DriveAsync(HttpClient client, Guid trip)
    {
        await AdvanceAsync(client, trip, "assigned", 10);
        await AdvanceAsync(client, trip, "loading", 40);
        await AdvanceAsync(client, trip, "in_transit", 60);
    }

    /// <summary>Fixes every ten minutes, so a gap is a gap and not a sample rate.</summary>
    private static async Task SendPositionsAsync(
        HttpClient client,
        Guid trip,
        int hours,
        int fromHour = 2)
    {
        var samples = new List<object>();
        for (var minute = 0; minute <= hours * 60; minute += 10)
        {
            samples.Add(new
            {
                id = Guid.NewGuid(),
                lat = 6.45 + minute * 0.001,
                lon = 3.36 + minute * 0.001,
                accuracy = 10.0,
                at = T0.AddHours(fromHour).AddMinutes(minute),
            });
        }

        var response = await client.PostAsJsonAsync(
            "/v1/tracking/batch",
            new { batchId = Guid.NewGuid(), tripId = trip, samples });
        response.EnsureSuccessStatusCode();
    }

    private static async Task AdvanceAsync(HttpClient client, Guid trip, string state, int minutes)
    {
        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state, at = T0.AddMinutes(minutes), actor = "driver" });
        response.EnsureSuccessStatusCode();
    }

    private static async Task SealAsync(HttpClient client, Guid trip)
    {
        var draft = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/delivery",
            new
            {
                at = T0.AddMinutes(900),
                photoIds = new[] { "p0", "p1" },
                signatureName = "Ibrahim Sani",
                signatureRole = "storekeeper",
                signatureImageId = "s1",
                note = string.Empty,
            });
        draft.EnsureSuccessStatusCode();

        var sealed_ = await client.PostAsync($"/v1/trips/{trip}/delivery/seal", null);
        sealed_.EnsureSuccessStatusCode();
    }

    private sealed record EscrowView(
        long AgreedKobo,
        long ReleasedKobo,
        long HeldBackKobo,
        string? NextKind,
        string? NextCondition,
        List<ReleaseView> Releases);

    private sealed record ReleaseView(string Kind, int Pct, long AmountKobo, bool Met);

    private sealed record CancellationView(
        bool Ok,
        string? Reason,
        int? FeePct,
        long? FeeKobo,
        bool? WithinGrace,
        string Detail,
        bool CountsAgainstRecord);

    private sealed record CostsView(
        int Litres,
        long FuelKobo,
        long RunningKobo,
        long LeviesKobo,
        long OtherKobo,
        long TotalKobo,
        long WalkAwayBelowKobo,
        MarginView? Margin);

    private sealed record MarginView(long ProfitKobo, int? FractionPct, bool Take, string Detail);

    private sealed record EarningsView(
        int Trips,
        long EarnedKobo,
        long OutstandingKobo,
        long? PerKilometreKobo,
        List<UnpaidView> Unpaid);

    private sealed record UnpaidView(Guid TripId, string Corridor, long PayKobo);
}
