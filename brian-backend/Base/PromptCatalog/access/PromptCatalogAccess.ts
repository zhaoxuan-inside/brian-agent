import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import { PROMPT_TEMPLATE_TABLE } from '../../PromptsProvider/domain/types';
import { BUILTIN_PROMPTS } from '../catalog';
import type { BuiltinPromptDef } from '../catalog';
import { createHash } from 'crypto';

export class PromptCatalogAccess {
  constructor(private readonly relationDb: RelationDBAccess) {}

  

  async seed(): Promise<void> {
    const now = IdGenerator.now();
    for (const def of BUILTIN_PROMPTS) {
      await this.seedOne(def, now);
    }
  }

  
  
  
  
  
  
  
  
  
  
  
  
  
  

  
  
  
  
  
  
  private async seedOne(def: BuiltinPromptDef, now: number): Promise<void> {
    const canonicalHash = md5(def.template);
    const existing = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: def.id },
    ]) as Record<string, unknown> | null;
    if (existing) {
      await this.refreshUnchanged(existing, def, canonicalHash);
    }
    const legacy = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.EQ, value: def.title },
      { field: 'is_system', operator: Operator.EQ, value: 1 },
    ]) as Record<string, unknown> | null;
    if (legacy) {
      await this.refreshUnchanged(legacy, def, canonicalHash);
      return;
    }
    if (existing) {
      return;
    }
    await this.relationDb.insert(PROMPT_TEMPLATE_TABLE, this.toInsertFields(def, now, canonicalHash));
  }

  

  
  
  private async refreshUnchanged(existing: Record<string, unknown>, def: BuiltinPromptDef, canonicalHash: string): Promise<void> {
    const contentMd5 = md5(String(existing['prompt_template'] ?? ''));
    const untouched = contentMd5 === String(existing.seed_hash ?? '')
      || (def.retiredHashes ?? []).includes(contentMd5);
    const emptyHash = !String(existing.seed_hash ?? '');
    const isSystem = Number(existing.is_system ?? 0) === 1;
    if (!(untouched || emptyHash) || !isSystem) {
      return;
    }
    await this.relationDb.update(
      PROMPT_TEMPLATE_TABLE,
      [
        { field: 'prompt_template', value: def.template },
        { field: 'seed_hash', value: canonicalHash },
      ],
      [{ field: 'id', operator: Operator.EQ, value: String(existing['id']) }],
    );
  }

  
  private toInsertFields(def: BuiltinPromptDef, now: number, canonicalHash: string): Array<{ field: string; value: unknown }> {
    return [
      { field: 'id', value: def.id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'prompt_template_title', value: def.title },
      { field: 'prompt_template_brief', value: def.brief ?? '' },
      { field: 'prompt_template', value: def.template },
      { field: 'is_system', value: 1 },
      { field: 'seed_hash', value: canonicalHash },
      { field: 'enable', value: 1 },
    ];
  }
}

function md5(text: string): string {
  return createHash('md5').update(text ?? '').digest('hex');
}
