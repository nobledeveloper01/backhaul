# The shipper console

A fourth face on the same product, in a browser. It exists because a shipper
running loads from an office has a desktop in front of them and a phone in
their pocket, and one of the two is the wrong shape for reading a list of
twenty trips.

## What it is not

**Not the driver face.** A driver's screen is 64 dp targets and as close to
zero interactions per trip as the feature allows, on a phone, in the sun, with
a queue behind them. That is a different product wearing the same icon and it
does not belong on a desktop.

**Not a second implementation of anything.** The rules come from
`@backhaul/domain` and the wire from `@backhaul/api`, both unchanged and both
compiled exactly the way they are for the phone. What is written here is
arrangement.

## No framework, no bundler

Three views and a list. `tsc` emits ordinary ESM, an import map in `index.html`
gives the two workspace packages a name, and the browser loads them natively.

A bundler here would be a build step between a reviewer and the thing being
reviewed, and at this size it buys nothing. The day this grows to a hundred
modules and the request waterfall starts to hurt, the answer is a bundler and
`build.js` is what it replaces.

## Running it

```
pnpm --filter @backhaul/web build
cd apps/web/dist && python3 -m http.server 5180
```

The API's origin comes from the page, not the bundle, so one build serves every
environment:

```html
<html data-api="https://api.example.ng">
```

**The API must be told which origins may call it.** A phone sends no preflight
and there was no CORS policy until this console existed; the server now takes
one, by name, with no wildcard:

```
Cors__Origins=http://127.0.0.1:5180
```

An empty list means "no browser may call this", which is the right default for
a deployment that has not thought about it.

## What it does not do yet

One trip's detail — the corridor, the track, the ETA — is not built; the list
routes to a hash that nothing renders. Posting a load, reading bids and
awarding are all shipper actions that belong here and are only on the phone.
