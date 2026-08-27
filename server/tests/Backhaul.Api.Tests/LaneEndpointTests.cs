using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// The runs a shipper makes again.
/// </summary>
/// <remarks>
/// The median and the sentences are held by <c>ParityTests</c>. What is tested
/// here is who owns a lane, that the history only ever grows, and that a lane
/// with two runs has no typical price rather than a misleading one.
/// </remarks>
public sealed class LaneEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_carrier_has_no_lanes()
    {
        // A lane is a shipper's own commercial history, not a load board.
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        var response = await client.PutAsJsonAsync($"/v1/me/lanes/{Guid.NewGuid()}", Lane());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Two_runs_is_not_a_history()
    {
        // Below three there is no typical price at all, and the field is null
        // rather than a number nobody should act on.
        var (client, lane) = await LaneAsync();

        await RanAsync(client, lane, 220_000_000, DateTimeOffset.UtcNow.AddDays(-14));
        var after = await RanAsync(client, lane, 224_000_000, DateTimeOffset.UtcNow.AddDays(-7));

        Assert.Equal(2, after!.Runs);
        Assert.Null(after.TypicalKobo);
    }

    [Fact]
    public async Task Three_runs_gives_the_median_and_not_the_mean()
    {
        // One panic-priced run would drag a mean for a year. The median is
        // what a shipper can compare next month's quote against.
        var (client, lane) = await LaneAsync();

        await RanAsync(client, lane, 220_000_000, DateTimeOffset.UtcNow.AddDays(-21));
        await RanAsync(client, lane, 224_000_000, DateTimeOffset.UtcNow.AddDays(-14));
        var after = await RanAsync(client, lane, 900_000_000, DateTimeOffset.UtcNow.AddDays(-7));

        Assert.Equal(224_000_000L, after!.TypicalKobo);
    }

    [Fact]
    public async Task A_price_a_quarter_off_the_usual_one_is_called_unusual()
    {
        // A sentence, not a refusal. A shipper paying 40% over their own usual
        // rate may have a reason, and a platform that blocks it is a platform
        // they work around.
        var (client, lane) = await LaneAsync();

        foreach (var paid in new[] { 220_000_000L, 224_000_000L, 222_000_000L })
        {
            await RanAsync(client, lane, paid, DateTimeOffset.UtcNow.AddDays(-7));
        }

        var normal = await client.GetFromJsonAsync<bool>(
            $"/v1/me/lanes/{lane}/unusual?offeredKobo=230000000", Json);
        var wild = await client.GetFromJsonAsync<bool>(
            $"/v1/me/lanes/{lane}/unusual?offeredKobo=400000000", Json);

        Assert.False(normal);
        Assert.True(wild);
    }

    [Fact]
    public async Task A_lane_that_is_due_sorts_above_one_that_is_not()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());

        var soon = Guid.NewGuid();
        var later = Guid.NewGuid();

        await PutAsync(client, soon, Lane(cadence: "weekly"));
        await PutAsync(client, later, Lane(cadence: "monthly"));

        await RanAsync(client, soon, 220_000_000, DateTimeOffset.UtcNow.AddDays(-6));
        await RanAsync(client, later, 220_000_000, DateTimeOffset.UtcNow.AddDays(-1));

        var mine = await client.GetFromJsonAsync<List<LaneView>>("/v1/me/lanes", Json);

        Assert.Equal(soon, mine![0].Id);
        Assert.True(mine[0].Due);
        Assert.Equal("Due tomorrow", mine[0].DescribeDue);
    }

    [Fact]
    public async Task An_ad_hoc_lane_never_comes_due()
    {
        // A list that prompts about something with no schedule is a list that
        // prompts about everything.
        var (client, lane) = await LaneAsync(cadence: "ad_hoc");
        await RanAsync(client, lane, 220_000_000, DateTimeOffset.UtcNow.AddDays(-400));

        var mine = await client.GetFromJsonAsync<List<LaneView>>("/v1/me/lanes", Json);
        var found = mine!.Single(l => l.Id == lane);

        Assert.False(found.Due);
        Assert.Null(found.DueInMs);
        Assert.Equal("When needed", found.DescribeDue);
    }

    [Fact]
    public async Task Another_shippers_lane_cannot_be_amended()
    {
        var (_, lane) = await LaneAsync();

        var other = await Identities.IssueAsync(factory, Role.Shipper);
        var response = await other.Carrying(factory.CreateClient())
            .PutAsJsonAsync($"/v1/me/lanes/{lane}", Lane(name: "Mine now"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(HttpClient Client, Guid Lane)> LaneAsync(string cadence = "weekly")
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());
        var lane = Guid.NewGuid();

        await PutAsync(client, lane, Lane(cadence: cadence));
        return (client, lane);
    }

    private static async Task PutAsync(HttpClient client, Guid lane, object body)
    {
        var response = await client.PutAsJsonAsync($"/v1/me/lanes/{lane}", body);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<LaneView?> RanAsync(
        HttpClient client,
        Guid lane,
        long paidKobo,
        DateTimeOffset at)
    {
        var response = await client.PostAsJsonAsync(
            $"/v1/me/lanes/{lane}/runs",
            new { paidKobo, at });
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<LaneView>(Json);
    }

    private static object Lane(string cadence = "weekly", string name = "Apapa to Kano") => new
    {
        name,
        origin = "Lagos",
        destination = "Kano",
        cargo = "Cement",
        weightKg = 28_000.0,
        truck = "trailer_30t",
        cadence,
    };

    private sealed record LaneView(
        Guid Id,
        string Name,
        string Cadence,
        int Runs,
        long? TypicalKobo,
        long? DueInMs,
        bool Due,
        string DescribeDue);
}
