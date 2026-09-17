using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Repositories;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Backhaul.Api.Tests;

/// <summary>
/// The papers waiting for somebody to look, and the reviewer told once a day.
/// </summary>
/// <remarks>
/// ADR-0017 made a tier something a reviewer confirms and left the reviewer to
/// find the work. These are about the queue that finds it for them: a claim is
/// a row, a review closes it, the oldest is first, and the message about it
/// arrives once, not forty times. See ADR-0022.
/// </remarks>
public sealed class ReviewQueueTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private sealed record Queued(Guid CarrierId, string Paper, DateTimeOffset ClaimedAt, long WaitedSeconds);

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
    public async Task A_claim_joins_the_queue_and_a_review_leaves_it()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());
        var desk = (await Identities.IssueAsync(factory, Role.Reviewer)).Carrying(factory.CreateClient());

        await client.PutAsJsonAsync("/v1/me/verification/licence", new { held = true });

        var queue = await desk.GetFromJsonAsync<List<Queued>>("/v1/verification/queue", Json);
        var mine = Assert.Single(queue!, q => q.CarrierId == carrier.UserId);
        Assert.Equal("licence", mine.Paper);
        Assert.True(mine.WaitedSeconds >= 0);

        // Claiming again while unreviewed is the same switch tapped twice.
        await client.PutAsJsonAsync("/v1/me/verification/licence", new { held = true });
        queue = await desk.GetFromJsonAsync<List<Queued>>("/v1/verification/queue", Json);
        Assert.Single(queue!, q => q.CarrierId == carrier.UserId);

        var reviewed = await desk.PutAsJsonAsync($"/v1/verification/{carrier.UserId}/licence", new { held = true });
        Assert.Equal(HttpStatusCode.NoContent, reviewed.StatusCode);

        queue = await desk.GetFromJsonAsync<List<Queued>>("/v1/verification/queue", Json);
        Assert.DoesNotContain(queue!, q => q.CarrierId == carrier.UserId);

        // A new upload after a review is a new claim, and a fresh row.
        await client.PutAsJsonAsync("/v1/me/verification/licence", new { held = true });
        queue = await desk.GetFromJsonAsync<List<Queued>>("/v1/verification/queue", Json);
        Assert.Single(queue!, q => q.CarrierId == carrier.UserId);
    }

    [Fact]
    public async Task Withdrawing_a_claim_leaves_the_queue_without_an_answer()
    {
        var carrier = await Identities.IssueAsync(factory, Role.Carrier);
        var client = carrier.Carrying(factory.CreateClient());
        var desk = (await Identities.IssueAsync(factory, Role.Reviewer)).Carrying(factory.CreateClient());

        await client.PutAsJsonAsync("/v1/me/verification/insurance", new { held = true });
        await client.PutAsJsonAsync("/v1/me/verification/insurance", new { held = false });

        var queue = await desk.GetFromJsonAsync<List<Queued>>("/v1/verification/queue", Json);
        Assert.DoesNotContain(queue!, q => q.CarrierId == carrier.UserId);
    }

    [Fact]
    public async Task The_oldest_claim_is_first()
    {
        // Written straight to the repository so the ages are not the same
        // second: the route reads the clock and the test cannot move it.
        var older = Guid.NewGuid();
        var newer = Guid.NewGuid();
        var now = factory.Services.GetRequiredService<TimeProvider>().GetUtcNow();
        using (var scope = factory.Services.CreateScope())
        {
            var identity = scope.ServiceProvider.GetRequiredService<IdentityRepository>();
            await identity.SetPaperAsync(newer, Paper.Identity, held: true, now.AddMinutes(-5));
            await identity.SetPaperAsync(older, Paper.Identity, held: true, now.AddDays(-3));
        }

        var desk = (await Identities.IssueAsync(factory, Role.Reviewer)).Carrying(factory.CreateClient());
        var queue = await desk.GetFromJsonAsync<List<Queued>>("/v1/verification/queue", Json);

        var ours = queue!.Where(q => q.CarrierId == older || q.CarrierId == newer).ToList();
        Assert.Equal(older, ours[0].CarrierId);
        Assert.Equal(newer, ours[1].CarrierId);
        Assert.True(ours[0].WaitedSeconds >= 3 * 24 * 3600 - 5);
    }

    [Fact]
    public async Task The_queue_does_not_exist_for_anyone_but_a_reviewer()
    {
        // 404 rather than 403: the shape of the answer must not tell a caller
        // that a route they may not use exists. See ADR-0008.
        foreach (var role in new[] { Role.Carrier, Role.Shipper, Role.Driver })
        {
            var client = (await Identities.IssueAsync(factory, role)).Carrying(factory.CreateClient());
            var response = await client.GetAsync("/v1/verification/queue");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
    }

    [Fact]
    public async Task A_reviewer_is_told_once_a_day_and_only_about_a_queue_worth_telling()
    {
        var clock = factory.Services.GetRequiredService<TimeProvider>();
        var reviewer = await Identities.IssueAsync(factory, Role.Reviewer);
        var desk = reviewer.Carrying(factory.CreateClient());
        var token = $"desk-{reviewer.UserId}";
        var registered = await desk.PutAsJsonAsync(
            "/v1/me/devices",
            new { token, platform = "android", utcOffsetMinutes = 60 });
        registered.EnsureSuccessStatusCode();

        var spy = new Spy();
        var dispatcher = new AlertDispatcher(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            spy,
            clock,
            factory.Services.GetRequiredService<ILogger<AlertDispatcher>>());

        // A claim made a minute ago does not need a message.
        var fresh = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var identity = scope.ServiceProvider.GetRequiredService<IdentityRepository>();
            await identity.SetPaperAsync(fresh, Paper.Licence, held: true, clock.GetUtcNow().AddMinutes(-1));
        }

        await dispatcher.RunOnceAsync();
        Assert.DoesNotContain(spy.Sent, n => n.Token == token);

        // Something older than an hour does — once, with the count and the
        // age, and nobody's name.
        var stale = Guid.NewGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var identity = scope.ServiceProvider.GetRequiredService<IdentityRepository>();
            await identity.SetPaperAsync(stale, Paper.Identity, held: true, clock.GetUtcNow().AddHours(-26));
        }

        await dispatcher.RunOnceAsync();
        var told = Assert.Single(spy.Sent, n => n.Token == token);
        Assert.Equal("Papers waiting", told.Title);
        Assert.Contains("1 day", told.Body);
        Assert.DoesNotContain(stale.ToString(), told.Body);
        Assert.False(told.Urgent);

        await dispatcher.RunOnceAsync();
        Assert.Single(spy.Sent, n => n.Token == token);
    }
}
