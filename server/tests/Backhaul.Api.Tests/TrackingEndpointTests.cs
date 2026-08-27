using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

public sealed class TrackingEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// A driver, and a trip they are on.
    /// </summary>
    /// <remarks>
    /// These are tests of the ingest path's contract — durability,
    /// idempotency, what a track reports — not of who may call it. That is
    /// `AuthorisationTests`.
    /// </remarks>
    private async Task<(HttpClient Client, Guid Trip)> OnATripAsync()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());

        var trip = Guid.NewGuid();
        var response = await client.PostAsJsonAsync(
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
        response.EnsureSuccessStatusCode();
        return (client, trip);
    }

    [Fact]
    public async Task A_trip_that_is_not_under_way_does_not_record_positions()
    {
        // There is no off-trip tracking, and the server enforces it rather
        // than trusting the client. A modified app must not be able to build a
        // position history for a truck that is not on a job.
        var (client, trip) = await OnATripAsync();

        var response = await PostBatchAsync(client, trip, Guid.NewGuid(), [Sample(6.455, 3.3841, 5)]);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Positions_for_an_unknown_trip_are_refused()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var response = await PostBatchAsync(
            driver.Carrying(factory.CreateClient()),
            Guid.NewGuid(),
            Guid.NewGuid(),
            [Sample(6.455, 3.3841, 5)]);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_replayed_batch_returns_the_original_outcome_and_does_not_write_twice()
    {
        // A device that never received its acknowledgement retries. If the
        // retry wrote again, a trip's distance would grow every time the
        // network flapped.
        var (client, trip) = await OnATripAsync();
        await DriveAsync(client, trip);

        var batchId = Guid.NewGuid();
        var samples = new[] { Sample(6.455, 3.3841, 5), Sample(6.46, 3.39, 65) };

        var first = await ReadBatchAsync(await PostBatchAsync(client, trip, batchId, samples));
        var second = await ReadBatchAsync(await PostBatchAsync(client, trip, batchId, samples));

        Assert.False(first.Replayed);
        Assert.Equal(2, first.Accepted);

        Assert.True(second.Replayed);
        Assert.Equal(first.Accepted, second.Accepted);

        var track = await ReadTrackAsync(client, trip);
        Assert.Equal(2, track.Kept);
    }

    [Fact]
    public async Task A_sample_already_held_counts_as_duplicate_not_an_error()
    {
        var (client, trip) = await OnATripAsync();
        await DriveAsync(client, trip);

        var shared = Sample(6.455, 3.3841, 5);
        await PostBatchAsync(client, trip, Guid.NewGuid(), [shared]);

        var second = await ReadBatchAsync(
            await PostBatchAsync(client, trip, Guid.NewGuid(), [shared, Sample(6.46, 3.39, 65)]));

        Assert.Equal(1, second.Accepted);
        Assert.Equal(1, second.Duplicate);
        Assert.False(second.Replayed);
    }

    [Fact]
    public async Task A_batch_repeating_an_id_within_itself_does_not_take_the_upload_with_it()
    {
        // A duplicate inside one batch would otherwise violate the primary key
        // and fail the whole upload — losing every good sample beside it.
        var (client, trip) = await OnATripAsync();
        await DriveAsync(client, trip);

        var repeated = Sample(6.455, 3.3841, 5);
        var outcome = await ReadBatchAsync(
            await PostBatchAsync(client, trip, Guid.NewGuid(), [repeated, repeated, Sample(6.46, 3.39, 65)]));

        Assert.Equal(2, outcome.Accepted);
        Assert.Equal(1, outcome.Duplicate);
    }

    [Fact]
    public async Task A_track_reports_what_it_discarded_alongside_the_distance()
    {
        // A distance computed from a fraction of the fixes is not wrong, but
        // nobody should be shown it without knowing that.
        var (client, trip) = await OnATripAsync();
        await DriveAsync(client, trip);

        await PostBatchAsync(client, trip, Guid.NewGuid(), [
            Sample(6.4550, 3.3841, 5),
            Sample(6.9000, 3.9000, 125),
            Sample(12.0022, 8.5920, 126), // Kano, one minute later: a tower fix
        ]);

        var track = await ReadTrackAsync(client, trip);

        Assert.Equal(2, track.Kept);
        Assert.Equal(1, track.Dropped);
        Assert.Equal(2d / 3d, track.Quality, 6);
        Assert.True(track.DistanceMetres > 0);
    }

    [Fact]
    public async Task A_batch_over_the_limit_is_rejected_by_validation()
    {
        var (client, trip) = await OnATripAsync();
        await DriveAsync(client, trip);

        var tooMany = Enumerable.Range(0, 201)
            .Select(i => Sample(6.455 + (i * 0.0001), 3.3841, 5 + i))
            .ToArray();

        var response = await PostBatchAsync(client, trip, Guid.NewGuid(), tooMany);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    private static object Sample(double lat, double lon, int minutes) => new
    {
        id = Guid.NewGuid(),
        lat,
        lon,
        accuracy = 10.0,
        at = T0.AddMinutes(minutes),
    };

    /// <summary>Walks a trip to <c>in_transit</c>, which is where it records.</summary>
    private static async Task DriveAsync(HttpClient client, Guid trip)
    {
        foreach (var (state, minutes) in new[]
                 {
                     ("assigned", 1), ("loading", 2), ("in_transit", 3),
                 })
        {
            var response = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = T0.AddMinutes(minutes), actor = "driver" });
            response.EnsureSuccessStatusCode();
        }
    }

    private static Task<HttpResponseMessage> PostBatchAsync(
        HttpClient client,
        Guid trip,
        Guid batchId,
        object[] samples) =>
        client.PostAsJsonAsync("/v1/tracking/batch", new { batchId, tripId = trip, samples });

    private static async Task<BatchOutcome> ReadBatchAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<BatchOutcome>(Json))!;
    }

    private static async Task<TrackView> ReadTrackAsync(HttpClient client, Guid trip)
    {
        var response = await client.GetAsync($"/v1/tracking/trip/{trip}/track");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TrackView>(Json))!;
    }

    private sealed record BatchOutcome(Guid BatchId, int Accepted, int Duplicate, bool Replayed);

    private sealed record TrackView(
        int Kept,
        int Dropped,
        double Quality,
        long DistanceMetres,
        string Observation,
        long? SilentForMs);
}
