import { z } from 'zod';
import type { AnySkillDef } from '../domain/types';

export const SKILL_WIRE_PREFIX = 'skill_';

export interface SkillRecordLike {
  id?: string;
  name?: string;
  skill_brief?: string;
  skill_md?: string;
  enable?: boolean;

  system?: boolean;
}

export interface SkillAccessLike {
  soSkillById(input: { id: string }, output: { skill: SkillRecordLike | null }, context: unknown): Promise<boolean>;
  execSkill(input: { id: string; params: Record<string, unknown> }, output: { result?: unknown; error?: string }, context: unknown): Promise<boolean>;
}

export function skillWireId(skillId: string): string {
  return `${SKILL_WIRE_PREFIX}${skillId}`;
}

function mdHintOf(md?: string): string {
  const paragraph = String(md ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('```'));
  return (paragraph ?? '').slice(0, 200);
}

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

export async function buildBoundSkillDefs(
  skillIds: string[],
  skillAccess: SkillAccessLike,
): Promise<AnySkillDef[]> {
  const defs: AnySkillDef[] = [];
  for (const id of skillIds) {
    try {
      const out: { skill: SkillRecordLike | null } = { skill: null };
      const ok = await skillAccess.soSkillById({ id }, out, {});

      if (ok && out.skill?.enable && !out.skill.system) {
        defs.push(toBoundSkillDef(id, out.skill, skillAccess));
      }
    } catch {

    }
  }
  return defs;
}
