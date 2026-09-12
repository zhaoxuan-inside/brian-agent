/**
 * @fileoverview PromptCatalog 接入层：内置 Prompt 幂等种子化。
 *
 * 将 {@link BUILTIN_PROMPTS} 全部内置 Prompt 以稳定 ID 写入 prompt_template 表：
 * - 新 builtin ID → 插入（is_system=1, seed_hash=md5(template)）；
 * - 已有行：`seed_hash` 记录上次种子化的模板指纹 ——
 *   - 行模板 md5 == seed_hash（用户未编辑）→ **跟随代码更新**到最新 canonical 模板并刷新 seed_hash；
 *   - 行模板 md5 != seed_hash（用户已编辑）→ **保留用户版本**，仅补 seed_hash 为用户版指纹；
 * - is_system 由 PromptsSchemaInitializer 迁移统一维护。
 *
 * 说明：种子化在 PromptsAccess.initialize() 中执行一次。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import { PROMPT_TEMPLATE_TABLE } from '../../PromptsProvider/domain/types';
import { BUILTIN_PROMPTS } from '../catalog';
import type { BuiltinPromptDef } from '../catalog';
import { createHash } from 'crypto';

export class PromptCatalogAccess {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 幂等写入全部内置 Prompt（用户未编辑的行随代码升级刷新，编辑过的保留用户版本）。
   */
  async seed(): Promise<void> {
    const now = IdGenerator.now();
    for (const def of BUILTIN_PROMPTS) {
      await this.seedOne(def, now);
    }
  }

  /** 单条种子（逻辑控制）：缺失即插入；已存在行按 seed_hash 判定是否刷新模板 */
  private async seedOne(def: BuiltinPromptDef, now: number): Promise<void> {
    const canonicalHash = md5(def.template);
    const existing = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: def.id },
    ]) as Record<string, unknown> | null;
    if (existing) {
      await this.refreshUnchanged(existing, def, canonicalHash);
      return;
    }
    await this.relationDb.insert(PROMPT_TEMPLATE_TABLE, this.toInsertFields(def, now, canonicalHash));
  }

  /** 用户未改动（模板 md5 == 上次种子指纹）的最新化（数据处理 → 执行 UPDATE） */
  private async refreshUnchanged(existing: Record<string, unknown>, def: BuiltinPromptDef, canonicalHash: string): Promise<void> {
    const untouched = md5(String(existing['prompt_template'] ?? '')) === String(existing.seed_hash ?? '');
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
      [{ field: 'id', operator: Operator.EQ, value: def.id }],
    );
  }

  /** 种子行组装（数据处理） */
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

/** 模板指纹（数据处理） */
function md5(text: string): string {
  return createHash('md5').update(text ?? '').digest('hex');
}
