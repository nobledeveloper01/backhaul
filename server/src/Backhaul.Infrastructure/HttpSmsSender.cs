using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Backhaul.Infrastructure;

/// <summary>
/// Sends a message through a gateway we run ourselves.
/// </summary>
/// <remarks>
/// <para>
/// <b>What this removes and what it does not.</b> Running an open-source
/// gateway removes the *aggregator contract* — no per-message billing account,
/// no commercial negotiation before a pilot can send its first code. It does
/// not remove the *delivery path*: an SMS still has to leave a SIM. That SIM
/// lives either in a spare Android handset running
/// <a href="https://github.com/capcom6/android-sms-gateway">android-sms-gateway</a>,
/// or in a USB GSM modem behind Gammu or Kannel. Anybody who reads "free SMS
/// gateway" as "free SMS" will be surprised by their airtime bill, so it is
/// written here rather than in a wiki.
/// </para>
/// <para>
/// For the pilot this is the right shape: one Android phone with a Nigerian
/// SIM and a bundle sends every sign-in code for a few hundred users, on a
/// local number that recipients recognise — which matters more here than it
/// sounds, because an unfamiliar shortcode reads as a scam.
/// </para>
/// <para>
/// <b>The request is configured, not hard-coded.</b> The defaults follow
/// android-sms-gateway's documented local API, but every gateway spells this
/// differently and none of them is worth a code change: the URL, the auth, and
/// the two field names all come from configuration. A gateway that wants
/// <c>to</c> and <c>text</c> instead of <c>phoneNumbers</c> and
/// <c>message</c> is a config edit.
/// </para>
/// <para>
/// <b>Not verified against a live gateway from this repository.</b> There is
/// no SIM in CI and there is no way to fake one honestly. What is tested is
/// the shape of the request this builds and what it does when the gateway
/// refuses.
/// </para>
/// </remarks>
public sealed class HttpSmsSender(
    HttpClient http,
    IConfiguration configuration,
    ILogger<HttpSmsSender> logger) : ISmsSender
{
    public async Task SendAsync(string phone, string message, CancellationToken ct = default)
    {
        var url = configuration["Sms:Url"];
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException(
                "Sms:Provider is set to 'http' but Sms:Url is empty. The gateway has " +
                "nowhere to send to.");
        }

        // The two field names the gateway expects. Named in configuration so a
        // different gateway is a config edit rather than a deploy.
        var phoneField = configuration["Sms:PhoneField"] ?? "phoneNumbers";
        var messageField = configuration["Sms:MessageField"] ?? "message";

        // A list, because the gateways that take one take a list of one, and
        // the ones that take a bare string are the minority. `Sms:PhoneAsList`
        // switches it for those.
        var asList = configuration.GetValue("Sms:PhoneAsList", true);

        var body = new Dictionary<string, object>
        {
            [phoneField] = asList ? new[] { phone } : phone,
            [messageField] = message,
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body),
        };

        var username = configuration["Sms:Username"];
        var password = configuration["Sms:Password"];
        if (!string.IsNullOrWhiteSpace(username))
        {
            var credentials = Convert.ToBase64String(
                Encoding.UTF8.GetBytes($"{username}:{password}"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        }

        var token = configuration["Sms:BearerToken"];
        if (!string.IsNullOrWhiteSpace(token))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        var response = await http.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync(ct);

            // Logged without the message body. It contains a sign-in code, and
            // a failed send is exactly the moment somebody goes looking
            // through logs.
            logger.LogError(
                "SMS gateway refused a message to {Phone}: {Status} {Detail}",
                phone,
                (int)response.StatusCode,
                detail);

            throw new HttpRequestException(
                $"The SMS gateway answered {(int)response.StatusCode}.");
        }

        logger.LogInformation("SMS handed to the gateway for {Phone}", phone);
    }
}
