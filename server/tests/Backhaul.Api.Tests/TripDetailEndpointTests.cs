using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// The three things that hang off a trip: its thread, its incidents and its
/// route.
/// </summary>
public sealed class TripDetailEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    // --- messages ----------------------------------------------------------

    [Fact]
    public async Task A_message_is_recorded_with_both_times()
    {
        // One is what the driver believes and the other is what can be proved.
        // A dispute needs to tell them apart.
        var (trip, client) = await OpenAsync();

        var written = T0.AddHours(3);
        var posted = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/messages",
            new
            {
                id = Guid.NewGuid(),
                from = "shipper",
                body = "Loaded and sealed.",
                at = written,
            });

        posted.EnsureSuccessStatusCode();
        var message = (await posted.Content.ReadFromJsonAsync<MessageView>(Json))!;

        Assert.Equal(written, message.At);
        Assert.NotEqual(written, message.ReceivedAt);
    }

    [Fact]
    public async Task The_same_message_twice_is_one_message()
    {
        // A driver who wrote in a dead zone and retried must not end up with
        // two copies in a thread a dispute is read from.
        var (trip, client) = await OpenAsync();
        var id = Guid.NewGuid();

        var body = new { id, from = "driver", body = "At the weighbridge.", at = T0 };
        await client.PostAsJsonAsync($"/v1/trips/{trip}/messages", body);
        await client.PostAsJsonAsync($"/v1/trips/{trip}/messages", body);

        var thread = await client.GetFromJsonAsync<List<MessageView>>(
            $"/v1/trips/{trip}/messages", Json);

        Assert.Single(thread!);
    }

    [Fact]
    public async Task The_thread_reads_in_the_order_the_conversation_happened()
    {
        // Sorting by arrival puts a dead-zone message after the reply to it.
        var (trip, client) = await OpenAsync();

        // Posted newest-first, written oldest-first.
        await PostMessageAsync(client, trip, "later", T0.AddHours(5));
        await PostMessageAsync(client, trip, "earlier", T0.AddHours(1));

        var thread = await client.GetFromJsonAsync<List<MessageView>>(
            $"/v1/trips/{trip}/messages", Json);

        Assert.Equal(["earlier", "later"], thread!.Select(m => m.Body));
    }

    [Fact]
    public async Task Somebody_not_on_the_trip_can_neither_read_nor_write_it()
    {
        var (trip, client) = await OpenAsync();
        await PostMessageAsync(client, trip, "private", T0);

        var stranger = (await Identities.IssueAsync(factory, Role.Shipper))
            .Carrying(factory.CreateClient());

        var read = await stranger.GetFromJsonAsync<List<MessageView>>(
            $"/v1/trips/{trip}/messages", Json);
        Assert.Empty(read!);

        var write = await stranger.PostAsJsonAsync(
            $"/v1/trips/{trip}/messages",
            new { id = Guid.NewGuid(), from = "shipper", body = "hello", at = T0 });

        // 404 rather than 403: the existence of a trip id is itself
        // information.
        Assert.Equal(HttpStatusCode.NotFound, write.StatusCode);
    }

    [Fact]
    public async Task An_empty_message_is_refused()
    {
        var (trip, client) = await OpenAsync();

        var posted = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/messages",
            new { id = Guid.NewGuid(), from = "driver", body = "   ", at = T0 });

        Assert.Equal(HttpStatusCode.BadRequest, posted.StatusCode);
    }

    // --- incidents ---------------------------------------------------------

    [Fact]
    public async Task An_incident_takes_the_kinds_own_severity_when_none_is_given()
    {
        // A driver at a roadside should not have to classify their own
        // emergency, and the default is the domain's — shared with the app.
        var (trip, client) = await OpenAsync();

        var posted = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new { kind = "breakdown", at = T0, reportedBy = "driver", note = "Near Jebba" });

        posted.EnsureSuccessStatusCode();
        var incident = (await posted.Content.ReadFromJsonAsync<IncidentView>(Json))!;

        Assert.Equal("blocking", incident.Severity);
        Assert.False(incident.RaisesDispute);
    }

    [Fact]
    public async Task A_cargo_report_raises_a_dispute_and_a_breakdown_does_not()
    {
        // Raising every breakdown would make "disputed" mean "something
        // happened" rather than "the two sides disagree".
        var (trip, client) = await OpenAsync();

        var posted = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new
            {
                kind = "cargo",
                at = T0,
                reportedBy = "driver",
                note = "Two bags short",
                photoIds = new[] { "p1" },
            });

        posted.EnsureSuccessStatusCode();
        var incident = (await posted.Content.ReadFromJsonAsync<IncidentView>(Json))!;

        Assert.True(incident.RaisesDispute);
    }

    [Fact]
    public async Task A_cargo_report_without_a_photograph_is_refused()
    {
        // One person's word is what the product exists to replace.
        var (trip, client) = await OpenAsync();

        var posted = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new { kind = "cargo", at = T0, reportedBy = "driver", note = "Short" });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, posted.StatusCode);
    }

    [Fact]
    public async Task A_security_report_never_needs_one()
    {
        // Nobody photographs a hijack. Demanding it would mean the report that
        // matters most is the one that cannot be filed.
        var (trip, client) = await OpenAsync();

        var posted = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new { kind = "security", at = T0, reportedBy = "driver", note = "" });

        posted.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Resolving_twice_keeps_the_first_time()
    {
        // When something stopped being a problem is a fact somebody may rely
        // on.
        var (trip, client) = await OpenAsync();

        var posted = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/incidents",
            new { kind = "detained", at = T0, reportedBy = "driver", note = "Queue" });
        var incident = (await posted.Content.ReadFromJsonAsync<IncidentView>(Json))!;

        await client.PostAsync($"/v1/trips/{trip}/incidents/{incident.Id}/resolve", null);
        var first = await ResolvedAtAsync(client, trip, incident.Id);

        await client.PostAsync($"/v1/trips/{trip}/incidents/{incident.Id}/resolve", null);
        var second = await ResolvedAtAsync(client, trip, incident.Id);

        Assert.NotNull(first);
        Assert.Equal(first, second);
    }

    // --- waypoints ---------------------------------------------------------

    [Fact]
    public async Task A_route_is_replaced_rather_than_appended_to()
    {
        // A route is a plan, and plans change. What is evidence is where the
        // truck went, and that lives in the position table.
        var (trip, client) = await OpenAsync();

        await PutRouteAsync(client, trip, ["Apapa depot", "Weighbridge"]);
        await PutRouteAsync(client, trip, ["Apapa depot"]);

        var route = await client.GetFromJsonAsync<WaypointsView>(
            $"/v1/trips/{trip}/waypoints", Json);

        Assert.Single(route!.Waypoints);
    }

    [Fact]
    public async Task Visits_are_computed_from_the_track_rather_than_stored()
    {
        // Recomputing means a corrected fix corrects the demurrage with it.
        var (trip, client) = await OpenAsync();
        await DriveAsync(client, trip);
        await PutRouteAsync(client, trip, ["Apapa depot"]);

        // Two hours parked at the depot, then away.
        var samples = new List<object>();
        for (var minute = 0; minute <= 120; minute += 15)
        {
            samples.Add(Sample(6.45, 3.36, T0.AddMinutes(minute)));
        }
        samples.Add(Sample(7.5, 4.0, T0.AddMinutes(240)));

        await client.PostAsJsonAsync(
            "/v1/tracking/batch",
            new { batchId = Guid.NewGuid(), tripId = trip, samples });

        var route = await client.GetFromJsonAsync<WaypointsView>(
            $"/v1/trips/{trip}/waypoints", Json);

        var visit = Assert.Single(route!.Visits);

        // Measured to the first fix *outside*, not the last one inside: the
        // truck was still there for part of the gap, and a demurrage claim
        // should not lose that to a rounding.
        Assert.Equal(TimeSpan.FromMinutes(240).TotalMilliseconds, visit.DurationMs);
        Assert.Equal(visit.DurationMs, route.ChargeableWaitingMs);
    }

    [Fact]
    public async Task A_checkpoint_queue_is_nobody_bill()
    {
        var (trip, client) = await OpenAsync();
        await DriveAsync(client, trip);

        await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/waypoints",
            new[]
            {
                new
                {
                    name = "Weighbridge",
                    kind = "checkpoint",
                    lat = 6.45,
                    lon = 3.36,
                    radiusM = 300.0,
                },
            });

        var samples = new List<object>();
        for (var minute = 0; minute <= 120; minute += 15)
        {
            samples.Add(Sample(6.45, 3.36, T0.AddMinutes(minute)));
        }
        samples.Add(Sample(7.5, 4.0, T0.AddMinutes(240)));

        await client.PostAsJsonAsync(
            "/v1/tracking/batch",
            new { batchId = Guid.NewGuid(), tripId = trip, samples });

        var route = await client.GetFromJsonAsync<WaypointsView>(
            $"/v1/trips/{trip}/waypoints", Json);

        Assert.Single(route!.Visits);
        Assert.Equal(0, route.ChargeableWaitingMs);
    }

    [Fact]
    public async Task A_fence_smaller_than_a_fix_is_wrong_is_refused()
    {
        var (trip, client) = await OpenAsync();

        var response = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/waypoints",
            new[]
            {
                new { name = "Gate", kind = "origin", lat = 6.45, lon = 3.36, radiusM = 20.0 },
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
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

    /// <summary>
    /// Walks the trip to `in_transit`.
    /// </summary>
    /// <remarks>
    /// The ingest endpoint refuses positions for a trip that is not tracking —
    /// there is no off-trip tracking and the server enforces it rather than
    /// trusting the client. Any test that sends positions has to get the trip
    /// moving first, and forgetting to reads as "the visits engine is broken".
    /// </remarks>
    private static async Task DriveAsync(HttpClient client, Guid trip)
    {
        foreach (var (state, minutes) in new[] { ("assigned", 1), ("loading", 2), ("in_transit", 3) })
        {
            var response = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state, at = T0.AddMinutes(minutes), actor = "driver" });
            response.EnsureSuccessStatusCode();
        }
    }

    private static async Task PostMessageAsync(
        HttpClient client,
        Guid trip,
        string body,
        DateTimeOffset at)
    {
        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/messages",
            new { id = Guid.NewGuid(), from = "driver", body, at });
        response.EnsureSuccessStatusCode();
    }

    private static async Task PutRouteAsync(HttpClient client, Guid trip, string[] names)
    {
        var response = await client.PutAsJsonAsync(
            $"/v1/trips/{trip}/waypoints",
            names.Select(name => new
            {
                name,
                kind = "origin",
                lat = 6.45,
                lon = 3.36,
                radiusM = 300.0,
            }));
        response.EnsureSuccessStatusCode();
    }

    private static object Sample(double lat, double lon, DateTimeOffset at) => new
    {
        id = Guid.NewGuid(),
        lat,
        lon,
        accuracy = 10.0,
        at,
    };

    private static async Task<DateTimeOffset?> ResolvedAtAsync(
        HttpClient client,
        Guid trip,
        Guid incident)
    {
        var all = await client.GetFromJsonAsync<List<IncidentView>>(
            $"/v1/trips/{trip}/incidents", Json);
        return all!.Single(i => i.Id == incident).ResolvedAt;
    }

    private sealed record MessageView(
        Guid Id,
        string From,
        string Body,
        DateTimeOffset At,
        DateTimeOffset ReceivedAt,
        List<string> ReadBy);

    private sealed record IncidentView(
        Guid Id,
        string Kind,
        string Severity,
        DateTimeOffset At,
        bool RaisesDispute,
        DateTimeOffset? ResolvedAt);

    private sealed record WaypointsView(
        List<WaypointView> Waypoints,
        List<VisitView> Visits,
        long ChargeableWaitingMs);

    private sealed record WaypointView(Guid Id, string Name, string Kind, int Sequence);

    private sealed record VisitView(
        Guid WaypointId,
        string Name,
        DateTimeOffset Arrived,
        DateTimeOffset? Left,
        long DurationMs,
        int Fixes);
}
