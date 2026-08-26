using Backhaul.Domain.Access;
using Microsoft.AspNetCore.Mvc;

namespace Backhaul.Api.Auth;

/// <summary>
/// A controller whose every action needs a caller.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="Caller"/> throws rather than returning null. That is deliberate:
/// an action that reaches for the principal and gets nothing has a bug in its
/// routing, not a user with a missing token — the middleware and this base
/// class together mean an unauthenticated request never gets that far.
/// </para>
/// <para>
/// This is only the second line of defence. The first is that no repository
/// method returns a trip or a position without a principal, so forgetting to
/// derive from this class produces a compile error rather than a leak. See
/// ADR-0008.
/// </para>
/// </remarks>
public abstract class AuthorisedController : ControllerBase
{
    protected Principal Caller =>
        HttpContext.Principal()
        ?? throw new InvalidOperationException(
            "This action requires an authenticated caller and the pipeline let " +
            "an anonymous request through. Check RequireBearer is registered.");
}
