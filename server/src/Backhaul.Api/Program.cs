using System.Reflection;
using System.Threading.RateLimiting;

using Backhaul.Api;
using Backhaul.Api.Auth;
using Backhaul.Api.Serialization;
using Backhaul.Infrastructure;
using Backhaul.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;

// The runtime image has no shell tooling — no curl, no wget — for a container
// healthcheck to call. So the binary probes itself, which is also the only
// version of the check that cannot drift from what the server actually serves.
if (args.Contains("--healthcheck"))
{
    return await HealthProbe.RunAsync();
}

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new IsoUtcConverter()));
builder.Services.AddSingleton(TimeProvider.System);

// The store, and which one, is Infrastructure's business — see
// AddBackhaulPersistence for the reasoning about the in-memory default.
var connection = builder.Configuration.GetConnectionString("Backhaul");
builder.Services.AddBackhaulPersistence(
    connection,
    // Only a test sets this, and only so two applications in one process do
    // not share a load board. See AddBackhaulPersistence.
    builder.Configuration["Store:InMemoryName"] ?? "backhaul");

// Which SMS sender. `http` hands codes to a gateway we run ourselves — an
// Android phone with a Nigerian SIM, or a USB modem — and anything else falls
// back to writing them to the log, which the guard below refuses to allow
// against a real database.
builder.Services.AddBackhaulSms(builder.Configuration["Sms:Provider"]);

/*
    The loop that finally sends the alerts.

    `alerts.ts` has decided what reaches a phone and when since before there
    was any way to send one, and it is parity-tested on both sides. This is
    what runs it. Off by default in the in-memory store: a demonstration server
    with no devices registered has nothing to do, and a background loop nobody
    asked for is a surprise in a process somebody started to read Swagger.
*/
if (!string.IsNullOrWhiteSpace(connection)
    || builder.Configuration.GetValue("Alerts:Dispatch", false))
{
    builder.Services.AddHostedService<AlertDispatcher>();
}

// The share route is the only one that answers an unauthenticated request with
// a truck's position, which makes it the only one an outsider can hammer
// without first getting a credential. Guessing a 32-byte token is not the
// threat; volume is. Phase 2's exit gate names this; see ADR-0010.
//
// Partitioned by client address rather than globally: a global bucket means
// one abusive caller takes the feature away from every cargo owner watching a
// delivery, which is the outage the attacker wanted.
// Sixty an hour per address by default. A person following one delivery
// refreshes a handful of times; a script does not stop. Configurable so a test
// can prove the limiter fires without making sixty requests to do it — the
// number is a policy, and a policy nobody can exercise is a policy nobody
// knows works.
var sharePerHour = builder.Configuration.GetValue("RateLimits:PublicSharePerHour", 60);

// Tighter, and for a different reason: every request to `/v1/auth/request`
// can cost an SMS, and the per-number limit in `Otp` does not stop somebody
// walking through a range of numbers.
var authPerHour = builder.Configuration.GetValue("RateLimits:PublicAuthPerHour", 20);

// Per account, not per address, because this caller is authenticated. Twenty
// an hour: a busy shipper opens a handful of trips in a morning, and the
// number that matters is not how many trips are plausible but how many
// strangers' phones one account can make ring. See ADR-0016.
var openTripPerHour = builder.Configuration.GetValue("RateLimits:OpenTripPerHour", 20);

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy(RateLimits.PublicShare, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            // `RemoteIpAddress` is null in some hosting setups and every such
            // request would otherwise share one partition. They share a named
            // one instead, so the fallback is explicit rather than accidental.
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = sharePerHour,
                Window = TimeSpan.FromHours(1),

                // No queue. A caller past the limit is told so immediately
                // rather than held open — a held connection is the resource
                // the flood was trying to exhaust.
                QueueLimit = 0,
            }));

    options.AddPolicy(RateLimits.PublicAuth, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = authPerHour,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
            }));

    options.AddPolicy(RateLimits.OpenTrip, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            // The account, falling back to the address for a request the
            // pipeline somehow let through unauthenticated. Named partitions
            // rather than one shared empty key, so the fallback is explicit.
            context.Principal()?.UserId.ToString()
                ?? context.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = openTripPerHour,
                Window = TimeSpan.FromHours(1),
                QueueLimit = 0,
            }));
});

