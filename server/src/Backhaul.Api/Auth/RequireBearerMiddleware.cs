namespace Backhaul.Api.Auth;

/// <summary>
/// Refuses anything that is not <c>/healthz</c>, the Swagger UI, or
/// authenticated.
/// </summary>
/// <remarks>
/// <para>
/// An allow-list, not a deny-list. A deny-list protects the paths somebody
/// remembered; the next controller added is protected by default under this
/// one, and has to be deliberately exempted to be public.
/// </para>
/// <para>
/// 401 with a <c>WWW-Authenticate</c> header, because a missing token and a
/// wrong token are the same situation from the client's side: get a token.
/// </para>
/// </remarks>
public sealed class RequireBearerMiddleware(RequestDelegate next)
{
    private static readonly string[] Public =
    [
        "/healthz",
        "/swagger",
        "/favicon.ico",
    ];

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        var isPublic = Public.Any(prefix =>
            path.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith(prefix + "/", StringComparison.OrdinalIgnoreCase));

        if (!isPublic && context.Principal() is null)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.Headers.WWWAuthenticate = "Bearer";
            await context.Response.WriteAsJsonAsync(new
            {
                message = "This endpoint needs a bearer token.",
            });
            return;
        }

        await next(context);
    }
}
