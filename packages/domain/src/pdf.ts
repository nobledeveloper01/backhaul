import type { PodLine } from './pod.ts';

/**
 * The delivery note as a file, written with no renderer.
 *
 * A PDF that holds text, a few vector strokes and JPEG photographs is, on
 * the wire, a short list of objects and a cross-reference table. This
 * writes exactly that and nothing more: one font, one page size, no
 * compression, no embedded fonts, no metadata beyond a title — the least
 * PDF a reader opens. Every byte is arithmetic; nothing here reads a clock
 * or touches a platform, which is what lets a test read the output back.
 * See ADR-0024.
 *
 * What it will not do is grow. A hand-written PDF writer is a place bugs
 * hide, and every feature added to it is a place more. If the note ever
 * needs a second font, a table, or a page that flows, the answer is a
 * library and this file is what it replaces.
 */

/** One stroke of a signature, in a unit square: `0,0` top-left, `1,1` bottom-right. */
export interface Stroke {
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

/**
 * The heading, in the language the record is in.
 *
 * English, like every label `document()` writes: the file is the record, and
 * the record is one thing wherever it is read. The note the driver hands
 * over as text carries the reader's own language; see `winAnsi` for the
 * other reason this file cannot.
 */
export const DELIVERY_NOTE_TITLE = 'Delivery note';

export interface PdfDocument {
  /** The heading on the first page and the file's title. `DELIVERY_NOTE_TITLE` unless said otherwise. */
  readonly title?: string;
  /** The record, from `document()`. Labels and values, in order. */
  readonly lines: readonly PodLine[];
  /** JPEG bytes, one photograph each, in the order they were taken. */
  readonly photographs: readonly Uint8Array[];
  /** The signature as drawn, or empty when nobody drew one. */
  readonly signature: readonly Stroke[];
}

/** A4, in points. The Nigerian office prints A4. */
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;
const BODY = 11;
const LEADING = 18;

/**
 * The size of a JPEG, read off its own header.
 *
 * A PDF needs `/Width` and `/Height` beside the bytes, and the bytes already
 * say: every JPEG carries a start-of-frame segment with its dimensions and
 * its component count. Reading it here is what lets the photograph go into
 * the file verbatim, with no decoder and no re-encode. Throws on anything
 * that is not a JPEG, because a file that claims an image it cannot read is
 * worse than none.
 */
export function jpegSize(bytes: Uint8Array): {
  readonly width: number;
  readonly height: number;
  readonly components: number;
} {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('not a JPEG: no SOI marker');
  }

  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1] ?? 0;
    // Padding and the markers with no payload.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2;
      continue;
    }
    if (marker === 0xd9) break;

    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    const startOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) {
      if (at + 9 >= bytes.length) break;
      const height = ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0);
      const width = ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0);
      const components = bytes[at + 9] ?? 0;
      if (width === 0 || height === 0) throw new Error('not a JPEG: empty frame');
      return { width, height, components };
    }
    at += 2 + length;
  }

  throw new Error('not a JPEG: no start-of-frame segment');
}

/**
 * Text as the file's one font can show it.
 *
 * Helvetica with WinAnsi encoding is the font every reader has without
 * anything embedded, and it stops at Latin-1. A name with a Yorùbá tone
 * mark or an Igbo dot below loses the mark here rather than becoming a box:
 * `Ṣola` is written `Sola`, which a reader can still read. The note the
 * driver hands over as text keeps the reader's own language and every mark
 * in it; this file is the record, and the record is in English.
 */
function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const char of text.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0x3f;
    if (code < 0x20 && code !== 0x09) continue;
    if (code <= 0xff) {
      out.push(code);
      continue;
    }
    // Outside Latin-1: keep the base letter, drop the mark. `é` never gets
    // here — it is one Latin-1 code point — so only the marks the font truly
    // lacks are lost.
    const base = char.normalize('NFD').codePointAt(0) ?? 0x3f;
    out.push(base <= 0xff ? base : 0x3f);
  }
  return out;
}

