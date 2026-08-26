using System.Reflection;

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
builder.Services.AddBackhaulPersistence(connection);

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
    }
}

// Order matters and is the whole point. `BearerMiddleware` proves who the
// caller is; `RequireBearerMiddleware` refuses anything that is not public and
// did not prove it. Swapping them makes the second one useless.
app.UseMiddleware<BearerMiddleware>();
app.UseMiddleware<RequireBearerMiddleware>();

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
    foreach (var (role, id) in people)
    {
        var token = await tokens.IssueAsync(
            id,
            role,
            label: "development seed — in-memory store only",
            issuedAt: now,
            expiresAt: now.AddDays(1));
        lines.Add($"  {role.ToString().ToLowerInvariant(),-8} {id}  {token}");
    }

    await db.SaveChangesAsync();

    logger.LogWarning(
        "DEVELOPMENT TOKENS — in-memory store only, gone when this process ends:\n{Tokens}",
        string.Join('\n', lines));
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
