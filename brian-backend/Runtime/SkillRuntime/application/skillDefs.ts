/**
 * @fileoverview Skill 一等工具（Tool ⊕ Skill 合并；Tools-PRD §14）。
 *
 * 设计定版（2026-09-24 用户裁决）：Tool 与 Skill 合并为同一工具体系，Skill 与 MCP 独立运行。
 * - 绑定的 Skill 不再经 `skill_exec` 间接 gate 执行，而是以一等工具直接出现在 wire 工具清单
 *   （id = `skill_<skill_id>`）；执行复用 SkillAccess.execSkill 的脚本沙箱路径（js/py/sh），不重写执行底座。
 * - 运行注册（run 作用域）：SkillRuntimeService.runSkills 注册表随 Loop 结束清理 —— 全局 registry 不被会话性工具污染。
 * - MCP 通道（mcp_exec + component_scope.mcps）保持独立，不受本次合并影响。
 */

import { z } from 'zod';
import type { AnySkillDef } from '../domain/types';

/** skill 工具 id 前缀（wire function name；OpenAI 允许 [a-zA-Z0-9_-]，长度安全） */
export const SKILL_WIRE_PREFIX = 'skill_';

/** soSkillById 出参最小形状（鸭子类型：真实实现 Base/SkillProvider.GetSkillOutput） */
export interface SkillRecordLike {
  id?: string;
  name?: string;
  skill_brief?: string;
  skill_md?: string;
  enable?: boolean;
}

/** SkillAccess 所需最小接口（鸭子类型；真实实现在 Base/SkillProvider） */
export interface SkillAccessLike {
  soSkillById(input: { id: string }, output: { skill: SkillRecordLike | null }, context: unknown): Promise<boolean>;
  execSkill(input: { id: string; params: Record<string, unknown> }, output: { result?: unknown; error?: string }, context: unknown): Promise<boolean>;
}

/** skill 工具 id（数据处理） */
export function skillWireId(skillId: string): string {
  return `${SKILL_WIRE_PREFIX}${skillId}`;
}

/** skill_md 说明段摘要（数据处理：首个非标题非空行截断 200 字） */
function mdHintOf(md?: string): string {
  const paragraph = String(md ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('```'));
  return (paragraph ?? '').slice(0, 200);
}

/** Skill 一等工具定义构建（数据处理）：每 skill 一个 SkillDef，execute 复用 execSkill */
export function toBoundSkillDef(skillId: string, skill: SkillRecordLike, skillAccess: SkillAccessLike): AnySkillDef {
  const name = String(skill?.name ?? '').trim() || skillId;
  const brief = String(skill?.skill_brief ?? '').trim();
  const mdHint = mdHintOf(skill?.skill_md);
  return {
    id: skillWireId(skillId),
    description: [
      `Skill 工具【${name}】：${brief || '技能能力包'}`,
      mdHint ? `适用性：${mdHint}` : '',
    ].filter(Boolean).join('。'),
    parameters: z.object({
      params: z.record(z.unknown()).optional(),
    }),
    // 返回 SkillResult 形状（与全部内置工具一致 —— executeSkillSafely.truncateResult 直访 result.output）
    async execute(args: { params?: Record<string, unknown> }) {
      const execInput = { id: skillId, params: (args?.params ?? {}) as Record<string, unknown> };
      const execOutput: { result?: unknown; error?: string } = {};
      const ok = await skillAccess.execSkill(execInput, execOutput, {});
      if (!ok) {
        throw new Error(String(execOutput?.error ?? 'Skill 执行失败'));
      }
      const raw = execOutput?.result;
      const outputText = typeof raw === 'string' ? raw : JSON.stringify(raw ?? null);
      return { status: 'ok', output: outputText };
    },
  } as unknown as AnySkillDef;
}

/** 批量构建（数据处理；soSkillById 逐个 best-effort：查无/禁用即跳过） */
export async function buildBoundSkillDefs(
  skillIds: string[],
  skillAccess: SkillAccessLike,
): Promise<AnySkillDef[]> {
  const defs: AnySkillDef[] = [];
  for (const id of skillIds) {
    try {
      const out: { skill: SkillRecordLike | null } = { skill: null };
      const ok = await skillAccess.soSkillById({ id }, out, {});
      if (ok && out.skill?.enable) {
        defs.push(toBoundSkillDef(id, out.skill, skillAccess));
      }
    } catch {
      // 查无即跳过（该 skill 不入本 run 工具清单）
    }
  }
  return defs;
}
