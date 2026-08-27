using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>The handover, what is on the truck, and what the road took.</summary>
public sealed class DeliveryEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 6, 14, 20, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_delivery_cannot_be_sealed_on_one_photograph()
    {
        // One photograph of a pallet could have been taken anywhere. The
        // refusal is the domain's own sentence, so the driver reads the same
        // words the app would have shown them.
        var (trip, client) = await OpenAsync();

        await PutAsync(client, trip, photos: 1, name: "Ibrahim Sani");
        var sealed_ = await client.PostAsync($"/v1/trips/{trip}/delivery/seal", null);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, sealed_.StatusCode);
        var refusal = (await sealed_.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("no_photos", refusal.Refusal);
        Assert.Contains("1 more photo", refusal.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Nor_without_a_name_on_the_signature()
    {
        var (trip, client) = await OpenAsync();

        await PutAsync(client, trip, photos: 2, name: "   ");
        var sealed_ = await client.PostAsync($"/v1/trips/{trip}/delivery/seal", null);

        var refusal = (await sealed_.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("no_name", refusal.Refusal);
    }

    [Fact]
    public async Task Two_photographs_a_signature_and_a_name_are_enough()
    {
        var (trip, client) = await OpenAsync();

        await PutAsync(client, trip, photos: 2, name: "Ibrahim Sani");
        var sealed_ = await client.PostAsync($"/v1/trips/{trip}/delivery/seal", null);

        sealed_.EnsureSuccessStatusCode();
        var delivery = (await sealed_.Content.ReadFromJsonAsync<DeliveryView>(Json))!;
        Assert.NotNull(delivery.SealedAt);
    }

    [Fact]
    public async Task A_sealed_delivery_cannot_be_changed()
    {
        // Before the seal it is a draft a driver is filling in at a gate;
        // after it, it is evidence.
        var (trip, client) = await OpenAsync();

        await PutAsync(client, trip, photos: 2, name: "Ibrahim Sani");
        await client.PostAsync($"/v1/trips/{trip}/delivery/seal", null);

        var again = await PutRawAsync(client, trip, photos: 3, name: "Somebody Else");

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task A_short_delivery_still_settles_and_a_refusal_does_not()
    {
        // Holding the whole payment until a quantity dispute resolves punishes
        // a carrier for a discrepancy that is usually the loading end's.
        var (trip, client) = await OpenAsync();

        var short_ = await PutRawAsync(client, trip, 2, "Ibrahim Sani", "short", 2);
        short_.EnsureSuccessStatusCode();
        var withShort = (await short_.Content.ReadFromJsonAsync<DeliveryView>(Json))!;
        Assert.True(withShort.Settles);

        var refused = await PutRawAsync(client, trip, 2, "Ibrahim Sani", "refused", null);
        var withRefusal = (await refused.Content.ReadFromJsonAsync<DeliveryView>(Json))!;
        Assert.False(withRefusal.Settles);
    }

    [Fact]
    public async Task A_capture_far_from_the_destination_is_flagged_and_not_refused()
    {
        // A market address in Kano is a district, not a gate. A driver who
        // cannot close a delivery they actually made stops using the app.
        var (trip, client) = await OpenAsync();

        await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/waypoints",
            new[]
            {
                new
                {
                    name = "Dawanau market",
                    kind = "destination",
                    lat = 12.0,
                    lon = 8.52,
                    radiusM = 300.0,
                },
            });

        // 11 km out.
        var response = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/delivery",
            new
            {
                at = T0,
                photoIds = new[] { "p1", "p2" },
                signatureName = "Ibrahim Sani",
                signatureRole = "storekeeper",
                signatureImageId = "s1",
                capturedLat = 12.1,
                capturedLon = 8.52,
                capturedAccuracy = 14.0,
                note = "",
            });

        response.EnsureSuccessStatusCode();
        var delivery = (await response.Content.ReadFromJsonAsync<DeliveryView>(Json))!;

        Assert.True(delivery.CapturedNearM > 10_000);
        Assert.True(delivery.CanSeal);
    }

    // --- drops -------------------------------------------------------------

    [Fact]
    public async Task Extra_stops_add_to_the_fare_and_the_first_one_does_not()
    {
        var (trip, client) = await OpenAsync();

        await PutDropsAsync(client, trip, 1);
        var one = await client.GetFromJsonAsync<DropsView>($"/v1/trips/{trip}/drops", Json);
        Assert.Equal(0, one!.DropFeeKobo);

        await PutDropsAsync(client, trip, 3);
        var three = await client.GetFromJsonAsync<DropsView>($"/v1/trips/{trip}/drops", Json);
        Assert.Equal(2 * 2_500_000, three!.DropFeeKobo);
    }

    [Fact]
    public async Task The_trip_closes_on_the_last_signature_not_on_the_last_address()
    {
        var (trip, client) = await OpenAsync();
        await PutDropsAsync(client, trip, 2);

        var drops = await client.GetFromJsonAsync<DropsView>($"/v1/trips/{trip}/drops", Json);
        Assert.False(drops!.Complete);

        foreach (var drop in drops.Drops)
        {
            var signed = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/drops/{drop.Id}/sign",
                new { at = T0 });
            signed.EnsureSuccessStatusCode();
        }

        var after = await client.GetFromJsonAsync<DropsView>($"/v1/trips/{trip}/drops", Json);
        Assert.True(after!.Complete);
        Assert.Equal(0, after.WeightAboardKg);
    }

    [Fact]
    public async Task A_drop_signed_out_of_order_is_recorded_rather_than_refused()
    {
        // A consignee who was closed is a real thing, and a driver who comes
        // back tomorrow is doing the sensible thing.
        var (trip, client) = await OpenAsync();
        await PutDropsAsync(client, trip, 3);

        var drops = await client.GetFromJsonAsync<DropsView>($"/v1/trips/{trip}/drops", Json);
        var second = drops!.Drops[1];

        var signed = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/drops/{second.Id}/sign",
            new { at = T0 });
        signed.EnsureSuccessStatusCode();

        var after = await client.GetFromJsonAsync<DropsView>($"/v1/trips/{trip}/drops", Json);
        Assert.Contains(second.Id, after!.OutOfOrder);
    }

    [Fact]
    public async Task Drops_cannot_be_reordered_once_one_has_been_signed_for()
    {
        // Reordering a trailer that is half unloaded is not a plan change.
        var (trip, client) = await OpenAsync();
        await PutDropsAsync(client, trip, 2);

        var drops = await client.GetFromJsonAsync<DropsView>($"/v1/trips/{trip}/drops", Json);
        await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/drops/{drops!.Drops[0].Id}/sign",
            new { at = T0 });

        var again = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/drops",
            Enumerable.Range(0, 3).Select(i => new
            {
                consignee = $"C{i}",
                goods = "Rice",
                units = 100,
                weightKg = 5_000.0,
            }));

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    // --- levies ------------------------------------------------------------

    [Fact]
    public async Task The_ledger_goes_negative_when_a_driver_is_out_of_pocket()
    {
        // The common case on a long run, and the number they actually care
        // about. Flooring it at zero would hide exactly that.
        var (trip, client) = await OpenAsync();

        foreach (var naira in new[] { 12_000, 8_000, 31_000 })
        {
            var posted = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/levies",
                new
                {
                    id = Guid.NewGuid(),
                    kind = "police",
                    amountKobo = naira * 100L,
                    at = T0,
                    note = "",
                });
            posted.EnsureSuccessStatusCode();
        }

        var ledger = await client.GetFromJsonAsync<LeviesView>(
            $"/v1/trips/{trip}/levies?advanceKobo={20_000 * 100}", Json);

        Assert.Equal(51_000 * 100L, ledger!.TotalKobo);
        Assert.True(ledger.BalanceKobo < 0);
    }

    [Fact]
    public async Task The_same_payment_twice_is_one_payment()
    {
        // A driver retrying from a checkpoint with no signal must not pay
        // twice on paper.
        var (trip, client) = await OpenAsync();
        var id = Guid.NewGuid();

        var body = new { id, kind = "union", amountKobo = 500_000L, at = T0, note = "" };
        await client.PostAsJsonAsync($"/v1/trips/{trip}/levies", body);
        await client.PostAsJsonAsync($"/v1/trips/{trip}/levies", body);

        var ledger = await client.GetFromJsonAsync<LeviesView>(
            $"/v1/trips/{trip}/levies?advanceKobo=0", Json);

        Assert.Single(ledger!.Levies);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Trip, HttpClient Client)> OpenAsync()
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

        return (trip, client);
    }

    private static async Task PutAsync(HttpClient client, Guid trip, int photos, string name)
    {
        var response = await PutRawAsync(client, trip, photos, name);
        response.EnsureSuccessStatusCode();
    }

    private static Task<HttpResponseMessage> PutRawAsync(
        HttpClient client,
        Guid trip,
        int photos,
        string name,
        string? exceptionKind = null,
        int? quantity = null) =>
        client.PutAsJsonAsync(
            $"/v1/trips/{trip}/delivery",
            new
            {
                at = T0,
                photoIds = Enumerable.Range(0, photos).Select(i => $"p{i}").ToArray(),
                signatureName = name,
                signatureRole = "storekeeper",
                signatureImageId = "s1",
                note = string.Empty,
                exceptionKind,
                exceptionQuantity = quantity,
            });

    private static async Task PutDropsAsync(HttpClient client, Guid trip, int count)
    {
        var response = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/drops",
            Enumerable.Range(0, count).Select(i => new
            {
                consignee = $"Consignee {i}",
                goods = "Cement",
                units = 100,
                weightKg = 5_000.0,
            }));
        response.EnsureSuccessStatusCode();
    }

    private sealed record DeliveryView(
        DateTimeOffset? SealedAt,
        bool CanSeal,
        string? Missing,
        long? CapturedNearM,
        bool Settles);

    private sealed record DropsView(
        List<DropView> Drops,
        double WeightAboardKg,
        long DropFeeKobo,
        bool Complete,
        List<Guid> OutOfOrder);

    private sealed record DropView(Guid Id, string Consignee, int Sequence);

    private sealed record LeviesView(List<LevyView> Levies, long TotalKobo, long BalanceKobo);

    private sealed record LevyView(Guid Id, string Kind, long AmountKobo);

    private sealed record RefusalView(string Refusal, string Message);
}
