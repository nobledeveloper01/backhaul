using System.Net;
using System.Text.Json;

using Backhaul.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Backhaul.Api.Tests;

/// <summary>
/// What the gateway sender puts on the wire.
/// </summary>
/// <remarks>
/// There is no SIM in CI and no honest way to fake one, so nothing here proves
/// a message arrives. What it proves is the shape of the request — which is
/// the part that differs between gateways and the part a config edit is
/// supposed to fix — and what happens when the gateway says no.
/// </remarks>
public sealed class SmsSenderTests
{
    [Fact]
    public async Task It_posts_the_number_and_the_message_where_it_is_told_to()
    {
        var (sender, seen) = Build(new Dictionary<string, string?>
        {
            ["Sms:Url"] = "http://sms.local/message",
        });

        await sender.SendAsync("+2348031234567", "418293 is your Backhaul code.");

        Assert.NotNull(seen.Request);
        Assert.Equal("http://sms.local/message", seen.Request!.RequestUri!.ToString());

        var body = JsonDocument.Parse(seen.Body!).RootElement;

        // The defaults follow android-sms-gateway's documented local API.
        Assert.Equal(
            "+2348031234567",
            body.GetProperty("phoneNumbers")[0].GetString());
        Assert.Equal("418293 is your Backhaul code.", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task A_gateway_that_spells_it_differently_is_a_config_edit()
    {
        // Every gateway names these two fields differently and none of them is
        // worth a code change.
        var (sender, seen) = Build(new Dictionary<string, string?>
        {
            ["Sms:Url"] = "http://sms.local/send",
            ["Sms:PhoneField"] = "to",
            ["Sms:MessageField"] = "text",
            ["Sms:PhoneAsList"] = "false",
        });

        await sender.SendAsync("+2348031234567", "hello");

        var body = JsonDocument.Parse(seen.Body!).RootElement;
        Assert.Equal("+2348031234567", body.GetProperty("to").GetString());
        Assert.Equal("hello", body.GetProperty("text").GetString());
    }

    [Fact]
    public async Task It_carries_basic_auth_when_a_username_is_configured()
    {
        var (sender, seen) = Build(new Dictionary<string, string?>
        {
            ["Sms:Url"] = "http://sms.local/message",
            ["Sms:Username"] = "backhaul",
            ["Sms:Password"] = "secret",
        });

        await sender.SendAsync("+2348031234567", "hello");

        Assert.Equal("Basic", seen.Request!.Headers.Authorization!.Scheme);
    }

    [Fact]
    public async Task A_gateway_with_no_url_configured_says_so_rather_than_failing_quietly()
    {
        var (sender, _) = Build([]);

        var failure = await Assert.ThrowsAsync<InvalidOperationException>(
            () => sender.SendAsync("+2348031234567", "hello"));

        Assert.Contains("Sms:Url", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_refused_message_throws_rather_than_pretending_to_have_sent()
    {
        // The sign-in endpoint has to be able to tell. A sender that swallowed
        // this would leave somebody waiting for a code that was never sent.
        var (sender, _) = Build(
            new Dictionary<string, string?> { ["Sms:Url"] = "http://sms.local/message" },
            HttpStatusCode.BadGateway);

        await Assert.ThrowsAsync<HttpRequestException>(
            () => sender.SendAsync("+2348031234567", "hello"));
    }

    private static (HttpSmsSender Sender, Seen Seen) Build(
        Dictionary<string, string?> settings,
        HttpStatusCode status = HttpStatusCode.OK)
    {
        var seen = new Seen();
        var http = new HttpClient(new CapturingHandler(seen, status));

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(settings)
            .Build();

        return (new HttpSmsSender(http, configuration, NullLogger<HttpSmsSender>.Instance), seen);
    }

    private sealed class Seen
    {
        public HttpRequestMessage? Request { get; set; }

        public string? Body { get; set; }
    }

    private sealed class CapturingHandler(Seen seen, HttpStatusCode status) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            seen.Request = request;
            seen.Body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);

            return new HttpResponseMessage(status) { Content = new StringContent("{}") };
        }
    }
}
