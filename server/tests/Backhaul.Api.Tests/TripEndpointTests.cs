using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Backhaul.Api.Tests;

public sealed class TripEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_trip_opens_and_reports_where_it_may_go_next()
    {
        // Sent so a client renders the actions the machine actually permits
        // rather than its own idea of them.
        var trip = await OpenAsync();
        var view = await GetAsync(trip);

        Assert.Equal("open", view.State);
        Assert.False(view.Tracking);
        Assert.Equal(["assigned", "cancelled"], view.AllowedNext);
    }

    [Fact]
    public async Task The_same_id_cannot_be_opened_twice()
    {
        var trip = await OpenAsync();

        var again = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new { at = T0, actor = "shipper" });

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task An_illegal_transition_is_refused_in_the_machines_own_words()
    {
        var trip = await OpenAsync();

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state = "delivered", at = T0.AddHours(1), actor = "driver" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);

        var refusal = (await response.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("not_allowed", refusal.Refusal);
        Assert.Equal("A trip cannot go from 'open' to 'delivered'.", refusal.Message);
    }

    [Fact]
    public async Task A_back_dated_event_is_refused()
    {
        // The one hard refusal: accepting it corrupts every duration derived
        // from the history, and those durations end up on an invoice.
        var trip = await OpenAsync();
        await AppendAsync(trip, "assigned", T0.AddHours(1));

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state = "loading", at = T0.AddMinutes(30), actor = "driver" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var refusal = (await response.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("out_of_order", refusal.Refusal);
    }

    [Fact]
    public async Task Two_events_at_the_same_instant_are_allowed()
    {
        // A phone with a coarse clock is not a corrupted history, and refusing
        // this would strand real trips.
        var trip = await OpenAsync();
        await AppendAsync(trip, "assigned", T0.AddHours(1));

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state = "loading", at = T0.AddHours(1), actor = "driver" });

        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task A_finished_trip_cannot_change_again()
    {
        var trip = await OpenAsync();
        await AppendAsync(trip, "assigned", T0.AddMinutes(10));
        await AppendAsync(trip, "cancelled", T0.AddMinutes(20));

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state = "loading", at = T0.AddMinutes(30), actor = "driver" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var refusal = (await response.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("terminal", refusal.Refusal);
    }

    [Fact]
    public async Task The_history_keeps_every_event_in_order()
    {
        // Append-only, and the order is the sequence it was appended in — not
        // the timestamp, which is not a total order.
        var trip = await OpenAsync();
        await AppendAsync(trip, "assigned", T0.AddMinutes(30));
        await AppendAsync(trip, "loading", T0.AddMinutes(60));
        await AppendAsync(trip, "in_transit", T0.AddMinutes(60));

        var view = await GetAsync(trip);

        Assert.Equal(
            ["open", "assigned", "loading", "in_transit"],
            view.History.Select(e => e.State));
        Assert.True(view.Tracking);
    }

    [Fact]
    public async Task Timestamps_come_back_in_the_same_spelling_the_client_sends()
    {
        // `Z`, three fractional digits — what JavaScript's toISOString gives.
        // .NET's default renders UTC as `+00:00`, which is the same instant in
        // a different spelling, and two spellings across one API is a trap.
        var trip = await OpenAsync();
        var response = await client.GetAsync($"/v1/trips/{trip}");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Contains("2026-03-04T06:00:00.000Z", body, StringComparison.Ordinal);
        Assert.DoesNotContain("+00:00", body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unknown_trip_is_a_404_not_an_empty_trip()
    {
        var response = await client.GetAsync($"/v1/trips/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<Guid> OpenAsync()
    {
        var id = Guid.NewGuid();
        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{id}",
            new { at = T0, actor = "shipper" });
        response.EnsureSuccessStatusCode();
        return id;
    }

    private async Task AppendAsync(Guid trip, string state, DateTimeOffset at)
    {
        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/events",
            new { state, at, actor = "driver" });
        response.EnsureSuccessStatusCode();
    }

    private async Task<TripView> GetAsync(Guid trip)
    {
        var response = await client.GetAsync($"/v1/trips/{trip}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<TripView>(Json))!;
    }

    private sealed record RefusalView(string Message, string Refusal);

    private sealed record TripView(
        Guid Id,
        string State,
        bool Tracking,
        List<string> AllowedNext,
        List<EventView> History);

    private sealed record EventView(string State, DateTimeOffset At, string Actor, string? Note);
}