/*
    Which browsers may call this API, by origin, and nothing wider.

    There was no CORS policy at all until there was a browser client, because a
    phone does not send a preflight — the shipper console is the first caller
    that has to be let in by name. Configured rather than compiled: a console
    served from a static host is deployed per environment and the API cannot
    guess where.

    No wildcard, ever. `AllowAnyOrigin` with credentials is refused by every
    browser anyway, and without credentials it would still hand any page on the
    internet a same-origin-shaped view of this API for a caller who has a
    token. The empty list is the default and it means "no browser", which is
    the correct posture for a deployment that has not thought about it.
*/
var origins = (builder.Configuration.GetValue("Cors:Origins", string.Empty) ?? string.Empty)
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

if (origins.Any(origin => origin == "*"))
{
    throw new InvalidOperationException(
        "Cors:Origins may not contain '*'. Name the origins the console is served from.");
}

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy => policy
        .WithOrigins(origins)
        .WithHeaders("authorization", "content-type")
        .WithMethods("GET", "POST", "PUT", "DELETE")));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Backhaul API",
        Version = "0.1.0",
        Description =
            "Truck load matching and freight visibility for Nigerian road logistics.\n\n" +
            "**Every endpoint except `/healthz` needs `Authorization: Bearer <token>`.** " +
            "Authorisation is a filter on the query rather than a check in the " +
            "controller: a trip is visible to its driver, its carrier and its " +
            "shipper, and to nobody else. A trip you may not see is reported as " +
            "absent rather than forbidden, because the existence of a trip id is " +
            "itself information. See ADR-0008.\n\n" +
            "The rules behind these endpoints — the trip state machine, pricing, " +
            "demurrage and settlement, position cleaning and stall detection — exist " +
            "twice: here in C#, and in `packages/domain` as the TypeScript the mobile " +
            "app runs. They are held to the same answers by generated parity " +
            "fixtures, so drift fails CI rather than surfacing in a disputed invoice. " +
            "See ADR-0005.",
    });

    // The XML comments on the controllers are the documentation. Written there
    // rather than in attributes so the explanation sits with the code it
    // explains and cannot rot separately from it.
    var xml = Path.Combine(
        AppContext.BaseDirectory,
        $"{Assembly.GetExecutingAssembly().GetName().Name}.xml");
    if (File.Exists(xml))
    {
        options.IncludeXmlComments(xml, includeControllerXmlComments: true);
    }

    options.SupportNonNullableReferenceTypes();
});

var app = builder.Build();

// Created eagerly so the first request does not pay for it, and so a bad
// connection string fails at boot rather than 500-ing the first tenant to open
// a link.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BackhaulDbContext>();
    if (string.IsNullOrWhiteSpace(connection))
    {
        await db.Database.EnsureCreatedAsync();
        app.Logger.LogWarning(
            "No ConnectionStrings:Backhaul — trips and positions are held in memory " +
            "and a restart loses every one of them. Fine for a demonstration, not " +
            "for anything a driver is relying on.");

        await SeedDevelopmentTokensAsync(scope.ServiceProvider, app.Logger);
    }
    else
    {
        await db.Database.MigrateAsync();
        app.Logger.LogInformation("using postgres");

        // The logging SMS sender writes sign-in codes to the log. Against a
        // development store that is a convenience; against a real database it
        // means anybody who can read the logs can sign in as anybody, and it
        // is exactly the kind of thing that ships because nobody remembered.
        //
        // So it cannot ship: the process refuses to start.
        if (string.IsNullOrWhiteSpace(app.Configuration["Sms:Provider"]))
        {
            app.Logger.LogCritical(
                "A database is configured but no SMS gateway is. Sign-in codes would be " +
                "written to the log, where anybody who can read them can sign in as " +
                "anybody. Set Sms:Provider, or run without a connection string.");
            return 2;
        }
    }
}

