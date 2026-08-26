/**
 * Money.
 *
 * Kobo, as integers, for the same reason Grid uses them: a float in a figure
 * somebody has to defend is a rounding error waiting to be argued about. A
 * haulage invoice is settled between two businesses who will both check it.
 *
 * The brand is not decoration. `Kobo` and `Naira` are both `number` at
 * runtime, and passing one where the other is expected is a hundredfold error
 * that no test catches unless the numbers happen to be checked. The brand
 * makes it a compile error instead.
 */

declare const KOBO: unique symbol;

/** An amount in kobo. 100 kobo = ₦1. */
export type Kobo = number & { readonly [KOBO]: true };

export const ZERO = 0 as Kobo;

export function kobo(value: number): Kobo {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Kobo must be a whole number, got ${value}.`);
  }
  return value as Kobo;
}

/**
 * Naira to kobo.
 *
 * Rounds, because the input is money a human typed and `9.99 * 100` is
 * 998.9999999999999 in IEEE 754. Truncating there loses a kobo on almost every
 * amount with a decimal in it.
 */
export function fromNaira(naira: number): Kobo {
  return Math.round(naira * 100) as Kobo;
}

export function add(...amounts: readonly Kobo[]): Kobo {
  return amounts.reduce<number>((sum, a) => sum + a, 0) as Kobo;
}

export function subtract(a: Kobo, b: Kobo): Kobo {
  return (a - b) as Kobo;
}

/** Multiplies by a plain number and rounds back to whole kobo. */
export function scale(amount: Kobo, factor: number): Kobo {
  return Math.round(amount * factor) as Kobo;
}

/**
 * A percentage of an amount, in whole kobo.
 *
 * Rounds half away from zero rather than JavaScript's half-up, so a
 * commission on a refund is the same size as the commission on the charge.
 * `Math.round(-0.5)` is `-0`, which quietly makes the two differ by a kobo in
 * a direction that always favours the same party.
 */
export function percent(amount: Kobo, pct: number): Kobo {
  const exact = (amount * pct) / 100;
  return (Math.sign(exact) * Math.round(Math.abs(exact))) as Kobo;
}

/**
 * Rounds to a step a human would actually say.
 *
 * Indicative figures only. A range of "₦1,861,487 – ₦2,678,725" is arithmetic
 * pretending to be a quote: every digit after the first three is precision the
 * estimate does not have, and a haulier reading it either laughs or believes
 * it, and both are bad.
 *
 * Found by looking at a rendered screen, not by a test — which is where this
 * class of defect always turns up.
 */
export function roundTo(amount: Kobo, stepKobo: number): Kobo {
  if (stepKobo <= 0) return amount;
  return (Math.round(amount / stepKobo) * stepKobo) as Kobo;
}

export const NAIRA = '₦';

/** Kobo per naira — and the unit everything user-facing is rounded to. */
export const SETTLEMENT_UNIT = 100;

/**
 * Formats for display: `₦1,250,000`.
 *
 * Whole naira. Kobo appear nowhere in this product's interface — no haulage
 * invoice in Nigeria is settled to the kobo, and showing them implies a
 * precision the negotiation never had.
 */
export function format(amount: Kobo): string {
  const naira = Math.round(amount / 100);
  return NAIRA + naira.toLocaleString('en-NG');
}

/**
 * The same figure with no separator between sign and digits.
 *
 * Grid learned this the hard way: a narrow no-break space between `₦` and the
 * amount is still Unicode whitespace, and a PDF renderer will happily break a
 * line there, leaving the sign orphaned at the end of one line and the amount
 * at the start of the next.
 */
export function formatTight(amount: Kobo): string {
  return format(amount).replace(/\s/g, '');
}