/** A string operand for a content stream, escaped. */
function literal(text: string): number[] {
  const out: number[] = [0x28];
  for (const code of winAnsi(text)) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out.push(0x5c);
    out.push(code);
  }
  out.push(0x29);
  return out;
}

function ascii(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i) & 0xff);
  return out;
}

/** A number as PDF writes it: no exponent, no trailing zeros, no `-0`. */
function num(value: number): string {
  const fixed = value.toFixed(2).replace(/\.?0+$/, '');
  return fixed === '-0' ? '0' : fixed;
}

/**
 * Helvetica's widths, near enough for a right edge.
 *
 * The real metrics are per glyph; this uses one average so a value that is
 * too long for the line wraps instead of running off the page. A wrap a few
 * characters early is invisible; text off the edge is a field that is not
 * on the record.
 */
const AVERAGE_GLYPH = 0.52;

function wrap(text: string, size: number, width: number): string[] {
  const perLine = Math.max(8, Math.floor(width / (size * AVERAGE_GLYPH)));
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (next.length > perLine && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length === 0 ? [''] : lines;
}

/** One content stream, built as bytes because a string cannot hold the image data beside it. */
class Content {
  private readonly parts: number[][] = [];

  op(text: string): void {
    this.parts.push(ascii(`${text}\n`));
  }

  text(font: 'F1' | 'F2', size: number, x: number, y: number, value: string): void {
    this.parts.push(
      ascii(`BT /${font} ${num(size)} Tf ${num(x)} ${num(y)} Td `),
      literal(value),
      ascii(' Tj ET\n'),
    );
  }

  bytes(): number[] {
    return this.parts.flat();
  }
}

interface Obj {
  readonly head: string;
  readonly stream: number[] | null;
}

/**
 * Writes the note.
 *
 * Page one is the record and the signature; the pages after it are the
 * photographs, one to a page, or one page that says none was attached.
 * That sentence is in the document on purpose: a reader who gets a note
 * with no photographs must be told that is what happened rather than
 * wonder whether a page went missing.
 */
export function documentPdf(doc: PdfDocument): Uint8Array {
  const title = doc.title ?? DELIVERY_NOTE_TITLE;
  const objects: Obj[] = [];
  const add = (head: string, stream: number[] | null = null): number => {
    objects.push({ head, stream });
    return objects.length;
  };

  // 1 catalog, 2 pages — filled in once the kids are known.
  add('');
  add('');
  const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  );
  const fonts = `/Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>`;
  const pages: number[] = [];

  const page = (content: Content, xobjects = ''): void => {
    const streamNo = add('', content.bytes());
    pages.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
          `/Resources << ${fonts} ${xobjects} >> /Contents ${streamNo} 0 R >>`,
      ),
    );
  };

  // --- page one: the record ---------------------------------------------
  const first = new Content();
  let y = PAGE_H - MARGIN - 18;
  first.text('F2', 18, MARGIN, y, title);
  y -= LEADING * 2;

  const valueX = MARGIN + 130;
  for (const line of doc.lines) {
    const lines = wrap(line.value, BODY, PAGE_W - MARGIN - valueX);
    first.text('F2', BODY, MARGIN, y, line.label);
    for (const piece of lines) {
      first.text('F1', BODY, valueX, y, piece);
      y -= LEADING;
    }
  }

  // The signature, in a box, as the strokes were drawn. Below the record
  // and above the foot of the page; the box is the one thing on this page
  // a reader compares to something outside it.
  y -= LEADING;
  const boxW = 240;
  const boxH = 90;
  const boxX = MARGIN;
  const boxY = Math.max(MARGIN, y - boxH);
  first.text('F2', BODY, MARGIN, boxY + boxH + 6, 'Signature');
  first.op(`0.6 G 0.5 w ${num(boxX)} ${num(boxY)} ${num(boxW)} ${num(boxH)} re S`);

  if (doc.signature.length === 0 || doc.signature.every((s) => s.points.length === 0)) {
    first.text('F1', BODY, boxX + 8, boxY + boxH / 2 - 4, 'No signature was drawn.');
  } else {
    first.op('0 G 1.2 w 1 J 1 j');
    for (const stroke of doc.signature) {
      stroke.points.forEach((point, index) => {
        const px = boxX + Math.min(1, Math.max(0, point.x)) * boxW;
        const py = boxY + boxH - Math.min(1, Math.max(0, point.y)) * boxH;
        first.op(`${num(px)} ${num(py)} ${index === 0 ? 'm' : 'l'}`);
      });
      first.op('S');
    }
  }
  page(first);

  // --- the evidence --------------------------------------------------------
  if (doc.photographs.length === 0) {
    const empty = new Content();
    empty.text('F2', 14, MARGIN, PAGE_H - MARGIN - 14, 'Photographs');
    empty.text('F1', BODY, MARGIN, PAGE_H - MARGIN - 14 - LEADING * 2, 'No photograph was attached.');
    page(empty);
  }

  doc.photographs.forEach((jpeg, index) => {
    const size = jpegSize(jpeg);
    const colour =
      size.components === 1 ? '/DeviceGray' : size.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    const image = add(
      `<< /Type /XObject /Subtype /Image /Width ${size.width} /Height ${size.height} ` +
        `/ColorSpace ${colour} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`,
      Array.from(jpeg),
    );

    // Fitted inside the margins, never stretched: a photograph of a seal
    // that has been scaled unevenly is a photograph somebody can argue with.
    const maxW = PAGE_W - MARGIN * 2;
    const maxH = PAGE_H - MARGIN * 2 - LEADING * 2;
    const scale = Math.min(maxW / size.width, maxH / size.height);
    const drawW = size.width * scale;
    const drawH = size.height * scale;
    const drawX = MARGIN + (maxW - drawW) / 2;
    const drawY = PAGE_H - MARGIN - LEADING * 2 - drawH;

    const shot = new Content();
    shot.text(
      'F2',
      14,
      MARGIN,
      PAGE_H - MARGIN - 14,
      `Photograph ${index + 1} of ${doc.photographs.length}`,
    );
    shot.op(`q ${num(drawW)} 0 0 ${num(drawH)} ${num(drawX)} ${num(drawY)} cm /Im${index} Do Q`);
    page(shot, `/XObject << /Im${index} ${image} 0 R >>`);
  });

  // --- the file ------------------------------------------------------------
  objects[0] = { head: '<< /Type /Catalog /Pages 2 0 R >>', stream: null };
  objects[1] = {
    head: `<< /Type /Pages /Kids [${pages.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    stream: null,
  };
  const info = add('<< /Title ' + String.fromCharCode(...literal(title)) + ' >>');

  const out: number[] = [];
  const push = (bytes: number[]) => {
    for (const b of bytes) out.push(b);
  };

  // The second line is the conventional four high bytes that tell a
  // transfer program this file is binary; without them a mail gateway may
  // "fix" the line endings inside the JPEG data.
  push(ascii('%PDF-1.4\n%âãÏÓ\n'));

  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(out.length);
    push(ascii(`${index + 1} 0 obj\n`));
    if (obj.stream === null) {
      push(ascii(`${obj.head}\n`));
    } else {
      const head = obj.head.length === 0 ? `<< /Length ${obj.stream.length} >>` : obj.head;
      push(ascii(`${head}\nstream\n`));
      push(obj.stream);
      push(ascii('\nendstream\n'));
    }
    push(ascii('endobj\n'));
  });

  const xref = out.length;
  push(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (const offset of offsets) push(ascii(`${String(offset).padStart(10, '0')} 00000 n \n`));
  push(
    ascii(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\n` +
        `startxref\n${xref}\n%%EOF\n`,
    ),
  );

  return Uint8Array.from(out);
}
