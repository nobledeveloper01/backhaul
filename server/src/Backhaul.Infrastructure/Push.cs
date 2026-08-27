using Microsoft.Extensions.Logging;

namespace Backhaul.Infrastructure;

/// <summary>One notification, ready to go out.</summary>
/// <param name="Token">The device it is for.</param>
/// <param name="Platform">ios or android.</param>
/// <param name="Title">The corridor, usually. What it is about.</param>
/// <param name="Body">Plain words. Never a state name with an underscore in it.</param>
/// <param name="Urgent">
/// Whether it may wake somebody. Exactly one kind is — a driver in trouble —
/// and the seam carries the distinction because APNs and FCM both need it set
/// at send time, not decided by the phone.
/// </param>
public sealed record Notification(
    string Token,
    string Platform,
    string Title,
    string Body,
    bool Urgent);

/// <summary>Sends a push notification.</summary>
/// <remarks>
/// <para>
/// A seam, not an implementation — the same shape as <see cref="ISmsSender"/>
/// and for the same reason. APNs wants a signed JWT and a p8 key from an Apple
/// developer account; FCM wants a service-account JSON. Both are credentials
/// somebody has to obtain, and neither is a technical decision.
/// </para>
/// <para>
/// <b>Nothing in this repository sends a real notification.</b> The default
/// writes it to the log. Unlike the SMS sender that is not a security hole — a
/// notification is not a credential — so this one does not stop the server
/// booting against a real database. It does say so on every send, because a
/// deployment that believes it is notifying shippers and is not is worse than
/// one that never claimed to.
/// </para>
/// </remarks>
public interface IPushSender
{
    Task SendAsync(Notification notification, CancellationToken ct = default);
}

/// <summary>Writes the notification to the log. Development only.</summary>
public sealed class LoggingPushSender(ILogger<LoggingPushSender> logger) : IPushSender
{
    public Task SendAsync(Notification notification, CancellationToken ct = default)
    {
        logger.LogWarning(
            "PUSH (not sent — no gateway configured) to {Platform} {Token}: {Title} — {Body}",
            notification.Platform,
            notification.Token[..Math.Min(8, notification.Token.Length)],
            notification.Title,
            notification.Body);
        return Task.CompletedTask;
    }
}
