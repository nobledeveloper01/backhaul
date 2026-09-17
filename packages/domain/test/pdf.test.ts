import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { documentPdf, jpegSize, type Stroke } from '../src/pdf.ts';
import type { PodLine } from '../src/pod.ts';

/**
 * The writer, read back.
 *
 * ADR-0024's first line of defence: a hand-written PDF is a place bugs
 * hide, so the output is parsed the way a reader would parse it — the
 * cross-reference table, every object at the offset it claims, every
 * stream the length it claims — before anything is said about what it
 * holds.
 */

/** A JPEG that is nothing but a header: SOI, one SOF0 with a size, EOI. */
function tinyJpeg(width: number, height: number, components = 3): Uint8Array {
  const sof = [
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    components,
    // component specs, three bytes each
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ];
  // A comment segment first, so the scan has to skip one.
  const comment = [0xff, 0xfe, 0x00, 0x05, 0x68, 0x69, 0x21];
  return Uint8Array.from([0xff, 0xd8, ...comment, ...sof, 0xff, 0xd9]);
}

const LINES: readonly PodLine[] = [
  { label: 'Reference', value: 'BH-7A2C' },
  { label: 'Cargo', value: '40 bags of cement' },
  { label: 'Received by', value: 'Ṣola Adéyẹmí (storekeeper)' },
  { label: 'Captured', value: 'At the destination' },
];

const latin1 = (bytes: Uint8Array): string => {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return text;
};

/** The objects a reader would find, keyed by number, each at its claimed offset. */
function objects(bytes: Uint8Array): Map<number, { head: string; stream: Uint8Array | null }> {
  const text = latin1(bytes);
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.endsWith('%%EOF\n'));

  const startxref = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
  assert.ok(startxref, 'a startxref pointer');
  const xrefAt = Number(startxref[1]);
  assert.ok(text.slice(xrefAt).startsWith('xref\n'), 'startxref points at the table');

  const count = Number(/xref\n0 (\d+)\n/.exec(text.slice(xrefAt))![1]);
  const found = new Map<number, { head: string; stream: Uint8Array | null }>();
  const rows = text.slice(xrefAt).split('\n').slice(2, 2 + count);
  rows.forEach((row, index) => {
    if (index === 0) {
      assert.equal(row, '0000000000 65535 f ');
      return;
    }
    const offset = Number(row.slice(0, 10));
    const header = `${index} 0 obj\n`;
    assert.ok(text.startsWith(header, offset), `object ${index} is where the table says`);

    const bodyAt = offset + header.length;
    const streamAt = text.indexOf('stream\n', bodyAt);
    const endobj = text.indexOf('endobj\n', bodyAt);
    if (streamAt !== -1 && streamAt < endobj) {
      const head = text.slice(bodyAt, streamAt).trim();
      const length = Number(/\/Length (\d+)/.exec(head)![1]);
      const dataAt = streamAt + 'stream\n'.length;
      assert.equal(
        text.slice(dataAt + length, dataAt + length + '\nendstream\n'.length),
        '\nendstream\n',
        `object ${index}'s stream is the length it claims`,
      );
      found.set(index, { head, stream: bytes.slice(dataAt, dataAt + length) });
    } else {
      found.set(index, { head: text.slice(bodyAt, endobj).trim(), stream: null });
    }
  });
  return found;
}

describe('jpegSize', () => {
  test('reads the dimensions off the start-of-frame segment', () => {
    assert.deepEqual(jpegSize(tinyJpeg(640, 480)), { width: 640, height: 480, components: 3 });
    assert.deepEqual(jpegSize(tinyJpeg(2, 3, 1)), { width: 2, height: 3, components: 1 });
  });

  test('refuses what is not a JPEG', () => {
    assert.throws(() => jpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), /not a JPEG/);
    assert.throws(() => jpegSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), /start-of-frame/);
  });
});

