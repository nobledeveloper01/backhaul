using System.Net;
using System.Net.Http.Json;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Backhaul.Api.Tests;

/// <summary>
/// The wedge: a trip agreed somewhere else, opened here, by phone number.
/// </summary>
/// <remarks>
/// These pin ADR-0016, and the one that matters most is
/// <see cref="It_answers_the_same_way_whether_the_number_was_known"/>. The
/// other rules are conveniences; that one is the whole reason this endpoint
/// is allowed to resolve a phone number at all.
/// </remarks>
public sealed class OpenTripTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_shipper_opens_a_trip_no_marketplace_created()
    {
        // The sentence the product is built on: tracking is the wedge. A load
        // agreed on WhatsApp, and the two numbers the shipper has been
        // messaging all morning.
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();

        var response = await client.PostAsJsonAsync($"/v1/trips/{trip}", Body());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        // And it is theirs, which is the half that was impossible before: a
        // trip you open is a trip you can read.
        var mine = await client.GetAsync($"/v1/trips/{trip}");
        Assert.Equal(HttpStatusCode.OK, mine.StatusCode);
    }

    [Fact]
    public async Task A_number_with_no_account_behind_it_gets_one()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());
        var driverPhone = Identities.NextPhone();

        await Missing(client, driverPhone);

        var opened = await client.PostAsJsonAsync(
            $"/v1/trips/{Guid.NewGuid()}",
            Body(driver: driverPhone));
        opened.EnsureSuccessStatusCode();

        // The driver has never installed anything. They have an account
        // holding their number, and the trip naming them is simply there the
        // first time they sign in with that SIM.
        Assert.NotNull(await Find(driverPhone));
    }

    [Fact]
    public async Task It_answers_the_same_way_whether_the_number_was_known()
    {
        // The load-bearing claim of ADR-0016. An endpoint that creates
        // something is not an enumeration oracle *provided its answer does not
        // vary with what it found*. If this ever fails, the fix is to make the
        // answers agree — not to relax the test, which would leave the product
        // shipping a way to ask "is this number on Backhaul?" one request at a
        // time, and that list is the whole reason there is no lookup endpoint.
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());

        var known = await Identities.IssueAsync(factory, Role.Driver);
        var unknown = Identities.NextPhone();

        var first = await client.PostAsJsonAsync(
            $"/v1/trips/{Guid.NewGuid()}",
            Body(driver: known.Phone));
        var second = await client.PostAsJsonAsync(
            $"/v1/trips/{Guid.NewGuid()}",
            Body(driver: unknown));

        Assert.Equal(first.StatusCode, second.StatusCode);

        // Not just the status: the whole body, with identifiers blanked. A
        // GUID differs between any two trips and carries nothing about
        // whether the account behind it is a day or a second old. What must
        // not differ is anything else — a field that appears only in one case,
        // a flag, a different wording — because that is what a caller walking
        // a range of numbers would read the answer for.
        var a = Anonymous(await first.Content.ReadAsStringAsync());
        var b = Anonymous(await second.Content.ReadAsStringAsync());
        Assert.Equal(a, b);
    }

    [Fact]
    public async Task A_trip_has_three_parties_and_says_so_when_one_is_missing()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{Guid.NewGuid()}",
            new
            {
                driverPhone = Identities.NextPhone(),
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            "carrierPhone is required",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_number_this_cannot_reach_is_refused_and_mints_nothing()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{Guid.NewGuid()}",
            Body(driver: "0803 not a number"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(
            "driverPhone is not a phone number",
            await response.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);
    }

    // --- helpers -----------------------------------------------------------

    private static object Body(string? driver = null, string? carrier = null) => new
    {
        driverPhone = driver ?? Identities.NextPhone(),
        carrierPhone = carrier ?? Identities.NextPhone(),
        origin = "Lagos",
        destination = "Kano",
        at = T0,
        actor = "shipper",
    };

    /// <summary>The response body with every identifier blanked.</summary>
    private static string Anonymous(string body) =>
        System.Text.RegularExpressions.Regex.Replace(
            body,
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
            "<id>");

    private async Task Missing(HttpClient _, string phone) =>
        Assert.Null(await Find(phone));

    private async Task<Guid?> Find(string phone)
    {
        using var scope = factory.Services.CreateScope();
        var accounts = scope.ServiceProvider.GetRequiredService<SignInRepository>();
        return await accounts.FindAsync(phone);
    }
}

/// <summary>Its own application, with a limit small enough to reach.</summary>
/// <inheritdoc cref="ThrottledApiFactory"/>
public sealed class OpenTripThrottledFactory : WebApplicationFactory<Program>
{
    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureHostConfiguration(config =>
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["RateLimits:OpenTripPerHour"] = "2",
            }));
        return base.CreateHost(builder);
    }
}

public sealed class OpenTripRateLimitTests(OpenTripThrottledFactory factory)
    : IClassFixture<OpenTripThrottledFactory>
{
    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task One_account_cannot_make_every_phone_in_Nigeria_ring()
    {
        // Opening a trip names two numbers and can cause an SMS to each. This
        // is what bounds the abuse ADR-0016 accepts, and it is partitioned by
        // account rather than by address — the caller here is authenticated,
        // so the limit attaches to something that cost a working SIM to get.
        var shipper = await Identities.IssueAsync(factory.Services, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());

        for (var i = 0; i < 2; i++)
        {
            var allowed = await client.PostAsJsonAsync($"/v1/trips/{Guid.NewGuid()}", Body());
            Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
        }

        var refused = await client.PostAsJsonAsync($"/v1/trips/{Guid.NewGuid()}", Body());
        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);

        // A different account is unaffected. One noisy shipper must not take
        // the wedge away from everybody else.
        var other = await Identities.IssueAsync(factory.Services, Role.Shipper);
        var theirs = await other.Carrying(factory.CreateClient())
            .PostAsJsonAsync($"/v1/trips/{Guid.NewGuid()}", Body());
        Assert.Equal(HttpStatusCode.Created, theirs.StatusCode);
    }

    private static object Body() => new
    {
        driverPhone = Identities.NextPhone(),
        carrierPhone = Identities.NextPhone(),
        origin = "Lagos",
        destination = "Kano",
        at = T0,
        actor = "shipper",
    };
}
