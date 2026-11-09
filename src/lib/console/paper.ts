/**
 * The paper every console document is laid out on — one stylesheet with two
 * readers, so the page on screen is the page that prints:
 *
 * - Paged.js (paper-viewer.ts) lays the document out into these A4 sheets
 *   for the screen;
 * - Chrome's own print engine reads the same rules (PrintShell puts them in
 *   an @media print block) — it handles margin boxes, page counts and a
 *   landscape sheet among portrait ones natively, which Paged.js cannot.
 *
 * Documents opt into a sheet and breaks with the classes at the bottom.
 * Kept as a string here rather than a .css file: it is data for the two
 * engines, never a stylesheet of the console page itself (a second copy in
 * the page would add the margins again).
 */
const PAPER_CSS = `/*
 * The paper every console document is laid out on — handed to Paged.js by
 * src/lib/console/paper-viewer.ts, so the page on screen is the page that
 * prints: the same A4 box, margins, breaks and running header/footer.
 *
 * Deliberately NOT loaded into the document itself: Paged.js turns these
 * into page boxes; a second copy in the page would add its margins again.
 * Documents opt into a page kind and breaks with the classes at the bottom.
 * __HEADER__ is replaced with "<building> · <document title>".
 *
 * Two readers, one sheet: Paged.js lays it out for the screen, and Chrome's
 * own print engine reads the same rules (wrapped in @media print by
 * PrintShell) for the printer — Chrome handles margin boxes, page counts and
 * a landscape sheet among portrait ones natively; Paged.js cannot mix sheet
 * sizes, so it only draws the preview.
 */

@page {
  size: A4;
  margin: 17mm 14mm 15mm 14mm;

  @top-left {
    content: "__HEADER__";
    font-family: Sarabun, 'Noto Sans Thai', sans-serif;
    font-size: 8.5pt;
    color: #4e5566;
    vertical-align: bottom;
    padding-bottom: 3mm;
  }
  @bottom-right {
    content: "หน้า " counter(page) " / " counter(pages);
    font-family: Sarabun, 'Noto Sans Thai', sans-serif;
    font-size: 8.5pt;
    color: #4e5566;
    vertical-align: top;
    padding-top: 3mm;
  }
}

/* What a tenant is handed — bill, receipt, contract — carries no running
   header or page count: it is a document of its own, not a page of ours. */
@page tenant {
  margin: 12mm 14mm;
  @top-left { content: none; }
  @bottom-right { content: none; }
}

/* Two bills to a sheet, cut on the dashed line. */
@page half {
  margin: 8mm 10mm;
  @top-left { content: none; }
  @bottom-right { content: none; }
}

/* The yearly maintenance grid. */
@page landscape {
  size: A4 landscape;
  margin: 15mm 12mm 13mm 12mm;
}

.paper-tenant { page: tenant; }
.paper-half { page: half; }
.paper-landscape { page: landscape; }


.paper-break { break-before: page; }
.paper-avoid { break-inside: avoid; }
`;

/** The paper stylesheet with its running header ("<building> · <title>") filled in. */
export function paperStylesheet(header: string): string {
  const safe = header.replace(/["\\\n]/g, ' ').trim();
  return PAPER_CSS.replaceAll('__HEADER__', safe);
}
