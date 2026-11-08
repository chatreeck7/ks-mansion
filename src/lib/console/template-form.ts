import {
  TEMPLATE_BLOCK_KINDS,
  type TemplateBlock,
  type TemplateBlockDraft,
  type TemplateBlockKind,
  type TemplateDocType,
} from '@/lib/models/document-template';
import { SETTING_DEFINITIONS, type SettingKey, type SettingValues } from '@/lib/models/settings';

/**
 * Form posts from แม่แบบเอกสาร to the writes they mean (KS-31).
 *
 * Only **what changed** comes back: the page posts every field at once, and
 * writing all thirty-odd blocks on each save would spend the Sheets write
 * quota restating text nobody touched — and, worse, overwrite a cell someone
 * fixed in the sheet a minute ago with the stale copy the page was showing.
 */

const text = (form: FormData, field: string): string | null => {
  const value = form.get(field);
  return value === null ? null : String(value);
};

/** Normalises line endings so a browser's `\r\n` is not a "change". */
const clean = (value: string): string => value.replace(/\r\n/g, '\n').trim();

export function settingChangesFromForm(
  form: FormData,
  current: SettingValues,
): Array<{ key: SettingKey; value: string }> {
  const changes: Array<{ key: SettingKey; value: string }> = [];
  for (const definition of SETTING_DEFINITIONS) {
    const posted = text(form, `setting.${definition.key}`);
    if (posted === null) continue;
    const value = clean(posted);
    if (value !== clean(current[definition.key])) changes.push({ key: definition.key, value });
  }
  return changes;
}

export interface BlockChange {
  id: string;
  changes: Partial<TemplateBlockDraft>;
  archive: boolean;
}

export function blockChangesFromForm(form: FormData, blocks: readonly TemplateBlock[]): BlockChange[] {
  const result: BlockChange[] = [];
  for (const block of blocks) {
    const prefix = `block.${block.id}.`;
    const changes: Partial<TemplateBlockDraft> = {};
    for (const field of ['heading', 'body', 'extra'] as const) {
      const posted = text(form, prefix + field);
      if (posted !== null && clean(posted) !== clean(block[field])) changes[field] = clean(posted);
    }
    const position = text(form, prefix + 'position');
    if (position !== null && position.trim() !== '' && Number(position) !== block.position) {
      changes.position = Number(position);
    }
    const archive = form.get(prefix + 'archive') === 'on';
    if (archive || Object.keys(changes).length > 0) result.push({ id: block.id, changes, archive });
  }
  return result;
}

/** The "add a block" form, or null when nothing was typed into it. */
export function newBlockFromForm(
  form: FormData,
  blocks: readonly TemplateBlock[],
  docType: TemplateDocType = 'contract',
): TemplateBlockDraft | null {
  const body = clean(text(form, 'new.body') ?? '');
  const heading = clean(text(form, 'new.heading') ?? '');
  const kindRaw = text(form, 'new.kind') ?? 'clause';
  if (body === '' && heading === '') return null;
  const kind: TemplateBlockKind = (TEMPLATE_BLOCK_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as TemplateBlockKind)
    : 'clause';
  const positionRaw = (text(form, 'new.position') ?? '').trim();
  const last = blocks.reduce((max, block) => Math.max(max, block.position), 0);
  return {
    docType,
    kind,
    heading,
    body,
    extra: clean(text(form, 'new.extra') ?? ''),
    // Blank means "at the end", the commonest case.
    position: positionRaw === '' ? last + 10 : Number(positionRaw),
  };
}

/**
 * ↑ / ↓ on a block: swap its position with its neighbour's. Two writes, no
 * renumbering — the 10, 20, 30 gaps stay as they were.
 */
export function moveChanges(
  blocks: readonly TemplateBlock[],
  id: string,
  direction: 'up' | 'down',
): Array<{ id: string; position: number }> {
  const ordered = [...blocks].filter((b) => !b.archived).sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((block) => block.id === id);
  const other = ordered[direction === 'up' ? index - 1 : index + 1];
  const self = ordered[index];
  if (!self || !other) return [];
  if (self.position === other.position) {
    // Equal numbers cannot be swapped into an order; nudge instead.
    return [{ id: self.id, position: other.position + (direction === 'up' ? -1 : 1) }];
  }
  return [
    { id: self.id, position: other.position },
    { id: other.id, position: self.position },
  ];
}

const sameBlock = (a: Pick<TemplateBlockDraft, 'kind' | 'heading' | 'body'>, b: Pick<TemplateBlockDraft, 'kind' | 'heading' | 'body'>) =>
  a.kind === b.kind && clean(a.heading) === clean(b.heading) && clean(a.body) === clean(b.body);

/**
 * The built-in blocks a document is still missing, when what is in the
 * sheet is only part of the built-in wording — a copy that stopped half
 * way. Empty once anyone has written a block of their own, so a document
 * someone has edited is never "topped up" behind their back.
 *
 * A missing block keeps its built-in position when that number is free,
 * so the copy lands in the order it was meant to.
 */
export function missingDefaultBlocks(
  blocks: readonly TemplateBlock[],
  defaults: readonly TemplateBlockDraft[],
): TemplateBlockDraft[] {
  const live = blocks.filter((block) => !block.archived);
  if (!live.every((block) => defaults.some((d) => sameBlock(block, d)))) return [];
  const taken = new Set(live.map((block) => block.position));
  let last = Math.max(0, ...live.map((block) => block.position), ...defaults.map((d) => d.position));
  return defaults
    .filter((d) => !live.some((block) => sameBlock(block, d)))
    .map((d) => {
      if (!taken.has(d.position)) {
        taken.add(d.position);
        return d;
      }
      last += 10;
      return { ...d, position: last };
    });
}
