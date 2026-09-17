# ADR-0024 — The delivery note is a file the phone writes, with no renderer

## Status

Accepted — 2026-09-17.

## Context

The note a consignee keeps is plain text, composed by `documentText()` from
the local draft (ADR-0018). Text was chosen because a PDF renderer is a
dependency a 2 GB handset with 400 MB free cannot afford, and it carries
neither the signature strokes nor the photographs — which are exactly what
a *disputed* delivery is argued from.

Adding a PDF library would reintroduce the cost that was refused. Rendering
HTML needs a web view, which is the same cost wearing different clothes.

A PDF that holds text, a few vector strokes and JPEG photographs is, on the
wire, a short list of objects and a cross-reference table. JPEG data goes in
verbatim under `DCTDecode`; strokes are `m`/`l` operators; text is Helvetica,
which every reader has. Writing that is a few hundred lines of pure
arithmetic and no dependency at all.

## Decision

**`documentPdf()` in the domain writes the note as PDF bytes**, from the same
`Delivery` that `documentText()` reads, plus what the domain has never looked
inside: the photographs as JPEG bytes and the signature as strokes. It is
pure — bytes in, bytes out, no clock, no platform — and it is tested by
reading its own output back: the objects it claims, the images it embeds,
the strokes it draws.

**The photographs and the strokes are the app's to supply, and today it
cannot.** Photo capture on the proof screen is a stand-in that mints an id
and takes no picture, and the signature is a name and a role with no pad
beneath it. So the file the app writes today carries the text, the hashes,
and an empty evidence page that says so — *no photograph was attached* is a
sentence in the document, not a missing page. When the camera and the pad
arrive they hand bytes to a function that is already waiting for them.

**The file is shared, not shown.** The phone has no PDF viewer of its own in
this app; it hands the file to whatever the consignee uses. The text note
stays, because a phone with no share target still needs to show something.

## Consequences

The disputed-delivery document exists as a format and a function, and the
gap between it and the real thing is exactly the camera and the pad, both
device work, both on the release list. Nothing has been added to the
dependency tree and nothing renders on the phone.

A hand-written PDF writer is a place bugs hide. It is kept small on purpose:
one font, one page size, no compression, no fonts embedded, no metadata
beyond a title — the least PDF that a reader opens. A reader that refuses it
is a bug in this file, and the test that parses the output is the first
line of defence.
