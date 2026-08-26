using System.Reflection;

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
    }
    else
    {
        await db.Database.MigrateAsync();
        app.Logger.LogInformation("using postgres");
    }
}

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Backhaul API v1");
    options.DocumentTitle = "Backhaul API";
});

app.MapControllers();

await app.RunAsync();
return 0;

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
