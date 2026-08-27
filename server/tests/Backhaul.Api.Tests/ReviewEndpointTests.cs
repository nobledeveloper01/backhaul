using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// Facts, not stars.
/// </summary>
/// <remarks>
/// The counting is held by <c>ParityTests</c>. What is tested here is who may
/// leave one, when the window closes, and that an unanswered question stays
/// unanswered all the way through the database and back.
/// </remarks>
public sealed class ReviewEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_trip_with_no_sealed_proof_has_nothing_to_review()
    {
        // A state is a claim somebody made. The proof is what a review hangs
        // off, and saying so is more useful than a 404.
        var (_, trip, shipper, driver) = await ReviewableAsync();
        await DeliverAsync(driver, trip, seal: false);

        var response = await shipper.PutAsJsonAsync($"/v1/trips/{trip}/review", Answers());

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("no proof of delivery", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_driver_does_not_review_the_trip()
    {
        var (_, trip, _, driver) = await ReviewableAsync();
        await DeliverAsync(driver, trip, seal: true);

        var response = await driver.PutAsJsonAsync($"/v1/trips/{trip}/review", Answers());

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task A_question_that_is_not_on_the_form_is_refused()
    {
        var (_, trip, shipper, driver) = await ReviewableAsync();
        await DeliverAsync(driver, trip, seal: true);

        var response = await shipper.PutAsJsonAsync(
            $"/v1/trips/{trip}/review",
            new { answers = new Dictionary<string, bool> { ["was_polite"] = true }, note = "" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task An_unanswered_question_survives_the_round_trip_as_unanswered()
    {
        // The whole shape of this feature. A shipper who never needed to phone
        // the driver has not said the driver was unreachable, and a store that
        // collapsed the two would say they had.
        var (about, trip, shipper, driver) = await ReviewableAsync();
        await DeliverAsync(driver, trip, seal: true);

        var left = await shipper.PutAsJsonAsync(
            $"/v1/trips/{trip}/review",
            new
            {
                answers = new Dictionary<string, bool>
                {
                    ["arrived_to_load"] = true,
                    ["cargo_intact"] = false,
                },
                note = "Two bags short.",
            });
        left.EnsureSuccessStatusCode();

        var record = await shipper.GetFromJsonAsync<RecordView>(
            $"/v1/people/{about}/record?side=carrier", Json);

        var arrived = record!.Tallies.Single(t => t.Claim == "arrived_to_load");
        var intact = record.Tallies.Single(t => t.Claim == "cargo_intact");
        var reachable = record.Tallies.Single(t => t.Claim == "reachable");

        Assert.Equal((1, 1), (arrived.Yes, arrived.Asked));
        Assert.Equal((0, 1), (intact.Yes, intact.Asked));
        Assert.Equal((0, 0), (reachable.Yes, reachable.Asked));
    }

    [Fact]
    public async Task One_answer_is_not_a_pattern_and_is_not_shown_as_one()
    {
        // Below three, a single bad trip reads as a pattern and the person it
        // reads that way about has no way to outrun it.
        var (about, trip, shipper, driver) = await ReviewableAsync();
        await DeliverAsync(driver, trip, seal: true);

        var left = await shipper.PutAsJsonAsync($"/v1/trips/{trip}/review", Answers());
        left.EnsureSuccessStatusCode();

        var record = await shipper.GetFromJsonAsync<RecordView>(
            $"/v1/people/{about}/record?side=carrier", Json);

        Assert.All(record!.Tallies, tally => Assert.False(tally.WorthShowing));
    }

    [Fact]
    public async Task A_second_review_of_the_same_trip_replaces_the_first()
    {
        // A review is somebody's current opinion and they may change it. What
        // is not allowed is two of them counted separately.
        var (about, trip, shipper, driver) = await ReviewableAsync();
        await DeliverAsync(driver, trip, seal: true);

        await shipper.PutAsJsonAsync($"/v1/trips/{trip}/review", Answers(arrived: false));
        await shipper.PutAsJsonAsync($"/v1/trips/{trip}/review", Answers(arrived: true));

        var record = await shipper.GetFromJsonAsync<RecordView>(
            $"/v1/people/{about}/record?side=carrier", Json);

        Assert.Equal(1, record!.Reviews);
        var arrived = record.Tallies.Single(t => t.Claim == "arrived_to_load");
        Assert.Equal((1, 1), (arrived.Yes, arrived.Asked));
    }

    [Fact]
    public async Task Anybody_signed_in_can_read_a_record()
    {
        // A record exists so a stranger can decide whether to trade with
        // somebody. One only its subject can read is not a record.
        var stranger = await Identities.IssueAsync(factory, Role.Carrier);

        var record = await stranger.Carrying(factory.CreateClient())
            .GetFromJsonAsync<RecordView>($"/v1/people/{Guid.NewGuid()}/record?side=shipper", Json);

        Assert.Equal(0, record!.Reviews);
        Assert.Equal(4, record.Tallies.Count);
    }

    // --- helpers -----------------------------------------------------------

    /// <summary>A delivered trip, its shipper, its driver, and the carrier being reviewed.</summary>
    private async Task<(Guid About, Guid Trip, HttpClient Shipper, HttpClient Driver)> ReviewableAsync()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var driver = await Identities.IssueAsync(factory, Role.Driver);

        var trip = Guid.NewGuid();
        var start = DateTimeOffset.UtcNow.AddHours(-20);

        var client = shipper.Carrying(factory.CreateClient());

        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverId = driver.UserId,
                carrierId = carrier.UserId,
                shipperId = shipper.UserId,
                origin = "Lagos",
                destination = "Kano",
                at = start,
                actor = "shipper",
            });
        opened.EnsureSuccessStatusCode();

        var driverClient = driver.Carrying(factory.CreateClient());

        foreach (var (state, minutes) in new[]
                 {
                     ("assigned", 1), ("loading", 2), ("in_transit", 3),
                     ("arrived", 600), ("delivered", 620),
                 })
        {
            var response = await driverClient.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = start.AddMinutes(minutes), actor = "driver" });
            response.EnsureSuccessStatusCode();
        }

        return (carrier.UserId, trip, client, driverClient);
    }

    private static async Task DeliverAsync(HttpClient driver, Guid trip, bool seal)
    {
        var draft = await driver.PutAsJsonAsync(
            $"/v1/trips/{trip}/delivery",
            new
            {
                at = DateTimeOffset.UtcNow.AddHours(-1),
                photoIds = new[] { "p0", "p1" },
                signatureName = "Ibrahim Sani",
                signatureRole = "storekeeper",
                signatureImageId = "s1",
                note = string.Empty,
            });
        draft.EnsureSuccessStatusCode();

        if (!seal) return;

        var sealed_ = await driver.PostAsync($"/v1/trips/{trip}/delivery/seal", null);
        sealed_.EnsureSuccessStatusCode();
    }

    private static object Answers(bool arrived = true) => new
    {
        answers = new Dictionary<string, bool>
        {
            ["arrived_to_load"] = arrived,
            ["reachable"] = true,
            ["cargo_intact"] = true,
            ["no_extras"] = true,
        },
        note = string.Empty,
    };

    private sealed record RecordView(int Reviews, List<TallyView> Tallies);

    private sealed record TallyView(string Claim, string Label, int Yes, int Asked, bool WorthShowing);
}
