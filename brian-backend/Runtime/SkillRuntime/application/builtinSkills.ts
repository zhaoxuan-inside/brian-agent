import type { SkillDef } from '../domain/types';
import { execCommandSkill } from './execCommandSkill';
import { updatePlanSkill } from './updatePlanSkill';
import { delegateSkill } from './delegateSkill';
import { askUserSkill } from './askUserSkill';
import { browserSkill } from './mcpGate';
import type { SkillRuntimeDeps } from './mcpGate';

export interface SystemSkillSpec {

  id: string;
  name: string;
  brief: string;

  md: string;

  build: (deps: SkillRuntimeDeps) => SkillDef<never> | null;
}

export const SYSTEM_SKILLS: SystemSkillSpec[] = [
  {
    id: 'skill_builtin-exec',
    name: '系统命令执行',
    brief: '在宿主机执行系统命令并返回真实输出（磁盘/进程/网络/系统状态查询等）',
    md: '当任务需要宿主机真实数据（磁盘、CPU、内存、进程、网络、文件系统等）时使用。command 传单条命令（禁止交互式命令）；timeout_s 可选（默认 60 秒）。首次执行需用户授权。',
    build: () => execCommandSkill() as SkillDef<never>,
  },
  {
    id: 'skill_builtin-browser',
    name: '浏览器网页操作',
    brief: '操控 CDP 浏览器（navigate/get_content/click/scroll/evaluate）获取网页数据',
    md: '当任务需要网页内容、页面交互或页面内 JS 求值时使用。operation 见参数枚举。',
    build: (deps) => (deps.cdtCore ? browserSkill(deps) as SkillDef<never> : null),
  },
  {
    id: 'skill_builtin-plan',
    name: '任务计划维护',
    brief: '向用户展示多步计划并维护进度（过程性计划卡）',
    md: '多步任务拆解后向用户展示计划与进度时使用；至多一个步骤处于 in_progress。',
    build: () => updatePlanSkill() as SkillDef<never>,
  },
  {
    id: 'skill_builtin-delegate',
    name: '子任务并行委派',
    brief: '把自包含子任务委派给子代理并行执行，结果由本次问答收口汇总',
    md: '任务可拆出独立子任务时使用；task_content 必须自包含；一次问答可委派多个，结果统一汇总后回复，每个子任务只需委派一次。',
    build: (deps) => (deps.runGateway ? delegateSkill({ submitRun: (input) => deps.runGateway!.submitRun(input) }) as SkillDef<never> : null),
  },
  {
    id: 'skill_builtin-ask-user',
    name: '用户澄清询问',
    brief: '向用户提出澄清/确认问题并挂起等待答复',
    md: '任务缺少关键信息（澄清/确认）时使用；question 为具体问题，kind 为 confirm（确认）/clarify（澄清）。',
    build: (deps) => (deps.askUserGate ? askUserSkill({ waitAnswer: (input) => deps.askUserGate!.waitAnswer(input) }) as SkillDef<never> : null),
  },
];

export function buildSystemSkillDefs(deps: SkillRuntimeDeps): SkillDef<never>[] {
  const defs: SkillDef<never>[] = [];
  for (const spec of SYSTEM_SKILLS) {
    try {
      const def = spec.build(deps);
      if (def) {
        defs.push(def);
      }
    } catch {

    }
  }
  return defs;
}

export const LEGACY_TOOL_TO_SKILL_ID: Record<string, string> = {
  exec: 'skill_builtin-exec',
  cdt_browser: 'skill_builtin-browser',
  update_plan: 'skill_builtin-plan',
  delegate: 'skill_builtin-delegate',
  ask_user: 'skill_builtin-ask-user',
};
