import { describe, expect, it } from 'vitest';
import { cycleIssuedIn } from '@/lib/models/billing-cycle';
import {
  DOCUMENT_TYPE_IDS,
  documentTypesFor,
  includeParam,
  isReady,
  selectedDocuments,
  selectionFrom,
  type DocumentTypeId,
} from './document-types';

const CYCLE = cycleIssuedIn(2026, 7);
const TYPES = documentTypesFor(CYCLE);

describe('the registry', () => {
  /**
   * AC-4.1 names five document types. Two are built; the others are listed
   * anyway, because a selector showing only what exists looks finished and
   * is not.
   */
  it('carries every document type AC-4.1 names', () => {
    expect(TYPES.map((type) => type.id)).toEqual([...DOCUMENT_TYPE_IDS]);
  });

  it('marks the two that are built, and only those', () => {
    expect(TYPES.filter(isReady).map((type) => type.id)).toEqual(['bills', 'collection']);
  });

  it('points a built document at the cycle it was asked for', () => {
    const bills = TYPES.find((type) => type.id === 'bills')!;

    expect(bills.availability).toMatchObject({ ready: true });
    expect((bills.availability as { href: string }).href).toContain('cycle=2026-08');
  });

  it('names the cycle in the bill run description, since that is what it covers', () => {
    expect(TYPES.find((type) => type.id === 'bills')!.description).toContain('26 ส.ค. 2569');
  });

  /**
   * "Why can't I tick this" has to be answerable from the screen. Every
   * unbuilt type carries both a reason an admin can read and the card that
   * would build it.
   */
  it('gives every unbuilt type a reason and something to chase', () => {
    for (const type of TYPES.filter((candidate) => !isReady(candidate))) {
      const blocked = type.availability as { reason: string; blockedBy: string };
      expect(blocked.reason, `${type.id} needs a reason`).not.toBe('');
      expect(blocked.blockedBy, `${type.id} needs a blocker`).not.toBe('');
    }
  });

  /**
   * A combined export (KS-30) cannot assume one date range covers everything
   * it was handed: a maintenance log is a running record and an evaluation
   * belongs to a person, not to a month.
   */
  it('says which documents are scoped to a cycle and which are not', () => {
    const perCycle = TYPES.filter((type) => type.perCycle).map((type) => type.id);

    expect(perCycle).toEqual(['bills', 'collection', 'movements']);
  });
});

describe('selectionFrom', () => {
  /** Arriving at the page: the month's paperwork, ready to go. */
  it('ticks everything producible when there is no ?include= at all', () => {
    expect(selectionFrom(null, TYPES)).toEqual(['bills', 'collection']);
  });

  /**
   * Present but empty is an admin who unticked everything. Re-ticking the
   * lot for them would be the screen arguing with the person using it.
   */
  it('selects nothing for an empty ?include=, rather than falling back', () => {
    expect(selectionFrom('', TYPES)).toEqual([]);
  });

  it('keeps registry order whatever order the parameter lists', () => {
    expect(selectionFrom('collection,bills', TYPES)).toEqual(['bills', 'collection']);
  });

  it('tolerates spaces and stray commas', () => {
    expect(selectionFrom(' bills , , collection ', TYPES)).toEqual(['bills', 'collection']);
  });

  /** A stale bookmark naming a renamed type should still show the rest. */
  it('drops an unknown id instead of refusing the whole selection', () => {
    expect(selectionFrom('bills,ledger-of-doom', TYPES)).toEqual(['bills']);
  });

  /**
   * An unbuilt type can legitimately be named — a bookmark from before it
   * was dropped. It stays in the selection so the checkbox reads back, and
   * `selectedDocuments` is what refuses to link to it.
   */
  it('keeps an unbuilt id in the selection', () => {
    expect(selectionFrom('bills,maintenance', TYPES)).toEqual(['bills', 'maintenance']);
  });
});

describe('selectedDocuments', () => {
  it('resolves a selection to the documents behind it', () => {
    const docs = selectedDocuments(['collection'], TYPES);

    expect(docs.map((doc) => doc.id)).toEqual(['collection']);
    expect(docs[0]!.availability).toMatchObject({ ready: true });
  });

  /** Never a link to a page that does not exist. */
  it('drops an unbuilt type even when it was asked for', () => {
    expect(selectedDocuments(['bills', 'maintenance'], TYPES).map((d) => d.id)).toEqual([
      'bills',
    ]);
  });

  it('is empty for an empty selection', () => {
    expect(selectedDocuments([], TYPES)).toEqual([]);
  });
});

describe('includeParam', () => {
  it('round-trips a selection through the URL', () => {
    const selection: DocumentTypeId[] = ['bills', 'collection'];

    expect(selectionFrom(includeParam(selection, TYPES), TYPES)).toEqual(selection);
  });

  /**
   * Registry order, not click order, so two admins who ticked the same boxes
   * in a different sequence share one URL.
   */
  it('writes registry order whatever order the selection came in', () => {
    expect(includeParam(['collection', 'bills'], TYPES)).toBe('bills,collection');
  });

  /**
   * The empty string is the whole point of the absent/empty distinction:
   * unticking everything has to produce a URL that says so.
   */
  it('writes an empty string for an empty selection', () => {
    expect(includeParam([], TYPES)).toBe('');
    expect(selectionFrom('', TYPES)).toEqual([]);
  });
});
