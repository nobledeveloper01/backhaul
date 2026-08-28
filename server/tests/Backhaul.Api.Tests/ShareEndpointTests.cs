using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;

namespace Backhaul.Api.Tests;

/// <summary>
/// The one unauthenticated route in the product. See ADR-0010.
/// </summary>
public sealed class ShareEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static readonly DateTimeOffset T0 = new(2026, 3, 4, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task A_link_lets_a_stranger_see_the_trip_with_no_token_at_all()
    {
        var (trip, shipper) = await OpenAsync();
        var issued = await IssueAsync(shipper, trip, "position");

        // A brand new client, carrying nothing. This is the wedge: a cargo
        // owner who has never heard of Backhaul, opening an SMS.
        var stranger = factory.CreateClient();
        var response = await stranger.GetAsync($"/v1/share/{issued.Token}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var view = (await response.Content.ReadFromJsonAsync<SharedView>(Json))!;
        Assert.Equal("Lagos", view.Origin);
        Assert.Equal("Kano", view.Destination);
    }

    [Fact]
    public async Task A_position_link_does_not_carry_the_track()
    {
        var (trip, shipper) = await OpenAsync();
        var issued = await IssueAsync(shipper, trip, "position");

        var view = await FollowAsync(issued.Token);

        // The scope lives on the row, so this is not something a holder could
        // ask for differently.
        Assert.Null(view.Track);
        Assert.Null(view.Quality);
        Assert.Null(view.Dropped);
    }

    [Fact]
    public async Task An_evidence_link_carries_the_track_and_what_was_dropped()
    {
        var (trip, shipper) = await OpenAsync();
        var issued = await IssueAsync(shipper, trip, "evidence");

        var view = await FollowAsync(issued.Token);

        Assert.NotNull(view.Track);
        Assert.NotNull(view.Quality);
        Assert.NotNull(view.Dropped);
    }

    [Fact]
    public async Task No_scope_carries_money_or_a_phone_number()
    {
        var (trip, shipper) = await OpenAsync();

        foreach (var scope in new[] { "position", "evidence" })
        {
            var issued = await IssueAsync(shipper, trip, scope);
            var body = await factory.CreateClient().GetStringAsync($"/v1/share/{issued.Token}");

            // Against the raw JSON, not a typed view: a typed view can only
            // fail to find fields it was told about, and the thing being
            // guarded against is a field somebody adds later.
            foreach (var forbidden in new[]
                     {
                         "phone", "naira", "kobo", "fare", "price", "amount",
                         "driverId", "carrierId", "shipperId",
                     })
            {
                Assert.DoesNotContain(forbidden, body, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public async Task A_revoked_link_is_gone_and_says_it_was_turned_off()
    {
        var (trip, shipper) = await OpenAsync();
        var issued = await IssueAsync(shipper, trip, "position");

        var revoke = await shipper.DeleteAsync($"/v1/trips/{trip}/share/{issued.Id}");
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);

        var response = await factory.CreateClient().GetAsync($"/v1/share/{issued.Token}");

        Assert.Equal(HttpStatusCode.Gone, response.StatusCode);
        var refusal = (await response.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("revoked", refusal.Refusal);

        // Character-for-character the sentence the mobile client shows. A
        // holder who sees one wording in the app and another on the web has
        // found a seam.
        Assert.Equal(
            "This link was turned off. Ask whoever sent it for a new one.",
            refusal.Message);
    }

    [Fact]
    public async Task A_token_nobody_issued_is_not_found_rather_than_gone()
    {
        // 404 and 410 are different answers: one link never existed, the other
        // worked and stopped. See ADR-0010 for why this route says which.
        var response = await factory.CreateClient()
            .GetAsync($"/v1/share/{new string('a', 64)}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var refusal = (await response.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        // Namespaced, not "unknown": a client maps codes to its own wording,
        // and a sign-in code it has never seen is a different sentence from a
        // share link that was never issued.
        Assert.Equal("unknown_link", refusal.Refusal);
    }

    [Fact]
    public async Task Revoking_twice_keeps_the_first_time()
    {
        var (trip, shipper) = await OpenAsync();
        var issued = await IssueAsync(shipper, trip, "position");

        await shipper.DeleteAsync($"/v1/trips/{trip}/share/{issued.Id}");
        var first = await RevokedAtAsync(shipper, trip, issued.Id);

        await shipper.DeleteAsync($"/v1/trips/{trip}/share/{issued.Id}");
        var second = await RevokedAtAsync(shipper, trip, issued.Id);

        // When a link stopped working is evidence in the way a trip event is.
        Assert.Equal(first, second);
    }

    [Fact]
    public async Task A_revoked_link_stays_in_the_list()
    {
        var (trip, shipper) = await OpenAsync();
        var issued = await IssueAsync(shipper, trip, "position");
        await shipper.DeleteAsync($"/v1/trips/{trip}/share/{issued.Id}");

        var links = await shipper.GetFromJsonAsync<List<LinkView>>(
            $"/v1/trips/{trip}/share", Json);

        // Who was given sight of a trip is part of its record. A list that
        // drops dead links answers "who could see this?" wrongly a month on.
        Assert.Single(links!);
        Assert.NotNull(links![0].RevokedAt);
    }

    [Fact]
    public async Task Somebody_not_on_the_trip_cannot_issue_a_link_to_it()
    {
        var (trip, _) = await OpenAsync();
        var stranger = (await Identities.IssueAsync(factory, Role.Shipper))
            .Carrying(factory.CreateClient());

        var response = await stranger.PostAsJsonAsync(
            $"/v1/trips/{trip}/share",
            new { scope = "position", label = "me", days = 14 });

        // 404 rather than 403, as everywhere else: the existence of a trip id
        // is itself information.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_link_cannot_be_issued_without_an_expiry()
    {
        var (trip, shipper) = await OpenAsync();

        // There is no "never" to send, and a year is out of range. A link with
        // no expiry is a permanent, unauthenticated view of a truck.
        var response = await shipper.PostAsJsonAsync(
            $"/v1/trips/{trip}/share",
            new { scope = "position", label = "forever", days = 365 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Issuing_returns_the_token_once_and_never_again()
    {
        var (trip, shipper) = await OpenAsync();
        var issued = await IssueAsync(shipper, trip, "position");

        var listed = await shipper.GetStringAsync($"/v1/trips/{trip}/share");

        Assert.NotEmpty(issued.Token);
        Assert.DoesNotContain(issued.Token, listed, StringComparison.Ordinal);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(Guid Trip, HttpClient Shipper)> OpenAsync()
    {
        var shipper = await Identities.IssueAsync(factory, Role.Shipper);
        var client = shipper.Carrying(factory.CreateClient());
        var trip = Guid.NewGuid();

        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}",
            new
            {
                driverPhone = Identities.NextPhone(),
                carrierPhone = Identities.NextPhone(),
                shipperPhone = shipper.Phone,
                origin = "Lagos",
                destination = "Kano",
                at = T0,
                actor = "shipper",
            });
        response.EnsureSuccessStatusCode();

        return (trip, client);
    }

    private static async Task<IssuedView> IssueAsync(HttpClient client, Guid trip, string scope)
    {
        var response = await client.PostAsJsonAsync(
            $"/v1/trips/{trip}/share",
            new { scope, label = "Alhaji Bello (receiving)", days = 14 });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IssuedView>(Json))!;
    }

    private async Task<SharedView> FollowAsync(string token)
    {
        var response = await factory.CreateClient().GetAsync($"/v1/share/{token}");
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SharedView>(Json))!;
    }

    private static async Task<DateTimeOffset?> RevokedAtAsync(
        HttpClient client,
        Guid trip,
        Guid link)
    {
        var links = await client.GetFromJsonAsync<List<LinkView>>($"/v1/trips/{trip}/share", Json);
        return links!.Single(l => l.Id == link).RevokedAt;
    }

    private sealed record IssuedView(Guid Id, string Token, string Scope, DateTimeOffset ExpiresAt);

    private sealed record LinkView(Guid Id, string Scope, string Label, DateTimeOffset? RevokedAt);

    private sealed record SharedView(
        string Origin,
        string Destination,
        string Observation,
        long DistanceMetres,
        double? Quality,
        int? Dropped,
        List<object>? Track);

    private sealed record RefusalView(string Refusal, string Message);
}
