using Backhaul.Domain.Access;
using Backhaul.Infrastructure.Repositories;

namespace Backhaul.Api.Auth;

/// <summary>
/// Turns an <c>Authorization: Bearer</c> header into a
/// <see cref="Principal"/>, or into nothing.
/// </summary>
/// <remarks>
/// It does not reject anything. Whether an endpoint needs a principal is the
/// endpoint's business — <c>/healthz</c> does not, and a load balancer should
/// not need a token to find out whether the process is up. What this
/// guarantees is that if a principal is present, it was proved.
/// </remarks>
public sealed class BearerMiddleware(RequestDelegate next)
{
    public const string PrincipalItem = "backhaul.principal";

    public async Task InvokeAsync(
        HttpContext context,
        TokenRepository tokens,
        TimeProvider clock)
    {
        var header = context.Request.Headers.Authorization.ToString();

        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = header["Bearer ".Length..].Trim();
            var principal = await tokens.ResolveAsync(token, clock.GetUtcNow(), context.RequestAborted);
            if (principal is not null)
            {
                context.Items[PrincipalItem] = principal;
            }
        }

        await next(context);
    }
}

public static class HttpContextExtensions
{
    /// <summary>The caller, if they proved who they are.</summary>
    public static Principal? Principal(this HttpContext context) =>
        context.Items.TryGetValue(BearerMiddleware.PrincipalItem, out var value)
            ? value as Principal
            : null;
}
