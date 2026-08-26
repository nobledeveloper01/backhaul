using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Controllers;

public sealed class HealthResponse
{
    public string Status { get; set; } = "ok";

    public string Store { get; set; } = string.Empty;

    /// <summary>
    /// False when the store loses everything on restart. Reported rather than
    /// left to be discovered, because the ingest path's whole contract is that
    /// an acknowledgement means durable.
    /// </summary>
    public bool Durable { get; set; }
}

[ApiController]
[Tags("health")]
public sealed class HealthController(IConfiguration config) : ControllerBase
{
    /// <summary>Liveness probe.</summary>
    /// <remarks>
    /// Deliberately outside the version prefix and outside auth: a load
    /// balancer should not need a token to find out whether the process is up.
    /// </remarks>
    [HttpGet("/healthz")]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    public HealthResponse Check()
    {
        var connection = config.GetConnectionString("Backhaul");
        var durable = !string.IsNullOrWhiteSpace(connection);
        return new HealthResponse
        {
            Status = "ok",
            Store = durable ? "postgres" : "in-memory",
            Durable = durable,
        };
    }
}
