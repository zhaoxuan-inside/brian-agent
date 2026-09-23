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

  // ===== 原始方法（保留作为参考；2026-09-23 被下方修改后版本替代：老版本 catalog 以 UUID 为
  // 模板 id 种子化，按 def.id 查不到旧行就直接插入 builtin. 新行——老库同名系统模板永不刷新，
  // 新旧两行并存且隐式回退可能命中陈旧契约——真机取证见 [2026-09-22r]）=====
  // private async seedOne(def: BuiltinPromptDef, now: number): Promise<void> {
  //   const canonicalHash = md5(def.template);
  //   const existing = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'id', operator: Operator.EQ, value: def.id },
  //   ]) as Record<string, unknown> | null;
  //   if (existing) {
  //     await this.refreshUnchanged(existing, def, canonicalHash);
  //     return;
  //   }
  //   await this.relationDb.insert(PROMPT_TEMPLATE_TABLE, this.toInsertFields(def, now, canonicalHash));
  // }

  // ===== 修改后（2026-09-23）：id 未命中时按「同标题 + is_system=1」查找老版本种子行，
  // 未编辑（md5==seed_hash）则原位刷新模板与 seed_hash（保 UUID id 不变，外部引用不断链，
  // 且不再产生 builtin. 重复行）；用户已编辑的旧行保留用户版本并跳过插入 =====
  /** 单条种子（逻辑控制）：缺失即插入；已存在行按 seed_hash 判定是否刷新模板 */
  // ===== 修改后（2026-09-23b）：legacy 同标题检查前置——老库可能同时存在 UUID 旧行与
  // builtin. 新行（历史脏数据），legacy 前置保证旧行也被原位刷新，隐式回退无论命中哪行都是新契约 =====
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

  /** 用户未改动（模板 md5 == 上次种子指纹）的最新化（数据处理 → 执行 UPDATE） */
  // ===== 修改后（2026-09-23）：UPDATE 条件改用 existing 行自身 id（原版写死 def.id，
  // 对按标题命中的老版本 UUID 行永远匹配 0 行、刷新静默失效）=====
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
      [{ field: 'id', operator: Operator.EQ, value: String(existing['id']) }],
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
