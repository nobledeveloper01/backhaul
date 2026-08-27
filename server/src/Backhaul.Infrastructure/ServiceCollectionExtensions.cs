using Backhaul.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Backhaul.Infrastructure;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers the store: PostgreSQL when there is a connection string,
    /// in-memory when there is not.
    /// </summary>
    /// <remarks>
    /// <para>
    /// In-memory is the default on purpose. This server exists to be read as
    /// much as to be run, and a reviewer who has to provision PostgreSQL
    /// before the Swagger page will answer is a reviewer who does not open the
    /// Swagger page.
    /// </para>
    /// <para>
    /// It is also a lie about durability, and durability is the ingest path's
    /// whole contract — a device deletes its local rows on an acknowledgement.
    /// So the trade is logged at boot and reported on <c>/healthz</c> rather
    /// than left to be discovered.
    /// </para>
    /// <para>
    /// PostGIS is not wired here yet. Nothing in the schema has a geometry
    /// column: radius matching over posted loads is the first thing that needs
    /// it, and that is phase 5. Adding the extension now would be a dependency
    /// nothing uses.
    /// </para>
    /// </remarks>
    /// <param name="services">The container.</param>
    /// <param name="connectionString">A relational database, or null for memory.</param>
    /// <param name="inMemoryName">
    /// Which in-memory store to use.
    /// <para>
    /// The name is a parameter because it is the *identity* of the store: EF's
    /// in-memory provider shares one database between every context that names
    /// it, process-wide. Two applications booted in one test run therefore
    /// shared a load board, and a test that asserted on "everything on the
    /// board" passed or failed depending on which test ran first. Naming it
    /// makes isolation possible; leaving it a constant made it impossible.
    /// </para>
    /// </param>
    public static IServiceCollection AddBackhaulPersistence(
        this IServiceCollection services,
        string? connectionString,
        string inMemoryName = "backhaul")
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            services.AddDbContext<BackhaulDbContext>(options =>
                options.UseInMemoryDatabase(inMemoryName));
        }
        else
        {
            services.AddDbContext<BackhaulDbContext>(options =>
                options.UseNpgsql(connectionString));
        }

        services.AddScoped<TripRepository>();
        services.AddScoped<PositionRepository>();
        services.AddScoped<TokenRepository>();
        services.AddScoped<ShareRepository>();
        services.AddScoped<SignInRepository>();
        services.AddScoped<TripDetailRepository>();
        services.AddScoped<MoneyRepository>();
        services.AddScoped<MarketRepository>();
        services.AddScoped<DisputeRepository>();
        services.AddScoped<ReviewRepository>();
        services.AddScoped<DeliveryRepository>();
        services.AddScoped<IdentityRepository>();

        return services;
    }

    /// <summary>
    /// Wires whichever SMS sender is configured.
    /// </summary>
    /// <remarks>
    /// Two, and the difference matters: <see cref="LoggingSmsSender"/> writes
    /// the code to the log and is a development convenience;
    /// <see cref="HttpSmsSender"/> hands it to a gateway we run. `Program.cs`
    /// refuses to start with the first one against a real database, because
    /// anybody who can read the logs could otherwise sign in as anybody.
    /// </remarks>
    public static IServiceCollection AddBackhaulSms(
        this IServiceCollection services,
        string? provider)
    {
        if (string.Equals(provider, "http", StringComparison.OrdinalIgnoreCase))
        {
            services.AddHttpClient<ISmsSender, HttpSmsSender>(client =>
            {
                // A gateway on a phone over a home connection is slow, and a
                // request that never settles holds a sign-in open forever.
                client.Timeout = TimeSpan.FromSeconds(20);
            });

            return services;
        }

        services.AddSingleton<ISmsSender, LoggingSmsSender>();

        return services;
    }
}