// Before the bearer middleware, because a CORS preflight is an `OPTIONS` with
// no `Authorization` header on it — by design, the browser sends it precisely
// to find out whether it is allowed to send one. Behind the bearer check it
// would be refused, and the console would report a sign-in failure whose real
// cause is three layers away.
app.UseCors();

// Order matters and is the whole point. `BearerMiddleware` proves who the
// caller is; `RequireBearerMiddleware` refuses anything that is not public and
// did not prove it. Swapping them makes the second one useless.
app.UseMiddleware<BearerMiddleware>();
app.UseMiddleware<RequireBearerMiddleware>();

// After authentication, so a rejected request has already been identified in
// the log, and before the controllers, so the limit is enforced rather than
// merely measured.
app.UseRateLimiter();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Backhaul API v1");
    options.DocumentTitle = "Backhaul API";
});

// Issuing a token is a command, not an endpoint.
//
// An endpoint that mints credentials is an endpoint somebody has to remember
// to protect, and getting that wrong is worse than having no auth at all —
// it looks protected. Until the phone-plus-OTP exchange exists (phase 3),
// tokens are issued by whoever can run the process:
//
//   dotnet run --project src/Backhaul.Api -- --issue-token driver <user-guid>
if (args.Contains("--issue-token"))
{
    return await IssueTokenAsync(app, args);
}

app.MapControllers();

await app.RunAsync();
return 0;

// Puts three known tokens in the in-memory store, and says so at the top of
// its voice.
//
// Only when there is no database. With one, `--issue-token` is the way in and
// nothing is seeded — these values are in a public repository, and a server
// that accepts them against real data is a server anyone can read.
//
// It exists because the in-memory default and the token model are otherwise
// contradictory: you cannot issue a token in one process and use it in another
// when the store dies with the process. Without this, "run it and look at
// Swagger" stops working, and a server nobody can try is a server nobody
// reviews.
static async Task SeedDevelopmentTokensAsync(IServiceProvider services, ILogger logger)
{
    var tokens = services
        .GetRequiredService<Backhaul.Infrastructure.Repositories.TokenRepository>();
    var db = services.GetRequiredService<Backhaul.Infrastructure.BackhaulDbContext>();
    var clock = services.GetRequiredService<TimeProvider>();
    var now = clock.GetUtcNow();

    // Fixed ids, so a restart hands back a world with the same people in it.
    (Backhaul.Domain.Access.Role Role, Guid Id)[] people =
    [
        (Backhaul.Domain.Access.Role.Driver, new Guid("d0000000-0000-4000-8000-000000000001")),
        (Backhaul.Domain.Access.Role.Carrier, new Guid("c0000000-0000-4000-8000-000000000002")),
        (Backhaul.Domain.Access.Role.Shipper, new Guid("50000000-0000-4000-8000-000000000003")),
    ];

    var lines = new List<string>();
    var seeded = new Dictionary<string, string>();
    foreach (var (role, id) in people)
    {
        var token = await tokens.IssueAsync(
            id,
            role,
            label: "development seed — in-memory store only",
            issuedAt: now,
            expiresAt: now.AddDays(1));
        var name = role.ToString().ToLowerInvariant();
        lines.Add($"  {name,-8} {id}  {token}");
        seeded[name] = token;
        seeded[$"{name}Id"] = id.ToString();
    }

    await db.SaveChangesAsync();

    logger.LogWarning(
        "DEVELOPMENT TOKENS — in-memory store only, gone when this process ends:\n{Tokens}",
        string.Join('\n', lines));

    await WriteDevelopmentTokensAsync(seeded, logger);
}

