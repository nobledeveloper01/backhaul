# ADR-0004 — Money is integer kobo, and shown in whole naira

## Status

Accepted — 2026-08-26.

## Context

Freight settlements are between two businesses who will both check the
arithmetic. A rounding error in a figure somebody has to defend is a rounding
error somebody has to defend.

Grid reached the same decision, and then learned a second half of it on a
rendered page rather than in a test: allocating a split to the kobo is
arithmetically correct and produces figures that visibly do not add up beside a
claim that they balance. Three shares of ₦65,096 rendered as ₦39,058, ₦13,019
and ₦13,019 — correct to the kobo, wrong on the page.

## Decision

All money is `Kobo`: integers, branded so that passing a naira figure where
kobo is expected is a compile error rather than a hundredfold mistake.

Displayed figures are **whole naira**. No haulage invoice in Nigeria is settled
to the kobo, and showing kobo implies a precision the negotiation never had.
Every line of a settlement is rounded to the naira before it is shown, so the
lines add up to each other on screen as well as in the arithmetic.

`percent` rounds half away from zero rather than JavaScript's half-up, so a
commission on a refund is the same size as the commission on the charge.
`Math.round(-0.5)` is `-0`, which makes the two differ by a kobo in a direction
that always favours the same party.

`formatTight` exists because a narrow no-break space between the sign and the
amount is still Unicode whitespace, and a PDF renderer will break a line there
and orphan the `₦`.

## Consequences

Arithmetic is exact and reviewable. Nothing in the product ever displays a
fraction of a naira.

Rounding to the naira means the platform's commission is at most 99 kobo away
from the exact percentage. That is stated rather than hidden, and it is the
correct trade: a figure everyone can check beats a figure that is exactly right
and looks wrong.

Backhaul does not hold money — the product statement is explicit that this is
not a payments or escrow business. A `Settlement` is a statement of what each
party is owed, produced so both sides are reading the same figures. Parties
settle directly.
