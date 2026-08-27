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
    public static IServiceCollection AddBackhaulPersistence(
        this IServiceCollection services,
        string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            services.AddDbContext<BackhaulDbContext>(options =>
                options.UseInMemoryDatabase("backhaul"));
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
        services.AddScoped<DeliveryRepository>();
        services.AddScoped<IdentityRepository>();

        // Replaced by a real gateway in production; `Program.cs` refuses to
        // start with this one against a real database.
        services.AddSingleton<ISmsSender, LoggingSmsSender>();

        return services;
    }
}
