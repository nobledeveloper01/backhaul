using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// Who hears about what, and how loudly.
/// </summary>
/// <remarks>
/// The policy table is held by <c>ParityTests</c>. What is tested here is that
/// the conditions are read from the same evidence the trip screens read rather
/// than from a stored copy, and that quiet hours hold a push rather than
/// dropping it.
/// </remarks>
public sealed class AlertEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task An_hour_outside_the_day_is_refused_rather_than_assumed()
    {
        // The local hour is the caller's, not the server's. Guessing it is how
        // this breaks the first time somebody ships from Accra.
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);

        var response = await shipper.Carrying(factory.CreateClient())
            .GetAsync("/v1/me/alerts?localHour=25");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_unresolved_incident_is_open_however_old_it_is()
    {
        // That is what unresolved means. A system that closed its own would
        // close the one nobody dealt with.
        var (trip, shipper, driver) = await TripAsync();

        var raised = await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new
            {
                kind = "breakdown",
                at = DateTimeOffset.UtcNow.AddDays(-30),
                note = "Gearbox",
                reportedBy = "driver",
                photoIds = new[] { "p0" },
            });
        raised.EnsureSuccessStatusCode();

        var view = await shipper.GetFromJsonAsync<AlertsView>("/v1/me/alerts?localHour=12", Json);

        var alert = Assert.Single(view!.Alerts, a => a.TripId == trip && a.Kind == "incident");
        Assert.Equal("push", alert.Urgency);
        Assert.True(alert.WouldSend);
        Assert.Equal("a problem reported", alert.Describe);
    }

    [Fact]
    public async Task A_push_inside_quiet_hours_is_held_and_summarised_rather_than_dropped()
    {
        // The condition is still true in the morning, and dropping it silently
        // is how a shipper finds out about a stall at noon.
        var (trip, shipper, driver) = await TripAsync();

        var raised = await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new
            {
                kind = "breakdown",
                at = DateTimeOffset.UtcNow.AddHours(-1),
                note = "Gearbox",
                reportedBy = "driver",
                photoIds = new[] { "p0" },
            });
        raised.EnsureSuccessStatusCode();

        var view = await shipper.GetFromJsonAsync<AlertsView>("/v1/me/alerts?localHour=23", Json);

        var alert = Assert.Single(view!.Alerts, a => a.TripId == trip && a.Kind == "incident");
        Assert.False(alert.WouldSend);
        Assert.Equal("quiet_hours", alert.HeldBecause);

        Assert.NotNull(view.Digest);
        Assert.StartsWith("Overnight:", view.Digest, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_driver_is_not_told_their_own_signal_dropped()
    {
        // Telling a driver their signal dropped is telling them what they can
        // already see out of the window. It is not "held" either — it was
        // never for them, so it does not belong in their overnight summary.
        var (trip, _, driver) = await TripAsync();

        var lost = await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state = "signal_lost", at = DateTimeOffset.UtcNow.AddMinutes(-30), actor = "system" });
        lost.EnsureSuccessStatusCode();

        var view = await driver.GetFromJsonAsync<AlertsView>("/v1/me/alerts?localHour=12", Json);

        Assert.DoesNotContain(view!.Alerts, a => a.Kind == "signal_lost");
    }

    [Fact]
    public async Task A_duress_alarm_is_the_only_thing_that_overrides_quiet_hours()
    {
        // If everything is urgent, nothing is.
        var (trip, shipper, driver) = await TripAsync();

        var pressed = await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/duress",
            new { trigger = "hidden_press", at = DateTimeOffset.UtcNow.AddMinutes(-5) });
        pressed.EnsureSuccessStatusCode();

        var view = await shipper.GetFromJsonAsync<AlertsView>("/v1/me/alerts?localHour=2", Json);

        var alert = Assert.Single(view!.Alerts, a => a.Kind == "duress");
        Assert.Equal("urgent", alert.Urgency);
        Assert.True(alert.WouldSend);

        // And it sorts above everything else.
        Assert.Equal("duress", view.Alerts[0].Kind);
    }

    [Fact]
    public async Task Somebody_elses_trip_never_appears()
    {
        var (trip, _, driver) = await TripAsync();

        var lost = await driver.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state = "signal_lost", at = DateTimeOffset.UtcNow.AddMinutes(-30), actor = "system" });
        lost.EnsureSuccessStatusCode();

        var stranger = await Identities.IssueAsync(factory, Role.Shipper);
        var view = await stranger.Carrying(factory.CreateClient())
            .GetFromJsonAsync<AlertsView>("/v1/me/alerts?localHour=12", Json);

        Assert.DoesNotContain(view!.Alerts, a => a.TripId == trip);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Trip, HttpClient Shipper, HttpClient Driver)> TripAsync()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var driver = await Identities.IssueAsync(factory, Role.Driver);

        var trip = Guid.NewGuid();
        var start = DateTimeOffset.UtcNow.AddHours(-6);
        var client = shipper.Carrying(factory.CreateClient());

        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverPhone = driver.Phone,
                carrierPhone = Identities.NextPhone(),
                shipperPhone = shipper.Phone,
                origin = "Lagos",
                destination = "Kano",
                at = start,
                actor = "shipper",
            });
        opened.EnsureSuccessStatusCode();

        var driverClient = driver.Carrying(factory.CreateClient());

        foreach (var (state, minutes) in new[] { ("assigned", 1), ("loading", 2), ("in_transit", 3) })
        {
            var response = await driverClient.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = start.AddMinutes(minutes), actor = "driver" });
            response.EnsureSuccessStatusCode();
        }

        return (trip, client, driverClient);
    }

    private sealed record AlertsView(List<AlertView> Alerts, string? Digest);

    private sealed record AlertView(
        string Kind,
        Guid TripId,
        string Corridor,
        string Describe,
        string Urgency,
        bool WouldSend,
        string? HeldBecause);
}
