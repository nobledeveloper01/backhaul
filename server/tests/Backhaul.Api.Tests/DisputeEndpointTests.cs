using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// The pack, assembled from what the server actually holds.
/// </summary>
/// <remarks>
/// The assembler's rules are held by <c>ParityTests</c>. What is tested here
/// is the part parity cannot see: that thousands of fixes become a handful of
/// runs, that a run carries the interval it covers, and that the pack says
/// what it contains without saying who is right.
/// </remarks>
public sealed class DisputeEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 6, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Thousands_of_fixes_become_a_handful_of_runs()
    {
        // A pack with two thousand lines in it is a pack nobody reads. The
        // runs break where the tracker itself would call the trip silent, so
        // the pack's idea of a gap and the tracker's are the same number.
        var (trip, client) = await DrivenAsync();
        await SendPositionsAsync(client, trip, hours: 6, fromHour: 2);

        var pack = await client.GetFromJsonAsync<PackView>($"/v1/trips/{trip}/dispute", Json);

        var runs = pack!.Items.Where(i => i.Kind == "position").ToList();
        var run = Assert.Single(runs);

        // The interval, not the instant. This is the bug that made a
        // continuously covered trip report nine holes.
        Assert.NotNull(run.Until);
        Assert.True(run.Until > run.At);
        Assert.Equal(6 * 3_600_000L, pack.CoveredMs);
        Assert.Empty(pack.Gaps);
    }

    [Fact]
    public async Task A_real_hole_is_named_and_a_beginning_is_not()
    {
        // A trip is open for hours before a truck loads: messages are
        // exchanged, nothing is moving and nothing should be recorded.
        // Counting that as missing evidence tells a shipper the record has
        // holes in it when what it has is a beginning.
        var (trip, client) = await DrivenAsync();

        await SendPositionsAsync(client, trip, hours: 2, fromHour: 2);
        await SendPositionsAsync(client, trip, hours: 2, fromHour: 12);

        var pack = await client.GetFromJsonAsync<PackView>($"/v1/trips/{trip}/dispute", Json);

        var gap = Assert.Single(pack!.Gaps);
        Assert.Equal(8 * 3_600_000L, gap.Ms);
    }

    [Fact]
    public async Task A_message_written_in_a_dead_zone_is_marked_late_rather_than_dropped()
    {
        // The gap between when it was written and when it arrived is itself
        // evidence — it is how a late report is told from a late delivery.
        var (trip, client) = await DrivenAsync();
        await SendPositionsAsync(client, trip, hours: 6, fromHour: 2);

        var written = DateTimeOffset.UtcNow.AddDays(-1);
        var sent = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/messages",
            new { id = Guid.NewGuid(), from = "driver", body = "Held at the checkpoint", at = written });
        sent.EnsureSuccessStatusCode();

        var pack = await client.GetFromJsonAsync<PackView>($"/v1/trips/{trip}/dispute", Json);

        var message = Assert.Single(pack!.Items, i => i.Kind == "message");
        Assert.Equal("late_attested", message.Weight);
        Assert.True(pack.LateAttested >= 1);
        Assert.Contains("reported late", pack.Describe, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_pack_counts_and_never_judges()
    {
        // The moment this sentence contains "strong" or "weak" it is the
        // platform taking a side.
        var (trip, client) = await DrivenAsync();
        await SendPositionsAsync(client, trip, hours: 6, fromHour: 2);

        var pack = await client.GetFromJsonAsync<PackView>($"/v1/trips/{trip}/dispute", Json);

        foreach (var word in new[] { "strong", "weak", "suggests", "likely", "fault" })
        {
            Assert.DoesNotContain(word, pack!.Describe, StringComparison.OrdinalIgnoreCase);
        }

        Assert.Contains("measured by the tracker", pack!.Describe, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_thinly_tracked_trip_says_so_before_anybody_relies_on_it()
    {
        // Not "the claim is weak" — that is not this system's call. It is
        // whether there is enough here for two people to argue from at all.
        var (trip, client) = await DrivenAsync();
        await SendPositionsAsync(client, trip, hours: 1, fromHour: 2);

        var pack = await client.GetFromJsonAsync<PackView>($"/v1/trips/{trip}/dispute", Json);

        Assert.True(pack!.Thin);
    }

    [Fact]
    public async Task Somebody_elses_trip_is_a_404()
    {
        var (trip, _) = await DrivenAsync();

        var stranger = await Identities.IssueAsync(factory, Role.Shipper);
        var response = await stranger.Carrying(factory.CreateClient())
            .GetAsync($"/v1/trips/{trip}/dispute");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Trip, HttpClient Client)> DrivenAsync()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();

        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverId = driver.UserId,
                carrierId = Guid.NewGuid(),
                shipperId = Guid.NewGuid(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        opened.EnsureSuccessStatusCode();

        foreach (var (state, minutes) in new[] { ("assigned", 10), ("loading", 40), ("in_transit", 60) })
        {
            var response = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = T0.AddMinutes(minutes), actor = "driver" });
            response.EnsureSuccessStatusCode();
        }

        return (trip, client);
    }

    private static async Task SendPositionsAsync(
        HttpClient client,
        Guid trip,
        int hours,
        int fromHour)
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

    private sealed record PackView(
        Guid TripId,
        List<EvidenceView> Items,
        int Measured,
        int Attested,
        int LateAttested,
        long CoveredMs,
        List<GapView> Gaps,
        string Describe,
        bool Thin);

    private sealed record EvidenceView(
        string Kind,
        DateTimeOffset At,
        DateTimeOffset? Until,
        string Summary,
        string Source,
        string Weight);

    private sealed record GapView(DateTimeOffset From, DateTimeOffset To, long Ms);
}
