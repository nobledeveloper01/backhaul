using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Repositories;
using Microsoft.Extensions.DependencyInjection;

namespace Backhaul.Api.Tests;

/// <summary>
/// Signing in. Public by necessity, which puts it under the same scrutiny as
/// the share route.
/// </summary>
public sealed class AuthEndpointTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>A different number per test: the rate limits are per number.</summary>
    private static int _next = 1_000_000;

    private static string NextPhone() => $"0803{Interlocked.Increment(ref _next)}";

    [Fact]
    public async Task A_first_sign_in_creates_an_account_and_returns_a_token()
    {
        var phone = NextPhone();
        var (client, code) = await AskAsync(phone);

        var response = await client.PostAsJsonAsync("/v1/auth/verify", new { phone, code });
        response.EnsureSuccessStatusCode();

        var signedIn = (await response.Content.ReadFromJsonAsync<SignedInView>(Json))!;
        Assert.NotEmpty(signedIn.Token);
        Assert.True(signedIn.IsNew);

        // A first-time number becomes a driver — the role that can see the
        // least. Guessing upward on a first sign-in would hand somebody a
        // fleet.
        Assert.Equal("driver", signedIn.Role);
    }

    [Fact]
    public async Task The_token_it_returns_actually_works()
    {
        var phone = NextPhone();
        var (client, code) = await AskAsync(phone);
        var signedIn = await VerifyAsync(client, phone, code);

        var carrying = factory.CreateClient();
        carrying.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", signedIn.Token);

        var me = await carrying.GetAsync("/v1/me");

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    [Fact]
    public async Task Signing_in_again_finds_the_same_account()
    {
        // A driver who signs in one way and back another way must not be two
        // accounts, and the second one owns none of their trips.
        var phone = NextPhone();

        var (first, code) = await AskAsync(phone);
        var one = await VerifyAsync(first, phone, code);

        // The second code is issued through the repository rather than over
        // HTTP, because the endpoint would rightly refuse: a code was sent to
        // this number seconds ago and the sixty-second resend cooldown is
        // doing its job. What is being tested is normalisation on `verify`,
        // not the cooldown, and fighting one policy to reach another makes a
        // test that fails for the wrong reason.
        var second = await IssueDirectlyAsync(phone);

        // Written differently, on purpose.
        var written = $"+234{phone[1..]}";
        var two = await VerifyAsync(factory.CreateClient(), written, second);

        Assert.Equal(one.UserId, two.UserId);
        Assert.False(two.IsNew);
    }

    [Fact]
    public async Task A_code_cannot_be_used_twice()
    {
        var phone = NextPhone();
        var (client, code) = await AskAsync(phone);
        await VerifyAsync(client, phone, code);

        var again = await client.PostAsJsonAsync("/v1/auth/verify", new { phone, code });

        Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);
        var refusal = (await again.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("used", refusal.Refusal);
    }

    [Fact]
    public async Task A_wrong_code_says_how_many_tries_are_left_and_burns_out()
    {
        var phone = NextPhone();
        var (client, _) = await AskAsync(phone);

        // Five wrong guesses. The fifth says it was the last; the sixth says
        // the code is burned, which is a different remedy.
        for (var i = 0; i < 5; i++)
        {
            var wrong = await client.PostAsJsonAsync(
                "/v1/auth/verify",
                new { phone, code = "000000" });

            Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
            var refusal = (await wrong.Content.ReadFromJsonAsync<RefusalView>(Json))!;
            Assert.Equal("wrong", refusal.Refusal);

            if (i == 4)
            {
                Assert.Contains("last try", refusal.Message, StringComparison.Ordinal);
            }
        }

        var burned = await client.PostAsJsonAsync("/v1/auth/verify", new { phone, code = "000000" });
        var final = (await burned.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("exhausted", final.Refusal);
    }

    [Fact]
    public async Task Asking_twice_in_a_row_is_refused_with_a_countdown()
    {
        // A disabled button with no explanation reads as broken to somebody
        // whose SMS has not arrived.
        var phone = NextPhone();
        var (client, _) = await AskAsync(phone);

        var again = await client.PostAsJsonAsync("/v1/auth/request", new { phone });

        Assert.Equal(HttpStatusCode.TooManyRequests, again.StatusCode);
        var refusal = (await again.Content.ReadFromJsonAsync<RefusalView>(Json))!;
        Assert.Equal("too_soon", refusal.Refusal);
        Assert.True(refusal.RetryInMs > 0);
    }

    [Fact]
    public async Task Something_that_is_not_a_phone_number_is_refused_rather_than_guessed_at()
    {
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/v1/auth/request",
            new { phone = "not a number" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Asking_for_a_code_says_nothing_about_whether_the_number_is_known()
    {
        // Telling a caller which numbers are registered turns this into a way
        // to find out who uses Backhaul.
        //
        // The known number is registered through the repository rather than by
        // signing in over HTTP: doing it that way would leave a fresh
        // challenge on it, and the resend cooldown would then answer
        // differently for reasons that have nothing to do with whether the
        // account exists. That difference is real and is the *cooldown*
        // leaking, which is a much smaller fact than registration.
        var known = NextPhone();
        await RegisterDirectlyAsync(known);

        var stranger = NextPhone();

        var forKnown = await factory.CreateClient()
            .PostAsJsonAsync("/v1/auth/request", new { phone = known });
        var forStranger = await factory.CreateClient()
            .PostAsJsonAsync("/v1/auth/request", new { phone = stranger });

        Assert.Equal(forKnown.StatusCode, forStranger.StatusCode);

        var one = await forKnown.Content.ReadFromJsonAsync<RequestView>(Json);
        var two = await forStranger.Content.ReadFromJsonAsync<RequestView>(Json);

        // Same shape, same wait. The only thing that differs is the number
        // echoed back.
        Assert.Equal(one!.ResendInMs, two!.ResendInMs);
        Assert.Equal(one.DevelopmentCode is null, two.DevelopmentCode is null);
    }

    [Fact]
    public async Task A_name_can_be_set_once_signed_in_and_not_before()
    {
        var phone = NextPhone();
        var (client, code) = await AskAsync(phone);
        var signedIn = await VerifyAsync(client, phone, code);

        var anonymous = await factory.CreateClient()
            .PutAsJsonAsync("/v1/me/name", new { name = "Musa Danjuma" });
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var carrying = factory.CreateClient();
        carrying.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", signedIn.Token);

        var named = await carrying.PutAsJsonAsync("/v1/me/name", new { name = "Musa Danjuma" });
        Assert.Equal(HttpStatusCode.NoContent, named.StatusCode);
    }

    [Fact]
    public async Task Asking_who_you_are_never_hands_back_a_fresh_token()
    {
        // An endpoint that returns a credential is one that turns a leaked
        // response into a working one.
        var phone = NextPhone();
        var (client, code) = await AskAsync(phone);
        var signedIn = await VerifyAsync(client, phone, code);

        var carrying = factory.CreateClient();
        carrying.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", signedIn.Token);

        var me = (await carrying.GetFromJsonAsync<SignedInView>("/v1/me", Json))!;

        Assert.Empty(me.Token);
        Assert.Equal(signedIn.UserId, me.UserId);
    }

    // --- helpers -----------------------------------------------------------

    private async Task<(HttpClient Client, string Code)> AskAsync(string phone)
    {
        var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/v1/auth/request", new { phone });
        response.EnsureSuccessStatusCode();

        var asked = (await response.Content.ReadFromJsonAsync<RequestView>(Json))!;

        // Only present because no SMS gateway is configured, which is the only
        // way these tests can know the code — and `Program.cs` refuses to run
        // in this mode against a real database.
        Assert.NotNull(asked.DevelopmentCode);

        return (client, asked.DevelopmentCode!);
    }

    private async Task<SignedInView> VerifyAsync(HttpClient client, string phone, string code)
    {
        var response = await client.PostAsJsonAsync("/v1/auth/verify", new { phone, code });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<SignedInView>(Json))!;
    }

    /// <summary>A code, issued past the endpoint's own cooldown.</summary>
    private async Task<string> IssueDirectlyAsync(string phone)
    {
        using var scope = factory.Services.CreateScope();
        var signIn = scope.ServiceProvider.GetRequiredService<SignInRepository>();
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();

        return await signIn.IssueAsync(Otp.NormalisePhone(phone)!, clock.GetUtcNow());
    }

    /// <summary>An account, without leaving a challenge on the number.</summary>
    private async Task RegisterDirectlyAsync(string phone)
    {
        using var scope = factory.Services.CreateScope();
        var signIn = scope.ServiceProvider.GetRequiredService<SignInRepository>();
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        var now = clock.GetUtcNow();

        var normalised = Otp.NormalisePhone(phone)!;
        await signIn.IssueAsync(normalised, now);
        var (_, id) = await signIn.NewestAsync(normalised);
        await signIn.ConsumeAsync(id, normalised, now);
    }

    private sealed record RequestView(string Phone, long ResendInMs, string? DevelopmentCode);

    private sealed record SignedInView(
        string Token,
        Guid UserId,
        string Role,
        string Name,
        bool IsNew);

    private sealed record RefusalView(string Refusal, string Message, long? RetryInMs);
}
