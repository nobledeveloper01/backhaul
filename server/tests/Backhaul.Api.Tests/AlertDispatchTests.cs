using System.Net.Http.Json;

using Backhaul.Api;
using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Repositories;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Backhaul.Api.Tests;

/// <summary>
/// The loop that finally sends the alerts.
/// </summary>
/// <remarks>
/// <c>alerts.ts</c> decided what reaches a phone and when, and was parity-tested
/// on both sides, long before there was anything to send one through. These are
/// about the loop honouring it: not saying the same thing twice, holding rather
/// than dropping inside quiet hours, and never telling somebody about a trip
/// that is not theirs.
/// </remarks>
public sealed class AlertDispatchTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 6, 12, 0, 0, TimeSpan.Zero);

    /// <summary>A push sender that keeps what it was asked to send.</summary>
    private sealed class Spy : IPushSender
    {
        public List<Notification> Sent { get; } = [];

        public Task SendAsync(Notification notification, CancellationToken ct = default)
        {
            Sent.Add(notification);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task Nothing_is_sent_twice_inside_the_repeat_window()
    {
        var (spy, dispatcher, scopes, shipper) = await ArrangeAsync(localHour: 12, state: "signal_lost");

        await dispatcher.RunOnceAsync();
        var first = spy.Sent.Count;
        Assert.True(first > 0, "the condition is true, so something should have gone out");

        // The same run again, against the same unchanged conditions. Every one
        // of them is inside its own `repeatAfterMs`, so nothing goes out — a
        // shipper on a northern corridor told about the same coverage gap every
        // five minutes stops reading the alert that matters.
        await dispatcher.RunOnceAsync();
        Assert.Equal(first, spy.Sent.Count);

        // And what did go out was recorded, which is what makes that true.
        using var scope = scopes.CreateScope();
        var devices = scope.ServiceProvider.GetRequiredService<NotificationRepository>();
        var already = await devices.LastSentAsync(shipper);
        Assert.NotEmpty(already);
    }

    [Fact]
    public async Task A_phone_in_the_middle_of_the_night_is_held_rather_than_woken()
    {
        // Quiet hours are the reader's. The server's clock says midday; this
        // phone is thirteen hours ahead, so it is one in the morning where the
        // person actually is. Nothing that is merely a push may go out.
        // A *stalled* truck, not a silent one. `signal_lost` is a quiet alert
        // and quiet alerts are deliberately not held — they were never going
        // to wake anybody. `stalled` is a push, and a push at one in the
        // morning is the thing quiet hours exist for.
        var (spy, dispatcher, scopes, shipper) = await ArrangeAsync(localHour: 1, state: "stalled");

        await dispatcher.RunOnceAsync();

        Assert.DoesNotContain(spy.Sent, n => !n.Urgent);

        // Held, not dropped: nothing was recorded, so the condition is still
        // unsent when the morning comes.
        using var scope = scopes.CreateScope();
        var devices = scope.ServiceProvider.GetRequiredService<NotificationRepository>();
        var already = await devices.LastSentAsync(shipper);
        Assert.DoesNotContain(already, row => row.Key.Kind == "stalled");
    }

    [Fact]
    public async Task A_device_belonging_to_nobody_on_the_trip_hears_nothing()
    {
        var (spy, dispatcher, _, _) = await ArrangeAsync(localHour: 12, state: "signal_lost");

        // A stranger's phone, registered and with no trips of their own. The
        // alert repository is principal-filtered like every other read, so
        // there is nothing for them — and this is the test that would fail if
        // the dispatcher ever looped over trips instead of over people.
        var stranger = await Identities.IssueAsync(factory, Role.Shipper);
        var client = stranger.Carrying(factory.CreateClient());
        var registered = await client.PutAsJsonAsync(
            "/v1/me/devices",
            new { token = "stranger-token", platform = "android", utcOffsetMinutes = 60 });
        registered.EnsureSuccessStatusCode();

        spy.Sent.Clear();
        await dispatcher.RunOnceAsync();

        Assert.DoesNotContain(spy.Sent, n => n.Token == "stranger-token");
    }

    // --- helpers -----------------------------------------------------------

    /// <summary>A shipper with a silent truck, and a phone registered to hear about it.</summary>
    /// <param name="state">
    /// The condition to put the trip in. Which one matters: `signal_lost` is a
    /// quiet alert and `stalled` is a push, and only a push is ever held.
    /// </param>
    /// <param name="localHour">
    /// What time it should be where the phone is.
    ///
    /// The offset is derived from the server's own clock rather than written
    /// down, because the server's clock here is the real one — and an offset
    /// of +60 puts the phone in quiet hours or out of them depending on what
    /// time the suite happens to run. It failed that way on the first run, at
    /// half past eleven at night.
    /// </param>
    private async Task<(Spy Push, AlertDispatcher Dispatcher, IServiceScopeFactory Scopes, Guid Shipper)>
        ArrangeAsync(int localHour, string state)
    {
        var clock = factory.Services.GetRequiredService<TimeProvider>();

        // Wrapped into the band a real offset lives in (−12:00 to +14:00),
        // which is what the route accepts. Without the wrap the arithmetic
        // produces −22 hours at eleven at night and the registration is
        // refused — correctly, because that is not a place.
        var hours = ((localHour - clock.GetUtcNow().Hour) % 24 + 24) % 24;
        var offsetMinutes = (hours > 14 ? hours - 24 : hours) * 60;
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());

        var trip = Guid.NewGuid();
        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverId = Guid.NewGuid(),
                carrierId = Guid.NewGuid(),
                shipperId = shipper.UserId,
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        opened.EnsureSuccessStatusCode();

        foreach (var step in new[] { "assigned", "loading", "in_transit", state })
        {
            var moved = await client.PostAsJsonAsync(
                $"/v1/trips/{trip}/events",
                new { state = step, at = T0, actor = "system" });
            moved.EnsureSuccessStatusCode();
        }

        var registered = await client.PutAsJsonAsync(
            "/v1/me/devices",
            new { token = $"token-{shipper.UserId}", platform = "android", utcOffsetMinutes = offsetMinutes });
        registered.EnsureSuccessStatusCode();

        var spy = new Spy();
        var scopes = factory.Services.GetRequiredService<IServiceScopeFactory>();

        var dispatcher = new AlertDispatcher(
            scopes,
            spy,
            clock,
            factory.Services.GetRequiredService<ILogger<AlertDispatcher>>());

        return (spy, dispatcher, scopes, shipper.UserId);
    }
}
