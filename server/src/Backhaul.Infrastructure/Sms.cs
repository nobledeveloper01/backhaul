using Microsoft.Extensions.Logging;

namespace Backhaul.Infrastructure;

/// <summary>Sends a text message.</summary>
/// <remarks>
/// <para>
/// A seam, not an implementation. Nigerian SMS goes through a gateway —
/// Termii, Africa's Talking, or a bank-grade aggregator — and which one is a
/// commercial decision with a contract behind it, not a technical one.
/// </para>
/// <para>
/// <b>Nothing in this repository sends a real message.</b> The default writes
/// the code to the log, which is right for a development store and would be a
/// serious hole against real users: anyone who can read the logs can sign in
/// as anybody. <c>Program.cs</c> refuses to start with the logging sender when
/// a real database is configured, so this cannot ship by being forgotten.
/// </para>
/// </remarks>
public interface ISmsSender
{
    Task SendAsync(string phone, string message, CancellationToken ct = default);
}

/// <summary>Writes the message to the log. Development only.</summary>
public sealed class LoggingSmsSender(ILogger<LoggingSmsSender> logger) : ISmsSender
{
    public Task SendAsync(string phone, string message, CancellationToken ct = default)
    {
        // Warning, not information: this line is a credential in a log file,
        // and it should look like one to anybody scanning the output.
        logger.LogWarning("SMS (not sent — no gateway configured) to {Phone}: {Message}", phone, message);
        return Task.CompletedTask;
    }
}
