using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// What a carrier's punctuality record is counted from.
/// </summary>
/// <remarks>
/// <para>
/// This used to be <c>onTime = completed</c>: every carrier at a hundred per
/// cent, because the promised arrival did not exist in the schema. It walked a
/// carrier up the trust ladder on document count alone and made the reliability
/// term in the bid ranking the same number for every bidder, which is the same
/// as having no term.
/// </para>
/// <para>
/// The rule now: a delivered trip counts towards punctuality only if it had a
/// promised arrival <em>and</em> a sealed delivery. Missing either, it is
/// unjudged — not late, not on time, and in neither half of the fraction.
/// </para>
/// </remarks>
public sealed class PunctualityEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 6, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_delivered_trip_with_no_promised_arrival_counts_neither_way()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());

        await DeliverAsync(client, driver.Phone, promised: null, sealedAt: T0.AddHours(20));

        var seen = await client.GetFromJsonAsync<VerificationView>("/v1/me/verification", Json);

        // The delivery happened, and nobody promised anything about when.
        Assert.Equal(1, seen!.TripsCompleted);
        Assert.Equal(0, seen.TripsPromised);
        Assert.Equal(0, seen.TripsOnTime);
        // No rate at all, rather than a flattering one.
        Assert.Null(seen.OnTimeRate);
    }

    [Fact]
    public async Task A_trip_delivered_after_the_promise_is_counted_late()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());

        // Promised by the 7th at 06:00, sealed eight hours after it.
        await DeliverAsync(client, driver.Phone, promised: T0.AddDays(1), sealedAt: T0.AddDays(1).AddHours(8));

        var seen = await client.GetFromJsonAsync<VerificationView>("/v1/me/verification", Json);

        Assert.Equal(1, seen!.TripsPromised);
        Assert.Equal(0, seen.TripsOnTime);
    }

    [Fact]
    public async Task And_one_delivered_by_it_is_counted_kept()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());

        await DeliverAsync(client, driver.Phone, promised: T0.AddDays(1), sealedAt: T0.AddHours(20));

        var seen = await client.GetFromJsonAsync<VerificationView>("/v1/me/verification", Json);

        Assert.Equal(1, seen!.TripsPromised);
        Assert.Equal(1, seen.TripsOnTime);
        // Still no rate: one kept promise is not a record, and the figure a
        // shipper decides on is not printed from one delivery.
        Assert.Null(seen.OnTimeRate);
    }

    [Fact]
    public async Task A_delivery_date_before_the_trip_was_agreed_is_refused()
    {
        // Not a deadline. A carrier's record is built from these, and this one
        // would enter it as a trip they were always going to miss.
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());
        var trip = await OpenAsync(client, driver.Phone);

        var response = await PutTermsAsync(client, trip, deliverBy: T0.AddHours(-1));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    /// <summary>A trip taken all the way to a sealed delivery.</summary>
    private async Task DeliverAsync(
        HttpClient client,
        string driverPhone,
        DateTimeOffset? promised,
        DateTimeOffset sealedAt)
    {
        var trip = await OpenAsync(client, driverPhone);
        (await PutTermsAsync(client, trip, promised)).EnsureSuccessStatusCode();

        foreach (var state in new[] { "assigned", "loading", "in_transit", "arrived", "delivered" })
        {
            var moved = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = T0, actor = "driver" });
            moved.EnsureSuccessStatusCode();
        }

        var put = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/delivery",
            new
            {
                at = sealedAt,
                photoIds = new[] { "p1", "p2" },
                signatureName = "Ibrahim Sani",
                signatureRole = "storekeeper",
                signatureImageId = "s1",
                capturedLat = 12.0022,
                capturedLon = 8.5919,
                capturedAccuracy = 14.0,
                note = "",
            });
        put.EnsureSuccessStatusCode();

        var done = await client.PostAsync($"/v1/trips/{trip}/delivery/seal", null);
        done.EnsureSuccessStatusCode();
    }

    private async Task<Guid> OpenAsync(HttpClient client, string driverPhone)
    {
        var trip = Guid.NewGuid();
        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                // The driver's own number in the carrier slot: an
                // owner-operator, which is most of this market.
                carrierPhone = driverPhone,
                shipperPhone = Identities.NextPhone(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        response.EnsureSuccessStatusCode();
        return trip;
    }

    /// <summary>Only the fields these tests read.</summary>
    private sealed record VerificationView(
        string Tier,
        int TripsCompleted,
        int TripsPromised,
        int TripsOnTime,
        double? OnTimeRate);

    private static Task<HttpResponseMessage> PutTermsAsync(
        HttpClient client,
        Guid trip,
        DateTimeOffset? deliverBy) =>
        client.PutAsJsonAsync(
            $"/v1/trips/{trip}/terms",
            new
            {
                truck = "trailer_30t",
                agreedKobo = 224_000_000L,
                acceptedAt = T0,
                distanceM = 830_000.0,
                driverPayKobo = 18_000_000L,
                driverAdvanceKobo = 8_000_000L,
                driverPaidAt = (DateTimeOffset?)null,
                deliverBy,
            });
}