// Writes the seeded tokens where a local script can read them.
//
// Only when BACKHAUL_DEV_TOKENS names a path, and only from the branch above —
// which already requires an in-memory store, so these are tokens that die with
// the process and unlock a database that does the same.
//
// Opt-in rather than a file that always appears, because a secret written
// somewhere nobody asked for is a secret somebody commits. The same three
// tokens are already on the console at this point; this is the same disclosure
// in a form `scripts/round-trip.ts` can read, so proving the two wire formats
// agree stops depending on somebody copying three hex strings out of a log by
// hand.
static async Task WriteDevelopmentTokensAsync(
    Dictionary<string, string> seeded,
    ILogger logger)
{
    var path = Environment.GetEnvironmentVariable("BACKHAUL_DEV_TOKENS");
    if (string.IsNullOrWhiteSpace(path)) return;

    try
    {
        var json = System.Text.Json.JsonSerializer.Serialize(seeded);
        await File.WriteAllTextAsync(path, json);
        logger.LogWarning("Development tokens written to {Path}. Do not commit it.", path);
    }
    catch (Exception error) when (error is IOException or UnauthorizedAccessException)
    {
        // Not fatal. The tokens are on the console either way, and a server
        // that will not start because a convenience file could not be written
        // is worse than the inconvenience.
        logger.LogWarning("Could not write {Path}: {Reason}", path, error.Message);
    }
}

static async Task<int> IssueTokenAsync(WebApplication app, string[] args)
{
    var index = Array.IndexOf(args, "--issue-token");
    var role = index + 1 < args.Length ? args[index + 1] : null;
    var user = index + 2 < args.Length ? args[index + 2] : null;

    if (role is null || !Enum.TryParse<Backhaul.Domain.Access.Role>(role, true, out var parsedRole))
    {
        await Console.Error.WriteLineAsync(
            "usage: --issue-token <driver|carrier|shipper> [user-guid]");
        return 1;
    }

    // A missing user id mints a new one rather than failing. The common case
    // is issuing a token for somebody who does not exist yet, and making the
    // caller generate a GUID first is friction for nothing.
    var userId = user is not null && Guid.TryParse(user, out var parsed)
        ? parsed
        : Guid.NewGuid();

    using var scope = app.Services.CreateScope();
    var tokens = scope.ServiceProvider
        .GetRequiredService<Backhaul.Infrastructure.Repositories.TokenRepository>();
    var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
    var now = clock.GetUtcNow();

    var token = await tokens.IssueAsync(
        userId,
        parsedRole,
        label: $"issued from the command line at {Backhaul.Domain.Iso.Utc(now)}",
        issuedAt: now,
        // 90 days. Long enough that a driver on a three-day trip never meets
        // it, short enough that a leaked token is not a permanent one.
        expiresAt: now.AddDays(90));

    Console.WriteLine($"role   {parsedRole.ToString().ToLowerInvariant()}");
    Console.WriteLine($"user   {userId}");
    Console.WriteLine($"token  {token}");
    Console.WriteLine();
    Console.WriteLine("Shown once. Only a SHA-256 of it is stored.");

    // The in-memory store loses this the moment the process ends, which makes
    // the token useless rather than merely temporary. Worth saying.
    var connection = app.Configuration.GetConnectionString("Backhaul");
    if (string.IsNullOrWhiteSpace(connection))
    {
        Console.WriteLine();
        Console.WriteLine(
            "WARNING: no ConnectionStrings:Backhaul, so this token was written to an " +
            "in-memory store and has already ceased to exist. Run against a real " +
            "database — 'make server-up' — or issue tokens from the same process " +
            "that serves them.");
    }

    return 0;
}

/// <summary>Probes the local listener and reports a process exit code.</summary>
internal static class HealthProbe
{
    public static async Task<int> RunAsync()
    {
        // The port the container listens on, read the same way the server
        // reads it, so the two cannot disagree about where to look.
        var urls = Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://+:8080";
        var port = urls.Split(':').LastOrDefault()?.TrimEnd('/') ?? "8080";

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        try
        {
            var response = await client.GetAsync($"http://127.0.0.1:{port}/healthz");
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch (Exception)
        {
            // Any failure to reach it is an unhealthy container. There is no
            // distinction worth drawing here that Docker could act on.
            return 1;
        }
    }
}

/// <summary>Named so the integration tests can reach it through WebApplicationFactory.</summary>
public partial class Program;
