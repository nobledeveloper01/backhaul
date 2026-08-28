# ADR-0015 — The delivery note is plain text, and the seal is what releases it

## Status

Accepted — 2026-08-28.

## Context

A driver arrives, photographs the cargo, takes a signature, and the trip is
delivered. The other three parties — the shipper, the carrier's office, the
consignee's clerk — all want the same thing next: something they can keep. A
delivery note. Today `packages/domain/src/pod.ts` composes that note as
`PodLine[]` and `ProofScreen` renders it, but it only exists inside the app.
Nobody outside can hold it.

Two decisions had to be made to hand it over, and both had an obvious wrong
answer that looks better on a feature list.

**What format.** A PDF is what a logistics product is expected to produce. It
carries the signature strokes and the photographs, it prints, and it looks
like a document. It also costs a native PDF dependency on a 2 GB Transsion
handset, and a driver whose phone has 400 MB free at the end of a Lagos–Kano
run is exactly the person who needs the hand-over to work.

**When it can leave.** The note can be composed the moment the last photograph
is taken. `seal()` is what decides the proof is complete, and the server holds
the verdict — `sealedAt`. Rendering the note before the seal is trivially
easy and produces a document that reads like a record and is not one.

## Decision

**The hand-over is plain text, over the platform share sheet, and only once
`sealedAt` is non-null.**

`documentText({ title, lines })` in the domain joins the same `PodLine[]` the
screen already renders. Not a second rendering — the test asserts the composed
lines are deep-equal to `document()`'s, because two renderings of one document
diverge and then a dispute has two versions of the truth.

`document()` takes `sealedAt: Date | null` as a **required** option and appends
a `Sealed` line when it is set. Required, not optional, so a caller has to
decide: a note with no seal on it is a draft, and from the outside a draft and
a record look identical.

On screen, before the seal, the hand-over button is **absent rather than
disabled**, with a line in its place saying what would bring it back. The seal
action itself is one card above it, so the forward path is on the same screen.

## Consequences

Text is the format every phone already receives — WhatsApp, SMS, email, a
paste into a chat with the consignee's clerk — with no dependency, no render
step, and no failure mode on a low-storage device. It works offline, because
composing it touches nothing but the trip already on the phone.

It also cannot carry the signature strokes or the photographs. That is the
real cost, and it is what a disputed delivery eventually needs; F4 in
`docs/FEATURE-BACKLOG.md` keeps a rendered file with the images on the list
rather than calling this finished.

`Share.share` rejects when no handler exists — a stripped ROM with no mail or
messaging app. That is caught and reported in the driver's language, with the
button still there to retry. A dismissed sheet resolves normally and is not a
failure.

The gate has a visible cost during the walkthrough: demo trips have no server,
so `sealedAt` is always null and the button never appears in the demo. The
feature is invisible to anyone evaluating the app without a backend. Making it
visible would mean the demo minting a seal it did not earn, which is the thing
this ADR exists to prevent.

The note's body is still English — only its title is translated. `PodLine.label`
is a string, not a `Phrase`, and the values interpolate numbers
(`11.4 km from the destination`). Translating it means splitting every line
into phrase-plus-number, which is a real refactor and is recorded in the
backlog rather than half-done here. What is shared today is character-for-
character what is on screen, which is the part that matters.
