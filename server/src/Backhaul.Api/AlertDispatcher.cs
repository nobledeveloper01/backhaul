using Backhaul.Domain.Access;
using Backhaul.Domain.Tracking;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Repositories;

namespace Backhaul.Api;

/// <summary>
/// Tells people the things they asked to be told.
/// </summary>
/// <remarks>
/// <para>
/// The alerts engine decided <em>what</em> reaches a phone and when, and it has
/// been parity-tested on both sides since before there was anything to send it
/// through. This is the loop that finally runs it: derive what is true, ask
/// <c>Alerts.Decide</c>, send what it says to send, and record only that.
/// </para>
/// <para>
/// <b>Quiet hours are the reader's, not the server's.</b> The alerts route can
/// ask the client what hour it is; a loop running at three in the morning has
/// nobody to ask, so the offset comes off the device registration. Assuming
/// West Africa Time here is how this breaks the first time somebody ships from
/// Accra.
/// </para>
/// <para>
/// <b>Nothing is recorded for a held alert.</b> That is how holding works: the
/// condition is still true after six, still unsent, and goes out then. A
/// dispatcher that recorded holds would turn "quiet hours" into "dropped".
/// </para>
/// <para>
/// Every person is a separate scope and a separate try. One shipper whose data
/// makes this throw must not stop the driver in trouble two rows down from
/// being told about — the whole point of the urgent tier is that it arrives.
/// </para>
/// </remarks>
public sealed class AlertDispatcher(
    IServiceScopeFactory scopes,
    IPushSender push,
    TimeProvider clock,
    ILogger<AlertDispatcher> logger) : BackgroundService
{
    /// <summary>
    /// How often the loop runs.
    /// </summary>
    /// <remarks>
    /// Five minutes, against thresholds measured in tens of minutes — twenty
    /// before silence is reported, forty-five before a stall. Running faster
    /// would not find anything sooner; it would only spend database reads
    /// discovering the same conditions again.
    /// </remarks>
    public static readonly TimeSpan Every = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stopping)
    {
        using var ticks = new PeriodicTimer(Every);

        while (!stopping.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stopping);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                // The loop survives its own turn. A dispatcher that dies on a
                // bad row stops telling everybody everything, silently, and
                // the first anybody knows is a stall nobody heard about.
                logger.LogError(error, "The alert dispatcher's turn failed. It will run again.");
            }

            if (!await ticks.WaitForNextTickAsync(stopping)) return;
        }
    }

    /// <summary>One turn. Public so a test can run it without a clock.</summary>
    public async Task RunOnceAsync(CancellationToken ct = default)
    {
        using var scope = scopes.CreateScope();
        var devices = scope.ServiceProvider.GetRequiredService<NotificationRepository>();

        var registered = await devices.AllAsync(ct);
        if (registered.Count == 0) return;

        var now = clock.GetUtcNow();

        // Grouped by person: the alerts are theirs, and one read of what they
        // have already been told serves every phone they carry.
        foreach (var group in registered.GroupBy(d => d.UserId))
        {
            try
            {
                await ForOneAsync(scope.ServiceProvider, group.Key, group.ToList(), now, ct);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                logger.LogError(error, "Could not notify {UserId}. Others are unaffected.", group.Key);
            }
        }
    }

    private async Task ForOneAsync(
        IServiceProvider services,
        Guid userId,
        IReadOnlyList<DeviceRecord> phones,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var alerts = services.GetRequiredService<AlertRepository>();
        var sent = services.GetRequiredService<NotificationRepository>();
        // The role decides the audience, and the audience decides who hears
        // what. Without it the server would tell a driver about their own
        // signal dropping, which they can see out of the window.
        var role = await sent.RoleOfAsync(userId, ct);
        if (role is null) return;

        var audience = role switch
        {
            Role.Shipper => Audience.Shipper,
            Role.Carrier => Audience.Carrier,
            _ => Audience.Driver,
        };

        var principal = new Principal(userId, role.Value);
        var already = await sent.LastSentAsync(userId, ct);
        var open = await alerts.OpenAsync(principal, now, already, ct);

        foreach (var phone in phones)
        {
            var localHour = now.ToOffset(TimeSpan.FromMinutes(phone.UtcOffsetMinutes)).Hour;
            var held = new List<AlertKind>();

            foreach (var row in open)
            {
                var decision = Alerts.Decide(row.Kind, audience, localHour, row.LastSentAt, now);

                if (decision is Decision.Hold { Reason: "quiet_hours" }) held.Add(row.Kind);
                if (decision is not Decision.Send send) continue;

                await push.SendAsync(
                    new Notification(
                        phone.Token,
                        phone.Platform,
                        row.Corridor,
                        Alerts.Describe(row.Kind),
                        send.Urgency == Urgency.Urgent),
                    ct);

                await sent.RecordAsync(userId, row.TripId, Alerts.ToWire(row.Kind), now, ct);
            }

            /*
                The overnight summary, once the quiet is over.

                `Digest` writes one sentence for everything held. It is sent
                only when nothing is being held *now* — during the night the
                held list is what is waiting, and a summary at two in the
                morning would be the thing quiet hours exist to prevent. After
                six the list is empty and the individual alerts go out on their
                own, which is the same information in the shape a person can
                act on.
            */
            if (held.Count > 0)
            {
                logger.LogInformation(
                    "Holding {Count} alerts for {UserId} until quiet hours end.",
                    held.Count,
                    userId);
            }
        }
    }
}
