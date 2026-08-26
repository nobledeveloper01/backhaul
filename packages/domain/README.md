# `@backhaul/domain`

The rules, with no platform in them.

This package imports **nothing** from React Native and **nothing** from the DOM.
It is consumed by the mobile app, by the web shipper console, and — through a
thin adapter — by the server's matching service, so a load ranks the same way
in all three. A boundary rule in CI fails the build if anything platform-shaped
gets in.

That constraint is not tidiness. The trip state machine decides whether a
driver is paid and whether a cargo owner's goods are accounted for; it should
be readable and testable without a simulator, a map tile, or a phone.

Everything here is either a **pure function** or a **sealed result**. There are
deliberately very few nullable returns: a caller that cannot render "your cargo
arrives at null" is a caller that cannot ship that bug.