describe('documentPdf', () => {
  test('writes a file a reader can walk, with the record and an empty evidence page', () => {
    // No title given: the domain's own, in the language the record is in.
    const bytes = documentPdf({ lines: LINES, photographs: [], signature: [] });
    const objs = objects(bytes);

    const pages = [...objs.values()].filter((o) => o.head.includes('/Type /Page '));
    assert.equal(pages.length, 2, 'the record, and the page that says no photograph was attached');

    const root = objs.get(1)!;
    assert.match(root.head, /\/Type \/Catalog/);
    assert.match(objs.get(2)!.head, /\/Count 2/);

    const streams = [...objs.values()].filter((o) => o.stream !== null).map((o) => latin1(o.stream!));
    const all = streams.join('\n');
    assert.ok(all.includes('(Delivery note) Tj'));
    assert.ok(all.includes('(Reference) Tj'));
    assert.ok(all.includes('(BH-7A2C) Tj'));
    assert.ok(all.includes('(No photograph was attached.) Tj'));
    assert.ok(all.includes('(No signature was drawn.) Tj'));

    // No image, no stroke.
    assert.ok(![...objs.values()].some((o) => o.head.includes('/Subtype /Image')));
    assert.ok(!/ l\n/.test(all));
  });

  test('embeds each photograph verbatim under DCTDecode with its own size', () => {
    const one = tinyJpeg(640, 480);
    const two = tinyJpeg(1200, 1600, 1);
    const bytes = documentPdf({
      title: 'Delivery note',
      lines: LINES,
      photographs: [one, two],
      signature: [],
    });
    const objs = objects(bytes);

    const images = [...objs.values()].filter((o) => o.head.includes('/Subtype /Image'));
    assert.equal(images.length, 2);
    assert.match(images[0]!.head, /\/Width 640 \/Height 480 \/ColorSpace \/DeviceRGB/);
    assert.match(images[1]!.head, /\/Width 1200 \/Height 1600 \/ColorSpace \/DeviceGray/);
    assert.match(images[0]!.head, /\/Filter \/DCTDecode/);
    assert.deepEqual(Array.from(images[0]!.stream!), Array.from(one));
    assert.deepEqual(Array.from(images[1]!.stream!), Array.from(two));

    const pages = [...objs.values()].filter((o) => o.head.includes('/Type /Page '));
    assert.equal(pages.length, 3, 'the record and one page per photograph');
    assert.ok(pages[1]!.head.includes('/Im0'));
    assert.ok(pages[2]!.head.includes('/Im1'));

    const all = [...objs.values()]
      .filter((o) => o.stream !== null)
      .map((o) => latin1(o.stream!))
      .join('\n');
    assert.ok(all.includes('(Photograph 1 of 2) Tj'));
    assert.ok(!all.includes('No photograph was attached'));
    // Fitted, never stretched: the drawn box keeps the photograph's ratio.
    const drawn = /(\d+(?:\.\d+)?) 0 0 (\d+(?:\.\d+)?) [\d.]+ [\d.]+ cm \/Im0 Do/.exec(all);
    assert.ok(drawn);
    assert.ok(Math.abs(Number(drawn[1]) / Number(drawn[2]) - 640 / 480) < 0.01);
  });

  test('draws the signature as the strokes it was, one move and the rest lines', () => {
    const signature: Stroke[] = [
      { points: [{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.2 }, { x: 0.5, y: 0.8 }] },
      { points: [{ x: 0.6, y: 0.5 }, { x: 0.9, y: 0.5 }] },
    ];
    const bytes = documentPdf({ title: 'Delivery note', lines: LINES, photographs: [], signature });
    const objs = objects(bytes);
    const first = latin1([...objs.values()].find((o) => o.stream !== null)!.stream!);

    assert.equal((first.match(/ m\n/g) ?? []).length, 2, 'one move per stroke');
    assert.equal((first.match(/ l\n/g) ?? []).length, 3, 'one line per following point');
    assert.ok(!first.includes('No signature was drawn'));
  });

  test('writes a name the font cannot hold as the letters it can', () => {
    const bytes = documentPdf({ title: 'Delivery note', lines: LINES, photographs: [], signature: [] });
    const text = latin1(bytes);
    // Ṣola Adéyẹmí: the dots below go, the acute on é stays (Latin-1 has it).
    assert.ok(text.includes('(Sola Ad\xe9yem\xed \\(storekeeper\\)) Tj'));
  });

  test('refuses a photograph that is not a JPEG rather than writing a file that claims one', () => {
    assert.throws(
      () =>
        documentPdf({
          title: 'Delivery note',
          lines: LINES,
          photographs: [Uint8Array.from([0x89, 0x50, 0x4e, 0x47])],
          signature: [],
        }),
      /not a JPEG/,
    );
  });
});
