using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>Verification, the trucks, and a driver in trouble.</summary>
public sealed class IdentityEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_new_carrier_is_unverified_and_says_what_is_missing()
    {
        var client = await AsCarrierAsync();

        var view = await client.GetFromJsonAsync<VerificationView>("/v1/me/verification", Json);

        Assert.Equal("unverified", view!.Tier);
        Assert.False(view.HasIdentity);
        // No on-time figure from no trips. "100% on time" from one delivery is
        // true and completely misleading.
        Assert.Null(view.OnTimeRate);
    }

    [Fact]
    public async Task Saying_you_hold_a_paper_earns_nothing()
    {
        // The whole of ADR-0017. This used to assert "verified" — a carrier
        // could award themselves a badge in two calls, and the ladder read it
        // as evidence. The claim is recorded and shown back, because they need
        // to see their upload was not lost. It buys no rung.
        var client = await AsCarrierAsync();

        await client.PutAsJsonAsync("/v1/me/verification/identity", new { held = true });
        var after = await client.PutAsJsonAsync("/v1/me/verification/licence", new { held = true });

        var view = (await after.Content.ReadFromJsonAsync<VerificationView>(Json))!;
        Assert.Equal("unverified", view.Tier);
        Assert.True(view.HasIdentity);
        Assert.True(view.HasLicence);
        Assert.False(view.VerifiedIdentity);
        Assert.False(view.VerifiedLicence);
    }

    [Fact]
    public async Task A_reviewer_confirming_them_earns_verified_with_no_trips_at_all()
    {
        // No trips required, or nobody can ever start: a first trip would need
        // a tier and a tier would need trips. What is required is that
        // somebody looked.
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        await client.PutAsJsonAsync("/v1/me/verification/identity", new { held = true });
        await client.PutAsJsonAsync("/v1/me/verification/licence", new { held = true });

        var reviewer = await Identities.IssueAsync(factory, Role.Reviewer);
        var desk = reviewer.Carrying(factory.CreateClient());

        foreach (var paper in new[] { "identity", "licence" })
        {
            var confirmed = await desk.PutAsJsonAsync(
                $"/v1/verification/{carrier.UserId}/{paper}",
                new { held = true });
            Assert.Equal(HttpStatusCode.NoContent, confirmed.StatusCode);
        }

        var view = await client.GetFromJsonAsync<VerificationView>("/v1/me/verification", Json);
        Assert.Equal("verified", view!.Tier);
        Assert.True(view.VerifiedIdentity);
    }

    [Fact]
    public async Task A_carrier_cannot_review_themselves()
    {
        // 404, not 403. The shape of the answer must not tell a caller that a
        // route they may not use exists. See ADR-0008.
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());

        await client.PutAsJsonAsync("/v1/me/verification/identity", new { held = true });

        var response = await client.PutAsJsonAsync(
            $"/v1/verification/{carrier.UserId}/identity",
            new { held = true });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var view = await client.GetFromJsonAsync<VerificationView>("/v1/me/verification", Json);
        Assert.False(view!.VerifiedIdentity);
    }

    [Fact]
    public async Task A_reviewer_cannot_confirm_a_paper_nobody_claimed()
    {
        // Confirming an upload that does not exist is a reviewer inventing
        // evidence rather than reading it.
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var reviewer = await Identities.IssueAsync(factory, Role.Reviewer);

        var response = await reviewer.Carrying(factory.CreateClient()).PutAsJsonAsync(
            $"/v1/verification/{carrier.UserId}/insurance",
            new { held = true });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Withdrawing_a_claim_withdraws_the_review_with_it()
    {
        // A paper nobody says they hold cannot be a paper somebody checked.
        // Otherwise a carrier keeps a rung earned on a licence they have
        // since told us they do not have.
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());
        var reviewer = await Identities.IssueAsync(factory, Role.Reviewer);
        var desk = reviewer.Carrying(factory.CreateClient());

        await client.PutAsJsonAsync("/v1/me/verification/identity", new { held = true });
        await client.PutAsJsonAsync("/v1/me/verification/licence", new { held = true });
        await desk.PutAsJsonAsync($"/v1/verification/{carrier.UserId}/identity", new { held = true });
        await desk.PutAsJsonAsync($"/v1/verification/{carrier.UserId}/licence", new { held = true });

        var withdrawn = await client.PutAsJsonAsync(
            "/v1/me/verification/licence",
            new { held = false });

        var view = (await withdrawn.Content.ReadFromJsonAsync<VerificationView>(Json))!;
        Assert.Equal("unverified", view.Tier);
        Assert.False(view.VerifiedLicence);
    }

    [Fact]
    public async Task An_unknown_paper_is_refused_rather_than_silently_ignored()
    {
        var client = await AsCarrierAsync();

        var response = await client.PutAsJsonAsync(
            "/v1/me/verification/passport",
            new { held = true });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // --- vehicles ----------------------------------------------------------

    [Fact]
    public async Task A_truck_with_every_paper_in_date_may_carry()
    {
        var client = await AsCarrierAsync();

        var saved = await PutVehicleAsync(client, "LSR-482-XA", 200, 150, 120, 300);
        var view = (await saved.Content.ReadFromJsonAsync<VehicleView>(Json))!;

        Assert.Equal("road_legal", view.Standing);
        Assert.True(view.MayCarry);
    }

    [Fact]
    public async Task A_truck_whose_certificate_expires_next_month_still_may()
    {
        // Refusing work on a valid certificate takes a truck off the road for
        // being *about* to have a problem.
        var client = await AsCarrierAsync();

        var saved = await PutVehicleAsync(client, "RVS-119-KJ", 200, 150, 18, 300);
        var view = (await saved.Content.ReadFromJsonAsync<VehicleView>(Json))!;

        Assert.Equal("expiring", view.Standing);
        Assert.True(view.MayCarry);
    }

    [Fact]
    public async Task A_lapsed_certificate_stops_the_next_trip()
    {
        var client = await AsCarrierAsync();

        var saved = await PutVehicleAsync(client, "KJA-771-BR", 200, -9, 120, 300);
        var view = (await saved.Content.ReadFromJsonAsync<VehicleView>(Json))!;

        Assert.Equal("lapsed", view.Standing);
        Assert.False(view.MayCarry);
        // Which paper and which side of zero. The exact day count is asserted
        // against fixed clocks in the domain tests and the parity fixtures —
        // pinning it here would only test how long the request took.
        Assert.Contains(view.Lapsed, p => p.Paper == "roadworthiness" && p.Days < 0);
    }

    [Fact]
    public async Task A_paper_never_uploaded_is_missing_rather_than_expired()
    {
        // A missing paper means the truck was never offered for work; a lapsed
        // one means it is working on something that stopped being true.
        var client = await AsCarrierAsync();

        var saved = await PutVehicleAsync(client, "ABC-004-LA", 200, 150, 120, null);
        var view = (await saved.Content.ReadFromJsonAsync<VehicleView>(Json))!;

        Assert.Equal("incomplete", view.Standing);
        Assert.Contains("permit", view.Missing);
    }

    [Fact]
    public async Task The_fleet_lists_the_worst_truck_first()
    {
        // A list sorted by plate is one nobody scrolls to the bottom of, and
        // the truck at the bottom is the one with the lapsed certificate.
        var client = await AsCarrierAsync();

        await PutVehicleAsync(client, "AAA-111-AA", 200, 150, 120, 300);
        await PutVehicleAsync(client, "ZZZ-999-ZZ", 200, -5, 120, 300);
        await PutVehicleAsync(client, "MMM-555-MM", 200, 150, 3, 300);

        var fleet = await client.GetFromJsonAsync<List<VehicleView>>("/v1/me/vehicles", Json);

        Assert.Equal(["ZZZ-999-ZZ", "MMM-555-MM", "AAA-111-AA"], fleet!.Select(v => v.Plate));
    }

    [Fact]
    public async Task One_carrier_never_sees_another_fleet()
    {
        var mine = await AsCarrierAsync();
        await PutVehicleAsync(mine, "LSR-482-XA", 200, 150, 120, 300);

        var theirs = await AsCarrierAsync();
        var fleet = await theirs.GetFromJsonAsync<List<VehicleView>>("/v1/me/vehicles", Json);

        Assert.Empty(fleet!);
    }

    // --- duress ------------------------------------------------------------

    [Fact]
    public async Task Raising_an_alarm_answers_with_nothing_at_all()
    {
        // Whoever is standing over the driver must not be able to tell it
        // happened, and a response body is a thing a screen can render.
        var (trip, driver) = await OpenAsync();

        var response = await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/duress",
            new { trigger = "hidden_press", lat = 10.52, lon = 7.44, batteryFraction = 0.31 });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task The_carrier_can_see_it_and_clear_it()
    {
        var (trip, driver) = await OpenAsync();

        await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/duress",
            new { trigger = "hidden_press", lat = 10.52, lon = 7.44 });

        var open = await driver.GetFromJsonAsync<List<DuressView>>(
            $"/v1/trips/{trip}/duress", Json);
        var alarm = Assert.Single(open!);

        var cleared = await driver.PostAsync($"/v1/trips/{trip}/duress/{alarm.Id}/clear", null);
        Assert.Equal(HttpStatusCode.NoContent, cleared.StatusCode);

        var after = await driver.GetFromJsonAsync<List<DuressView>>(
            $"/v1/trips/{trip}/duress", Json);
        Assert.Empty(after!);
    }

    [Fact]
    public async Task Time_alone_never_clears_an_alarm()
    {
        // A truck that went quiet an hour after the alarm is the case that
        // most needs to stay open. Nothing here has a timer, and this test is
        // what would fail if somebody added one.
        var (trip, driver) = await OpenAsync();

        await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/duress",
            new { trigger = "hardware" });

        var open = await driver.GetFromJsonAsync<List<DuressView>>(
            $"/v1/trips/{trip}/duress", Json);

        Assert.Single(open!);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<HttpClient> AsCarrierAsync()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        return carrier.Carrying(factory.CreateClient());
    }

    private async Task<(Guid Trip, HttpClient Driver)> OpenAsync()
    {
        var driver = await Identities.IssueAsync(factory, Role.Driver);
        var client = driver.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverPhone = driver.Phone,
                carrierPhone = Identities.NextPhone(),
                shipperPhone = Identities.NextPhone(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        response.EnsureSuccessStatusCode();

        return (trip, client);
    }

    private static Task<HttpResponseMessage> PutVehicleAsync(
        HttpClient client,
        string plate,
        int licence,
        int roadworthiness,
        int insurance,
        int? permit) =>
        client.PutAsJsonAsync(
            "/v1/me/vehicles",
            new
            {
                plate,
                truck = "trailer_30t",
                licenceExpires = DateTimeOffset.UtcNow.AddDays(licence),
                roadworthinessExpires = DateTimeOffset.UtcNow.AddDays(roadworthiness),
                insuranceExpires = DateTimeOffset.UtcNow.AddDays(insurance),
                permitExpires = permit is null
                    ? (DateTimeOffset?)null
                    : DateTimeOffset.UtcNow.AddDays(permit.Value),
            });

    private sealed record VerificationView(
        string Tier,
        bool HasIdentity,
        bool HasLicence,
        bool VerifiedIdentity,
        bool VerifiedLicence,
        double? OnTimeRate);

    private sealed record VehicleView(
        Guid Id,
        string Plate,
        string Standing,
        bool MayCarry,
        List<PaperDaysView> Lapsed,
        List<PaperDaysView> Expiring,
        List<string> Missing);

    private sealed record PaperDaysView(string Paper, int Days);

    private sealed record DuressView(Guid Id, string Trigger, DateTimeOffset At);
}
