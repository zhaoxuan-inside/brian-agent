import { PromptRebuilder } from '../Agent/AgentExecution/application/trace/PromptRebuilder';
import { TimelineItemKind } from '@brian-agent/base';
import { InfoCoreContext } from '../Core/InfoCoreProvider';
import { fileLogger } from './fileLog';

/**
 * 思考块/思维 DAG/Trace 组装(从 dev-server.ts 平移,行为不变)。
 * 输入 RelationDBAccess 与 InfoCoreLike,输出 thinking blocks / dag / trace。
 */
type RelationDbLike = import('../Base/RelationDBProvider/access/RelationDBAccess').RelationDBAccess;

export async function buildThinkingBlocksAndDag(
  relationDb: RelationDbLike,
  infoCore: any,
  workIds: string[],
  promptsAccess?: any,
  soulAccess?: any,
): Promise<{ workBlocksMap: Map<string, any[]>; workDagMap: Map<string, any>; workTraceMap: Map<string, any> }> {

  const { workBlocksMap, workDagMap } = await buildThinkingBlocksFromOrchestration(relationDb, infoCore, workIds, promptsAccess, soulAccess);
  const workTraceMap = new Map<string, any>();

  for (const wid of workIds) {
    if (!wid) continue;
    const existing = workBlocksMap.get(wid);
    if (existing && existing.length > 0) continue;
    try {

      const rebuilt = await buildThinkingBlocksFromRuntime(relationDb, infoCore, wid);
      if (rebuilt) {
        workBlocksMap.set(wid, rebuilt.blocks);
        if (rebuilt.dag) workDagMap.set(wid, rebuilt.dag);
        if (rebuilt.trace) workTraceMap.set(wid, rebuilt.trace);
      }
    } catch (err) {
      fileLogger.warn('[dev-server] buildThinkingBlocksAndDag 单 work 思考块重建失败（容忍：降级为空）', err instanceof Error ? err.message : String(err));
    }
  }
  return { workBlocksMap, workDagMap, workTraceMap };
}

type ContextTriples = { source_ids_map: Record<string, string[]>; content_map: Record<string, string>; attribute_map: Record<string, Record<string, unknown>> };

async function soContextByWorkShared(infoCore: InfoCoreLike, workId: string): Promise<ContextTriples> {
  const soOut = { source_ids_map: {} as Record<string, string[]>, content_map: {} as Record<string, string>, attribute_map: {} as Record<string, Record<string, unknown>> };
  try { await infoCore.soContextByWork({ work_id: workId }, soOut); } catch {  }
  return soOut;
}

interface InfoCoreLike {
  soContextByWork(input: { work_id: string }, output: unknown): Promise<unknown>;
}

async function buildRuntimeWorkContext(
  infoCore: InfoCoreLike,
  relationDb: AllRelationDb,
  runId: string,
  lastBuilt: any,
): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {
    strategy: 'Runtime 直连执行 (Agent 精确匹配)',
    userProfile: { language: 'zh-CN', format: 'MARKDOWN', style: 'clear' },
    citingMessages: [],
  };
  context.timelineMessages = lastBuilt && Array.isArray(lastBuilt.messages)
    ? (lastBuilt.messages as any[]).map((m) => ({ role: m.role, content: String(m.content ?? '') }))
    : undefined;

  let workIds: string[] = [];
  try {
    const rows = relationDb.queryRaw<{ work_id: string }>(
      `SELECT DISTINCT "l"."work_id" AS "work_id" FROM "llm_call_log" "l"
       JOIN "context" "s" ON "s"."work_id" = "l"."work_id"
       WHERE "l"."run_id" = ?`,
      [runId],
    );

    workIds = (rows ?? []).map((r) => String(r.work_id)).filter(Boolean);
  } catch { workIds = []; }

  const triplesByWork = new Map<string, ContextTriples>();
  for (const wid of workIds.slice(0, 5)) {

    try {
      triplesByWork.set(wid, await soContextByWorkShared(infoCore, wid));
    } catch (err) {
      fileLogger.warn('[dev-server] buildRuntimeWorkContext.soContextByWork 失败（容忍：跳过该 work 上下文）', err instanceof Error ? err.message : String(err));
    }
  }

  if (triplesByWork.size > 0) {
    const mergedCategories: Record<string, Array<{ info_id: string; content: string }>> = {};
    const sourceIdsMap: Record<string, string[]> = {};
    const contentMap: Record<string, string> = {};
    for (const [, triples] of triplesByWork) {
      Object.assign(sourceIdsMap, triples.source_ids_map);
      Object.assign(contentMap, triples.content_map);
      for (const [source, ids] of Object.entries(triples.source_ids_map)) {
        const bucket = mergedCategories[source] ?? (mergedCategories[source] = []);
        for (const id of ids) {
          const content = triples.content_map[id];
          if (content && !bucket.some((x) => x.info_id === id)) bucket.push({ info_id: id, content });
        }
      }
    }
    const toMessages = (sourceKey: string) => {
      const msgs = mergedCategories[sourceKey];
      return msgs && msgs.length > 0 ? msgs : undefined;
    };
    context.staticMemoryWorkIds = [...triplesByWork.keys()];
    context.source_ids_map = sourceIdsMap;
    context.categoryIds = {
      selected: sourceIdsMap.CUSTOM ?? sourceIdsMap.SELECTED ?? [],
      citing: sourceIdsMap.CITING ?? [],
      timeline: sourceIdsMap.TIMELINE ?? [],
      pinned: sourceIdsMap.PINNED ?? [],
      similarity: sourceIdsMap.SIMILARITY ?? [],
      tag_relative: sourceIdsMap.TAG_RELATIVE ?? [],
      keyword: sourceIdsMap.KEYWORD ?? [],
      random: sourceIdsMap.RANDOM ?? [],
    };
    context.selectedMessages = toMessages('CUSTOM');
    context.citingMessages = toMessages('CITING');
    context.timelineMessages = toMessages('TIMELINE');
    context.pinnedMessages = toMessages('PINNED');
    context.similarityMessages = toMessages('SIMILARITY');
    context.tagRelativeMessages = toMessages('TAG_RELATIVE');
    context.keywordMessages = toMessages('KEYWORD');
    context.randomMessages = toMessages('RANDOM');
  }
  return context;
}

type AllRelationDb = Parameters<typeof buildThinkingBlocksFromRuntime>[0];

async function buildThinkingBlocksFromRuntime(
  relationDb: RelationDbLike,
  infoCore: InfoCoreLike,
  runId: string,
): Promise<{ blocks: any[]; dag: any; trace?: any } | null> {

  const runRows = relationDb.queryRaw<Record<string, unknown>>(
    `SELECT id, session_key, agent_def_id, status, accepted_at, started_at, settled_at, budget_used
     FROM runtime_run WHERE id = ? LIMIT 1`,
    [runId],
  );
  if (runRows.length === 0) return null;
  const run = runRows[0];
  const sessionKey = String(run.session_key ?? '');
  if (!sessionKey) return null;
  const startTs = Number(run.started_at ?? run.accepted_at ?? 0) - 5000;
  const settleTs = Math.max(Number(run.settled_at ?? 0), Number(run.accepted_at ?? 0)) + 5000;

  const eventElapsed = (payload: any, display: boolean = true): number => {
    if (!display) return 0;
    const v = Number(payload?.elapsed_ms);
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
  };

  const totalElapsed = Number(run.settled_at ?? 0) > Number(run.started_at ?? 0)
    ? Number(run.settled_at) - Number(run.started_at) : 0;

  let llmTurnsMs = 0;
  let writerElapsed = 0;

  const evRows = relationDb.queryRaw<{ seq: number; run_id: string; event_type: string; payload_json: string; ts: number }>(
    `SELECT seq, run_id, event_type, payload_json, ts FROM stream_event
     WHERE session_key = ? AND ts >= ? AND ts <= ? ORDER BY seq ASC`,
    [sessionKey, startTs, settleTs],
  );

  const runEvRows = evRows.filter((r) => !r.run_id || r.run_id === runId || !runId);
  let selected: any = null;
  let components: any = null;
  const builtContexts: any[] = [];

  const timeline: any[] = [];
  let thinkDeltaChars = 0;
  let thinkCreatedEv: { seq: number; ts: number } | null = null;
  let firstThinkDeltaEv: { seq: number; ts: number } | null = null;

  let replyDeltaChars = 0;
  let replyCreatedEv: { seq: number; ts: number } | null = null;
  let firstReplyDeltaEv: { seq: number; ts: number } | null = null;

  let toolEventIdx = 0;

  const pushTimeline = (ev: { seq: number; ts: number }, event: string, title: string, detail?: string, kind?: TimelineItemKind | string, target?: string, tooltip?: string, elapsedMs?: number) => {
    timeline.push({ seq: ev.seq, ts: ev.ts, event, title, detail: detail ?? '', kind: kind ?? TimelineItemKind.Lifecycle, target: target ?? '', tooltip: tooltip ?? '', elapsedMs: elapsedMs !== undefined ? elapsedMs : 0 });
  };

  const nodes: any[] = [];
  const pushNode = (ev: { seq: number }, kind: TimelineItemKind | string, title: string, fields: Array<{ label: string; value: string; id?: string }>, detail?: string) => {
    const targetKey = `node-${ev.seq}`;
    nodes.push({ seq: ev.seq, targetKey, title, kind, detail: detail ?? '', fields });
    return targetKey;
  };

  const componentNameCache = new Map<string, string>();
  const resolveComponentName = (id: string, table: string, nameCol: string): string => {
    if (!id) return '';
    const key = `${table}:${id}`;
    if (componentNameCache.has(key)) return componentNameCache.get(key) ?? '';
    let name = '';
    try {
      const rows = relationDb.queryRaw<Record<string, unknown>>(
        `SELECT "${nameCol}" AS "n" FROM "${table}" WHERE "id" = ? LIMIT 1`,
        [id],
      );
      const raw = rows?.[0]?.n;
      name = raw != null ? String(raw).trim() : '';
    } catch { name = ''; }
    componentNameCache.set(key, name);
    return name;
  };
  const soulName = (id: string) => resolveComponentName(id, 'soul', 'soul_brief');
  const promptName = (id: string) => resolveComponentName(id, 'prompt_template', 'prompt_template_title');
  const llmName = (id: string) => resolveComponentName(id, 'llm_available', 'llm_title');

  const skillName = (id: string) => resolveComponentName(id, 'skill', 'name') || resolveComponentName(id, 'skill', 'skill_brief');
  const mcpName = (id: string) => resolveComponentName(id, 'mcp_install', 'mcp_title');

  const componentEntryFields = (
    kindLabel: string,
    entries: any[],
    resolveName: (id: string) => string,
  ): { fields: Array<{ label: string; value: string; id?: string }>; names: string[]; ids: string[] } => {
    const fields: Array<{ label: string; value: string; id?: string }> = [];
    const names: string[] = [];
    const ids: string[] = [];
    (entries ?? []).forEach((s, i) => {
      const id = String(s?.id ?? s?.server_name ?? (typeof s === 'string' ? s : '')).trim();
      if (id) ids.push(id);
      const name = String(s?.name || '') || resolveName(id) || String(s?.brief || '') || id;
      names.push(name);
      const prefix = (entries ?? []).length > 1 ? `${kindLabel} ${i + 1}` : kindLabel;
      fields.push({ label: `${prefix} 名称`, value: name || '（未知）', id: id || undefined });
      if (id) fields.push({ label: `${prefix} ID`, value: id });
    });
    return { fields, names: names.filter(Boolean), ids };
  };

  const BUILTIN_TOOL_IDS = new Set(['skill_exec', 'mcp_exec', 'cdt_browser', 'update_plan', 'delegate']);
  const toolComponentOf = (toolId: string, params: any): { builtin: boolean; kind: 'skill' | 'mcp' | ''; id: string; name: string; subTool: string } => {
    const builtin = BUILTIN_TOOL_IDS.has(toolId);
    if (toolId === 'skill_exec') {
      const id = String(params?.skill_id ?? '').trim();
      return { builtin, kind: 'skill', id, name: skillName(id) || id, subTool: '' };
    }
    if (toolId === 'mcp_exec') {
      const id = String(params?.mcp_id ?? '').trim();
      return { builtin, kind: 'mcp', id, name: mcpName(id) || id, subTool: String(params?.tool_name ?? '') };
    }
    return { builtin, kind: '', id: '', name: '', subTool: '' };
  };

  const agentNameOf = (id: string): string => {
    if (!id) return '';
    const key = `agent:${id}`;
    if (componentNameCache.has(key)) return componentNameCache.get(key) ?? '';
    let name = '';
    try {
      const defRows = relationDb.queryRaw<{ n: string }>(
        `SELECT "name" AS "n" FROM "runtime_agent_def" WHERE "id" = ? LIMIT 1`,
        [id],
      );
      name = String(defRows?.[0]?.n ?? '');
      if (!name) {
        const agentRows = relationDb.queryRaw<{ n: string }>(
          `SELECT "agent_name" AS "n" FROM "agent" WHERE "agent_id" = ? LIMIT 1`,
          [id],
        );
        name = String(agentRows?.[0]?.n ?? '');
      }
    } catch { name = ''; }
    componentNameCache.set(key, name);
    return name;
  };

  const displayValue = (id: string, name: string) => name || id || '';
  for (const ev of runEvRows) {
    let payload: any;
    try { payload = JSON.parse(String(ev.payload_json ?? '{}')); } catch { continue; }
    if (ev.event_type === 'agent.selected') selected = payload;
    else if (ev.event_type === 'agent.components') components = payload;
    else if (ev.event_type === 'context.built') builtContexts.push(payload);
    switch (ev.event_type) {
      case 'run.accepted':
        pushTimeline(ev, ev.event_type, '开始受理请求', payload.run_id ? `run ${String(payload.run_id).slice(0, 8)}` : '', TimelineItemKind.Lifecycle, undefined, undefined, eventElapsed(payload, false));
        break;
      case 'run.started':
        {
          const agentLabel = String(payload.agent_name ?? payload.agent_id ?? '');
          const target = pushNode(ev, TimelineItemKind.Lifecycle, '开始执行', [
            { label: 'Agent', value: agentLabel || '（默认）' },
          ]);

          pushTimeline(ev, ev.event_type, '开始执行', agentLabel, TimelineItemKind.Lifecycle, target, undefined, eventElapsed(payload, false));
        }
        break;
      case 'agent.selected':
        {
          const target = pushNode(ev, TimelineItemKind.Agent, 'Agent 选择', [
            { label: 'Agent 名称', value: String(payload.agent_name ?? '') },
            { label: '定义 ID', value: String(payload.def_id ?? '') },
            { label: '匹配方式', value: String(payload.matched_by ?? '') },
          ]);
          pushTimeline(ev, ev.event_type, `选中 Agent：${String(payload.agent_name ?? payload.def_id ?? 'agent')}`, payload.matched_by ? `匹配方式：${String(payload.matched_by)}` : '', TimelineItemKind.Agent, target, undefined, eventElapsed(payload));
        }
        break;
      case 'agent.components':
        {
          const soulId = payload.soul_id ? String(payload.soul_id) : '';
          const promptId = payload.prompt_template_id ? String(payload.prompt_template_id) : '';
          const llmId = payload.llm_id ? String(payload.llm_id) : '';
          const skillEntries = Array.isArray(payload.skills) ? (payload.skills as any[]) : [];
          const mcpEntries = Array.isArray(payload.mcps) ? (payload.mcps as any[]) : [];

          const skillParsed = componentEntryFields('Skill', skillEntries, skillName);
          const mcpParsed = componentEntryFields('MCP', mcpEntries, mcpName);
          const target = pushNode(ev, TimelineItemKind.Agent, '组件装配', [
            { label: 'Soul', value: displayValue(soulId, String(payload.soul_name || '') || soulName(soulId)) || '（无）', id: soulId || undefined },
            { label: 'Prompt', value: displayValue(promptId, String(payload.prompt_name || '') || promptName(promptId)) || '（默认身份模板）', id: promptId || undefined },
            { label: 'LLM', value: displayValue(llmId, String(payload.llm_name || '') || llmName(llmId)) || '（默认模型）', id: llmId || undefined },
            ...skillParsed.fields,
            ...mcpParsed.fields,
            { label: 'Skill 数量', value: String(skillEntries.length) },
            { label: 'MCP 数量', value: String(mcpEntries.length) },
          ]);
          const bits: string[] = [];
          if (soulId) bits.push(`Soul ${displayValue(soulId, String(payload.soul_name || '') || soulName(soulId))}`);
          if (skillEntries.length) bits.push(`Skill×${skillEntries.length}`);
          if (mcpEntries.length) bits.push(`MCP×${mcpEntries.length}`);
          if (llmId) bits.push(`LLM ${displayValue(llmId, String(payload.llm_name || '') || llmName(llmId))}`);
          if (promptId) bits.push(`Prompt ${displayValue(promptId, String(payload.prompt_name || '') || promptName(promptId))}`);
          const summary = bits.join(' · ');
          const tooltipBits: string[] = [];
          if (soulId) tooltipBits.push(`Soul: ${soulId}`);
          if (promptId) tooltipBits.push(`Prompt: ${promptId}`);
          if (llmId) tooltipBits.push(`LLM: ${llmId}`);
          if (skillParsed.ids.length) tooltipBits.push(`Skill: ${skillParsed.ids.join(', ')}`);
          if (mcpParsed.ids.length) tooltipBits.push(`MCP: ${mcpParsed.ids.join(', ')}`);
          pushTimeline(ev, ev.event_type, '组件装配完成', summary ? summary : '无 Soul/Prompt/LLM/Skill/MCP 显式绑定', TimelineItemKind.Agent, target, tooltipBits.join('\n'), eventElapsed(payload));
        }
        break;
      case 'agent.built':
        {
          const builtAgentId = payload.agent_id ? String(payload.agent_id) : '';
          const builtDefId = payload.def_id ? String(payload.def_id) : '';
          const target = pushNode(ev, TimelineItemKind.Agent, '构建 Agent', [
            { label: 'Agent 名称', value: String(payload.name ?? '') || '（未知）', id: builtAgentId || undefined },
            { label: 'Agent ID', value: builtAgentId || '（无）' },
            { label: '定义 ID', value: builtDefId || '（无）' },
            { label: '用途', value: String(payload.purpose ?? '') },
          ]);
          pushTimeline(ev, ev.event_type, `构建 Agent：${String(payload.name ?? builtAgentId ?? 'agent')}`, String(payload.purpose ?? ''), TimelineItemKind.Agent, target, builtAgentId || builtDefId || '', eventElapsed(payload));
        }
        break;
      case 'context.built':
        {
          const roundNum = Number(payload.round ?? 0);
          const msgCount = Number(payload.message_count ?? (Array.isArray(payload.messages) ? payload.messages.length : 0));
          const ctxElapsed = eventElapsed(payload);
          pushTimeline(
            ev,
            ev.event_type,
            `构建上下文：第 ${roundNum} 轮 · ${msgCount} 条消息`,
            payload.system ? '含 system 提示词（模型输入侧）' : '',
            TimelineItemKind.Context,
            `ctx-${roundNum}`,
            undefined,
            ctxElapsed,
          );
        }
        break;
      case 'intent.started':

        pushTimeline(ev, ev.event_type, '需求确认 / 意图分析中…', payload.candidates_count ? `候选 ${payload.candidates_count} 个 Agent` : '', TimelineItemKind.Intent);
        break;
      case 'intent.analyzed':
        {
          const agentId = payload.agent_id ? String(payload.agent_id) : '';
          const agentDisp = String(payload.agent_name || '') || agentNameOf(agentId);
          const target = pushNode(ev, TimelineItemKind.Intent, '需求确认 / 意图分析', [
            { label: '匹配得分', value: String(payload.score ?? 0) },
            { label: '是否采纳', value: payload.adopted ? '采纳' : '未达阈值' },
            { label: '候选 Agent', value: `${payload.candidates_count ?? 0} 个` },
            { label: '命中 Agent', value: agentDisp || '（无）', id: agentId || undefined },
            { label: '理由', value: String(payload.reason ?? '（无）') },
          ]);
          pushTimeline(ev, ev.event_type, `需求确认 / 意图分析：打分 ${Number(payload.score ?? 0)}（${payload.adopted ? '采纳' : '未达阈值'}）`, payload.reason ? String(payload.reason).slice(0, 200) : `候选 ${payload.candidates_count ?? 0} 个 Agent`, TimelineItemKind.Intent, target, agentId || '', eventElapsed(payload));
        }
        break;
      case 'llm.selected':
        {
          const llmId = payload.llm_id ? String(payload.llm_id) : '';
          const name = String(payload.llm_name || '') || llmName(llmId);
          const target = pushNode(ev, TimelineItemKind.Model, 'LLM 模型选定', [
            { label: '模型', value: displayValue(llmId, name) || '（默认模型）', id: llmId || undefined },
          ]);
          pushTimeline(ev, ev.event_type, `选定模型：${displayValue(llmId, name) || '默认模型'}`, '', TimelineItemKind.Model, target, llmId || '', eventElapsed(payload));
        }
        break;
      case 'prompt.selected':
        {
          const templateId = payload.template_id ? String(payload.template_id) : '';
          const name = String(payload.prompt_name || '') || promptName(templateId);
          const target = pushNode(ev, TimelineItemKind.Model, '提示词选定', [
            { label: '模板', value: displayValue(templateId, name) || '（默认身份模板）', id: templateId || undefined },
            { label: 'Soul 注入', value: payload.soul_selected ? '已注入' : '未注入' },
            { label: '工具数', value: String(payload.tools_count ?? 0) },
          ]);
          pushTimeline(ev, ev.event_type, `选定提示词：${displayValue(templateId, name) || '默认身份模板'}`, payload.tools_count ? `注入 ${payload.tools_count} 个工具` : '', TimelineItemKind.Model, target, templateId || '', eventElapsed(payload));
        }
        break;
      case 'skill.selected': {
        const skillParsed = componentEntryFields('Skill', Array.isArray(payload.skills) ? (payload.skills as any[]) : [], skillName);
        const n = skillParsed.names.length;
        const fields: Array<{ label: string; value: string; id?: string }> = [{ label: '数量', value: String(n) }, ...skillParsed.fields];
        if (!n) fields.push({ label: '明细', value: '（无）' });
        const target = pushNode(ev, TimelineItemKind.Model, 'Skill 选定', fields);
        pushTimeline(ev, ev.event_type, n ? `选定 Skill×${n}` : '无需 Skill', skillParsed.names.join('、'), TimelineItemKind.Model, target, skillParsed.ids.join(', '), eventElapsed(payload));
        break;
      }
      case 'mcp.selected': {
        const mcpParsed = componentEntryFields('MCP', Array.isArray(payload.mcps) ? (payload.mcps as any[]) : [], mcpName);
        const n = mcpParsed.names.length;
        const fields: Array<{ label: string; value: string; id?: string }> = [{ label: '数量', value: String(n) }, ...mcpParsed.fields];
        if (!n) fields.push({ label: '明细', value: '（无）' });
        const target = pushNode(ev, TimelineItemKind.Model, 'MCP 选定', fields);
        pushTimeline(ev, ev.event_type, n ? `选定 MCP×${n}` : '无需 MCP', mcpParsed.names.join('、'), TimelineItemKind.Model, target, mcpParsed.ids.join(', '), eventElapsed(payload));
        break;
      }
      case 'think.created':
        thinkCreatedEv = ev;
        break;
      case 'think.delta':
        if (!firstThinkDeltaEv) firstThinkDeltaEv = ev;
        thinkDeltaChars += String((payload as any).delta ?? (payload as any).chunk ?? '').length;
        break;
      case 'reply.created':
        replyCreatedEv = ev;
        break;
      case 'reply.delta':
        if (!firstReplyDeltaEv) firstReplyDeltaEv = ev;
        replyDeltaChars += String((payload as any).delta ?? (payload as any).chunk ?? '').length;
        break;
      case 'skill.started':
      case 'skill.launch':
      case 'tool.started':
      case 'tool.launch':
        toolEventIdx += 1;
        pushTimeline(ev, ev.event_type, `调用技能：${String(payload.skill_id ?? payload.tool_id ?? payload.tool_name ?? 'skill')}`, typeof payload.input === 'string' ? (payload.input as string).slice(0, 200) : JSON.stringify(payload.input ?? payload.params ?? {}).slice(0, 200), TimelineItemKind.Tool, payload.part_id ? `tool-${String(payload.part_id)}` : `tool-idx-${toolEventIdx}`, undefined, eventElapsed(payload, false));
        break;
      case 'skill.result':
      case 'tool.result':
        pushTimeline(ev, ev.event_type, `技能返回：${String(payload.skill_id ?? payload.tool_id ?? 'skill')}（${String(payload.status ?? '')}）`, String(payload.output ?? '').slice(0, 300), payload.status === 'ok' ? TimelineItemKind.ToolOk : TimelineItemKind.ToolFail, payload.part_id ? `tool-${String(payload.part_id)}` : `tool-idx-${toolEventIdx}`, undefined, eventElapsed(payload));
        break;
      case 'plan.updated': {
        const n = Array.isArray(payload.steps) ? payload.steps.length : 0;
        const target = pushNode(ev, TimelineItemKind.Plan, '计划更新', [
          { label: '步骤数', value: String(n) },
          { label: '明细', value: n ? (payload.steps as any[]).map((s: any) => String(s.title || s.label || s.content || s)).filter(Boolean).join(' · ') : '（无）' },
        ]);
        pushTimeline(ev, ev.event_type, n ? `计划更新：${n} 个步骤` : '计划更新', '', TimelineItemKind.Plan, target, undefined, eventElapsed(payload));
        break;
      }
      case 'permission.asked':
        pushTimeline(ev, ev.event_type, `请求授权：${String(payload.skill_id ?? payload.tool_id ?? 'skill')}`, '', TimelineItemKind.Permission, payload.permission_id ? `perm-${String(payload.permission_id)}` : '', undefined, eventElapsed(payload, false));
        break;
      case 'permission.answered':
        pushTimeline(ev, ev.event_type, `授权${(payload as any).approved === false ? '被拒绝' : '已通过'}${(payload as any).auto_approved ? '（信任表自动放行）' : ''}：${String(payload.skill_id ?? payload.tool_id ?? '')}`, '', (payload as any).approved === false ? TimelineItemKind.PermissionDeny : TimelineItemKind.PermissionOk, payload.permission_id ? `perm-${String(payload.permission_id)}` : '', undefined, eventElapsed(payload));
        break;
      case 'evaluation.started':

        pushTimeline(ev, ev.event_type, '评估中…', '', TimelineItemKind.Eval, 'agent-0', undefined, eventElapsed(payload, false));
        break;
      case 'evaluation.completed': {
        const scores = (payload.scores && typeof payload.scores === 'object' ? payload.scores : {}) as Record<string, unknown>;
        const scoreFields = Object.entries(scores as Record<string, unknown>)
          .slice(0, 12)
          .map(([k, v]) => ({ label: k, value: String(v) }));
        const target = pushNode(ev, TimelineItemKind.Eval, '评估', [
          { label: '类型', value: String(payload.eval_type ?? '') },
          ...scoreFields,
          { label: '需优化', value: payload.need_optimize ? '是' : '否' },
        ]);
        pushTimeline(ev, ev.event_type, `评估完成：overall=${Number((scores as any).overall ?? 0)}${payload.need_optimize ? '（需优化）' : ''}`, String(payload.eval_type ?? ''), TimelineItemKind.Eval, target, undefined, eventElapsed(payload));
        break;
      }
      case 'writer.started':

        pushTimeline(ev, ev.event_type, '写作排版中…', '', TimelineItemKind.Writer, 'agent-0', undefined, eventElapsed(payload, false));
        break;
      case 'writer.completed': {

        writerElapsed = eventElapsed(payload);
        const target = pushNode(ev, TimelineItemKind.Writer, '写作排版', [
          { label: '格式', value: String(payload.format ?? 'MARKDOWN') },
          { label: '字数', value: String(payload.length ?? 0) },
          { label: '流程图', value: payload.has_mermaid ? '包含 Mermaid 流程图' : '无' },
        ]);
        pushTimeline(ev, ev.event_type, `写作排版：${payload.format ?? 'Markdown'}${payload.has_mermaid ? '（含 Mermaid 流程图）' : ''}`, `字数：${payload.length ?? 0}`, TimelineItemKind.Writer, target, undefined, eventElapsed(payload));
        break;
      }
      case 'run.finished':
        pushTimeline(ev, ev.event_type, '执行完成', String(payload.stop_reason ?? ''), TimelineItemKind.LifecycleOk, undefined, undefined, totalElapsed);
        break;
      case 'run.failed':
        pushTimeline(ev, ev.event_type, `执行失败：${String(payload.stop_reason ?? payload.error ?? '')}`, '', TimelineItemKind.LifecycleFail);
        break;
      case 'error.occurred':
        pushTimeline(ev, ev.event_type, `出错：${String(payload.error_message ?? payload.error ?? '')}`, '', TimelineItemKind.LifecycleFail);
        break;
      case 'loop.turn.completed':
        llmTurnsMs += eventElapsed(payload);
        break;
      default:
        break;
    }
  }

  const rawAgentNameEarly = String(components?.agent_name ?? selected?.agent_name ?? 'Runtime Agent');
  const displayAgentName = rawAgentNameEarly.replace(/^w2-/i, '').replace(/-[0-9a-f]{8}$/i, '') || rawAgentNameEarly;
  const thinkAnchor = thinkCreatedEv ?? firstThinkDeltaEv;
  if (thinkAnchor) {
    const thinkTitle = thinkDeltaChars > 0 ? `Agent 深度推理思考（${thinkDeltaChars} 字）` : 'Agent 深度推理思考';
    pushTimeline(thinkAnchor, 'think.delta#summary', thinkTitle, displayAgentName ? `Agent：${displayAgentName}（推理见「深度思考」卡片）` : '', TimelineItemKind.Think, 'agent-0', undefined, llmTurnsMs);
  }
  const replyAnchor = replyCreatedEv ?? firstReplyDeltaEv;
  if (replyAnchor) {
    const replyTitle = replyDeltaChars > 0 ? `生成回答内容（${replyDeltaChars} 字）` : '生成回答内容';
    pushTimeline(replyAnchor, 'reply.delta#summary', replyTitle, displayAgentName ? `Agent：${displayAgentName}（最终回复见「深度思考」卡片「输入与回复」页签）` : '', TimelineItemKind.Reply, 'agent-0', undefined, writerElapsed);
  }
  timeline.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.ts ?? 0) - (b.ts ?? 0));
  nodes.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.ts ?? 0) - (b.ts ?? 0));
  timeline.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.ts ?? 0) - (b.ts ?? 0));
  nodes.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.ts ?? 0) - (b.ts ?? 0));

  const msgRows = relationDb.queryRaw<{ id: string; role: string; content: string; seq: number; token_count: number }>(
    `SELECT id, role, content, seq, token_count FROM runtime_message WHERE run_id = ? ORDER BY seq ASC`,
    [runId],
  );
  const partRows = relationDb.queryRaw<{ id: string; msg_id: string; part_type: string; part_order: number; content: string; tool_id: string; input_json: string; output_json: string; status: string; elapsed_ms: number; token_count: number }>(
    `SELECT id, msg_id, part_type, part_order, content, tool_id, input_json, output_json, status, elapsed_ms, token_count
     FROM runtime_message_part WHERE run_id = ? ORDER BY part_order ASC`,
    [runId],
  );
  const partsByMessage = new Map<string, typeof partRows>();
  for (const p of partRows) {
    const list = partsByMessage.get(p.msg_id) ?? [];
    list.push(p);
    partsByMessage.set(p.msg_id, list);
  }

  const userMsg = msgRows.find((m) => m.role === 'user');
  const assistantMsgs = msgRows.filter((m) => m.role === 'assistant');
  if (!userMsg && assistantMsgs.length === 0) return null;

  const steps: any[] = [];
  let reasoningContent = '';
  let outputAnswer = '';
  let hasActTools = false;
  let stepIndex = 0;
  const msgBySeq = msgRows
    .map((m) => ({ ...m, seq: Number(m.seq ?? 0) }))
    .sort((a, b) => a.seq - b.seq);
  for (const msg of assistantMsgs) {
    const parts = partsByMessage.get(msg.id) ?? [];

    const prevUser = [...msgBySeq].reverse().find((m) => m.role === 'user' && Number(m.seq ?? 0) < Number(msg.seq ?? 0)) ?? userMsg;
    const roundInput = String(prevUser?.content ?? '');
    const roundOutput = String(msg.content ?? '');
    for (const p of parts) {
      stepIndex += 1;
      if (p.part_type === 'reasoning' && p.content) {
        reasoningContent += (reasoningContent ? '\n' : '') + p.content;
        steps.push({ phase: 'THINK', iteration: stepIndex, content: p.content, input: roundInput, output: roundOutput });
      } else if (p.part_type === 'tool') {
        hasActTools = true;
        let params: any;
        try {
          const meta = JSON.parse(String(p.input_json || '{}'));
          const raw = meta.arguments;
          params = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
        } catch { params = {}; }
        let result: any = p.output_json || '';
        try { result = JSON.parse(String(p.output_json || 'null')) ?? String(p.output_json ?? ''); } catch {  }
        steps.push({
          phase: 'ACT',
          iteration: stepIndex,
          input: roundInput,
          output: String(result ?? ''),
          toolCalls: [{ toolName: p.tool_id || 'Tool', toolType: 'Tool', params, result }],
        });
      } else if (p.part_type === 'text' && p.content) {

        const msgParts = partsByMessage.get(msg.id) ?? [];
        const hasTools = msgParts.some((x) => x.part_type === 'tool');
        const isLastAssistant = msg === assistantMsgs[assistantMsgs.length - 1];
        if (hasTools && !isLastAssistant) {
          steps.push({ phase: 'THINK', iteration: stepIndex, content: p.content, input: roundInput, output: roundOutput });
        } else {
          outputAnswer = p.content;
        }
      }
    }
  }
  if (!outputAnswer && assistantMsgs.length > 0) {
    outputAnswer = String(assistantMsgs[assistantMsgs.length - 1].content ?? '');
  }

  const lastBuilt = builtContexts[builtContexts.length - 1] ?? null;
  let fullPrompt = '';
  if (lastBuilt && typeof lastBuilt.system === 'string' && lastBuilt.system.length > 0) {
    fullPrompt = `[system]\n${lastBuilt.system}`;
    if (Array.isArray(lastBuilt.messages)) {
      const wire = (lastBuilt.messages as any[])
        .map((m) => `[${m.role}]\n${String(m.content ?? '')}`)
        .join('\n\n');
      if (wire) fullPrompt += `\n\n${wire}`;
    }
  } else if (lastBuilt && Array.isArray(lastBuilt.messages)) {
    fullPrompt = (lastBuilt.messages as any[])
      .map((m) => `[${m.role}]\n${String(m.content ?? '')}`)
      .join('\n\n');
  }

  const rawAgentName = String(components?.agent_name ?? selected?.agent_name ?? 'Runtime Agent');
  const agentName = rawAgentName.replace(/^w2-/i, '').replace(/-[0-9a-f]{8}$/i, '') || rawAgentName;

  const skillItems = Array.isArray(components?.skills)
    ? (components.skills as any[]).map((s) => { const id = String(s?.id ?? s ?? '').trim(); return { id, name: String(s?.name || '') || skillName(id) || String(s?.brief || '') || id }; }).filter((x) => x.id || x.name)
    : [];
  const mcpItems = Array.isArray(components?.mcps)
    ? (components.mcps as any[]).map((m) => { const id = String(m?.id ?? m?.server_name ?? m ?? '').trim(); return { id, name: String(m?.name || '') || mcpName(id) || String(m?.brief || '') || id }; }).filter((x) => x.id || x.name)
    : [];
  const soulItem = components?.soul_id ? { id: String(components.soul_id), name: String(components.soul_name || '') || soulName(String(components.soul_id)) || String(components.soul_id) } : null;
  const promptItem = components?.prompt_template_id ? { id: String(components.prompt_template_id), name: String(components.prompt_name || '') || promptName(String(components.prompt_template_id)) || String(components.prompt_template_id) } : null;
  const llmItem = components?.llm_id ? { id: String(components.llm_id), name: String(components.llm_name || '') || llmName(String(components.llm_id)) || String(components.llm_id) } : null;
  const agentItem = { id: String(selected?.def_id ?? run.agent_def_id ?? ''), name: agentName };

  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const tokenRows = relationDb.queryRaw<{ input_tokens: number; output_tokens: number }>(
      `SELECT COALESCE(SUM("input_tokens"),0) AS "input_tokens", COALESCE(SUM("output_tokens"),0) AS "output_tokens" FROM "llm_call_log" WHERE "run_id" = ?`,
      [runId],
    );
    inputTokens = Number(tokenRows?.[0]?.input_tokens ?? 0) || 0;
    outputTokens = Number(tokenRows?.[0]?.output_tokens ?? 0) || 0;
  } catch { inputTokens = 0; outputTokens = 0; }
  if (inputTokens === 0 && outputTokens === 0) {
    outputTokens = assistantMsgs.reduce((sum, m) => sum + Number(m.token_count ?? 0), 0);

    const promptText = String(fullPrompt || userMsg?.content || '');
    inputTokens = Math.max(1, Math.round(promptText.length / 4));
  }
  const tokenUsage = inputTokens + outputTokens;
  const createdTs = Number(run.started_at ?? run.accepted_at ?? Date.now());

  const block = {
    id: `block-think-${runId}-runtime`,
    msgId: '',
    role: 'assistant',
    type: 'ThinkingChain',
    content: reasoningContent,
    summary: '',
    durationMs: Math.max(0, Number(run.settled_at ?? createdTs) - createdTs),
    tokenUsage,
    inputTokens,
    outputTokens,
    thinkingStrategy: hasActTools ? 'ReACT' : 'CoT',
    prompt: fullPrompt || String(userMsg?.content ?? ''),
    rawResponse: outputAnswer,
    agentInfo: {
      id: String(selected?.def_id ?? run.agent_def_id ?? ''),
      name: agentName,
      type: 'WORKER',
      llm: llmItem ?? undefined,
      soul: soulItem ?? undefined,
      prompt: promptItem ?? undefined,
      skills: skillItems,
      mcps: mcpItems,
    },

    context: await buildRuntimeWorkContext(infoCore, relationDb, runId, lastBuilt),
    input: String(userMsg?.content ?? ''),
    output: outputAnswer,
    steps,
    meta: {
      status: 'done',
      createdAt: createdTs,
      updatedAt: Number(run.settled_at ?? createdTs),
    },
  };

  const dag = {
    planId: '',
    totalCount: 1,
    nodes: [{
      id: 'task-1',
      agentId: String(selected?.def_id ?? run.agent_def_id ?? ''),
      taskId: 'task-1',
      label: `任务 1: ${agentName}`,
      domain: '',
      content: String(userMsg?.content ?? ''),
      status: String(run.status ?? 'finished') === 'finished' ? 'COMPLETED' : String(run.status ?? '').toUpperCase(),
      agentName,
      input: String(userMsg?.content ?? ''),
      output: outputAnswer,
      elapsedMs: block.durationMs,
      tokenUsage,
    }],
    edges: [],
  };

  const tools = partRows
    .filter((p) => p.part_type === 'tool')
    .map((p, idx) => {
      let params: any = {};
      try {
        const meta = JSON.parse(String(p.input_json || '{}'));
        const raw = meta.arguments ?? meta.params ?? meta;
        params = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
      } catch { params = {}; }
      let result: any = p.output_json || '';
      try { result = JSON.parse(String(p.output_json || 'null')) ?? String(p.output_json ?? ''); } catch {  }

      const comp = toolComponentOf(String(p.tool_id || ''), params);
      return {
        index: idx + 1,
        partId: String((p as any).id ?? ''),
        targetKey: `tool-${String((p as any).id ?? `idx-${idx + 1}`)}`,
        toolId: String(p.tool_id || 'Tool'),
        params,
        result,
        status: String(p.status ?? ''),
        elapsedMs: Number((p as any).elapsed_ms ?? 0),
        tokenCount: Number((p as any).token_count ?? 0),
        builtin: comp.builtin,
        componentKind: comp.kind,
        componentId: comp.id,
        componentName: comp.name,
        componentSubTool: comp.subTool,
      };
    });

  let permissions: any[] = [];
  try {
    const permRows = relationDb.queryRaw<{ input: string; output: string; created: number; updated: number }>(
      `SELECT "input", "output", "created", "updated" FROM "execute" WHERE "component_type" = ? AND "work_id" = ? ORDER BY "created" ASC LIMIT 100`,
      ['PERMISSION', runId],
    );
    permissions = permRows
      .map((r) => {
        try { return JSON.parse(String(r.input ?? '{}')); } catch {  return null; }
      })
      .filter((p) => p && String((p as any).run_id ?? '') === runId)
      .map((p: any, idx: number) => {
        const permInput = p.input ?? {};
        const comp = toolComponentOf(String(p.tool_id ?? ''), permInput);
        return {
          permissionId: String(p.permission_id ?? ''),
          targetKey: `perm-${String(p.permission_id ?? `idx-${idx + 1}`)}`,
          toolId: String(p.tool_id ?? 'tool'),
          input: permInput,
          status: String(p.status ?? 'pending'),
          askedAt: Number(p.asked_at ?? 0),
          answeredAt: Number(p.answered_at ?? 0),
          autoApproved: Boolean(p.auto_approved),
          builtin: comp.builtin,
          componentKind: comp.kind,
          componentId: comp.id,
          componentName: comp.name,
          componentSubTool: comp.subTool,
        };
      });
  } catch { permissions = []; }

  for (const t of timeline) {
    if (t.event === 'permission.answered' && t.seq >= 0) {
      const m = /授权(已通过|被拒绝)/.test(t.title) ? t.title : '';
      if (m && permissions.length === 0) {

        permissions.push({ permissionId: '', toolId: '', input: {}, status: t.kind === 'permission-deny' ? 'denied' : 'allowed', askedAt: t.ts, answeredAt: t.ts, autoApproved: /自动放行/.test(t.title) });
      }
    }
  }
  const trace = {
    run: {
      id: runId,
      status: String(run.status ?? ''),
      agentDefId: String(run.agent_def_id ?? ''),
      agentName,
      llmId: components?.llm_id ? String(components.llm_id) : undefined,
      soulId: components?.soul_id ? String(components.soul_id) : undefined,
      durationMs: block.durationMs,
      tokenUsage,
      inputTokens,
      outputTokens,
      budgetUsed: Number(run.budget_used ?? 0),
      toolCount: tools.length,
      permissionCount: permissions.length,
      thinkChars: reasoningContent.length,
      replyChars: String(outputAnswer ?? '').length,
      startedAt: Number(run.started_at ?? run.accepted_at ?? 0),
      settledAt: Number(run.settled_at ?? 0),

      components: {
        agent: agentItem.id || agentItem.name ? agentItem : null,
        llm: llmItem,
        prompt: promptItem,
        soul: soulItem,
        skills: skillItems,
        mcps: mcpItems,
      },
    },
    timeline,
    tools,
    permissions,
    nodes,
    contextRounds: builtContexts.map((c: any, i: number) => ({
      round: Number(c.round ?? i + 1),
      targetKey: `ctx-${Number(c.round ?? i + 1)}`,
      messageCount: Number(c.message_count ?? (Array.isArray(c.messages) ? c.messages.length : 0)),
      messages: Array.isArray(c.messages) ? (c.messages as any[]).map((m: any) => ({ role: String(m.role ?? ''), content: String(m.content ?? '').slice(0, 2000) })) : [],
    })),
  };

  return { blocks: [block], dag, trace };
}

async function rebuildPromptFromRef(
  rebuilder: PromptRebuilder,
  ref: any,
  refIndex: number,
  iters: any[],
  triples: any,
): Promise<string> {
  try {
    const sourceIdsMap = (triples?.source_ids_map ?? {}) as Record<string, string[]>;
    const contentMap = (triples?.content_map ?? {}) as Record<string, string>;
    const contextText = rebuilder.formatContextText(sourceIdsMap, contentMap);
    const history = rebuilder.rebuildHistory(iters, refIndex);
    return await rebuilder.rebuildPrompt(ref, contextText, history);
  } catch {
    return '';
  }
}

async function buildThinkingBlocksFromOrchestration(
  relationDb: RelationDbLike,
  infoCore: any,
  workIds: string[],
  promptsAccess?: any,
  soulAccess?: any,
): Promise<{ workBlocksMap: Map<string, any[]>; workDagMap: Map<string, any> }> {
  const workBlocksMap = new Map<string, any[]>();
  const workDagMap = new Map<string, any>();
  const rebuilder = promptsAccess && soulAccess
    ? new PromptRebuilder(promptsAccess, soulAccess)
    : null;

  if (!workIds || workIds.length === 0) return { workBlocksMap, workDagMap };

  try {
    const placeholders = workIds.map(() => '?').join(',');

    const workStrategyMap = new Map<string, string>();

    try {
      const strategyRows = relationDb.queryRaw<{ work_id: string; orchestration_strategy: string }>(
        `SELECT work_id, orchestration_strategy FROM orchestration_work WHERE work_id IN (${placeholders})`,
        workIds,
      );
      for (const sRow of strategyRows) {
        const wId = String(sRow.work_id ?? '');
        if (wId) workStrategyMap.set(wId, String(sRow.orchestration_strategy ?? ''));
      }
    } catch {  }

    const execRows = relationDb.queryRaw<Record<string, unknown>>(
      `SELECT e.id as exec_id, e.work_id, e.agent_id, e.task_id, e.task_content, e.status, e.answer, e.trace_id, e.elapsed_ms, e.created, e.execution_type,
              a.agent_name, a.agent_type, a.soul_id,
              t.iterations_json, t.total_token_usage
       FROM orchestration_agent_execution e
       LEFT JOIN agent a ON (e.agent_id = a.id OR e.agent_id = a.agent_id)
       LEFT JOIN agent_execution_trace t ON (e.trace_id IS NOT NULL AND e.trace_id != '' AND e.trace_id = t.trace_id)
       WHERE e.work_id IN (${placeholders})
       ORDER BY e.created ASC`,
      workIds,
    );

    const workAgentHasOutput = new Map<string, boolean>();
    for (const row of execRows) {
      if (String(row.execution_type ?? '') === 'SINGLE') {
        const wid = String(row.work_id ?? '');
        const ans = row.answer ? String(row.answer).trim() : '';
        if (ans) workAgentHasOutput.set(wid, true);
      }
    }

    const intentMetaRows = relationDb.queryRaw<{ work_id: string; metadata: string }>(
      `SELECT work_id, metadata FROM orchestration_work WHERE work_id IN (${placeholders})`,
      workIds,
    );
    const intentMetaMap = new Map<string, any>();
    for (const imRow of intentMetaRows) {
      const wId = String(imRow.work_id ?? '');
      if (wId && imRow.metadata) {
        try {
          const meta = JSON.parse(imRow.metadata);
          if (meta?.intent_agent) {
            intentMetaMap.set(wId, meta.intent_agent);
          }
        } catch {  }
      }
    }

    for (const wid of workIds) {
      const intentData = intentMetaMap.get(wid);
      if (intentData) {
        const intentBlock = {
          id: `block-think-${wid}-intent-agent`,
          msgId: '',
          role: 'assistant',
          type: 'ThinkingChain',
          content: String(intentData.reasoning ?? ''),
          summary: '',
          durationMs: 0,
          agentInfo: {
            id: `intent-agent-${wid}`,
            name: '需求理解 Agent (Intent)',
            type: 'INTENT',
          },
          context: {
            strategy: workStrategyMap.get(wid) === 'PLANNING' ? 'Planning 策略 (任务分解)' : 'Simple 策略 (直接推理)',
            userProfile: { language: 'zh-CN', format: 'MARKDOWN', style: 'clear' },
            citingMessages: [],
          },
          input: `需求理解: ${String(intentData.understood_requirement ?? '')}`,
          prompt: String(intentData.prompt ?? ''),
          inputTokens: Number(intentData.input_tokens ?? 0) || 0,
          outputTokens: Number(intentData.output_tokens ?? 0) || 0,
          output: {
            understood_requirement: intentData.understood_requirement,
            match_score: intentData.match_score,
            threshold_score: intentData.threshold_score,
            should_modify_query: intentData.should_modify_query,
          },
          steps: [],
          meta: {
            status: 'done',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        };
        if (!workBlocksMap.has(wid)) {
          workBlocksMap.set(wid, []);
        }
        workBlocksMap.get(wid)!.push(intentBlock);
      }
    }

    const agentIndexCounter = new Map<string, number>();

    const workContextTriplesMap = new Map<string, any>();
    if (infoCore && typeof infoCore.soContextByWork === 'function') {
      for (const wid of workIds) {
        if (!wid) continue;
        try {
          const soOut: any = { source_ids_map: {}, content_map: {}, attribute_map: {} };
          await infoCore.soContextByWork({ work_id: wid }, soOut, new InfoCoreContext());
          workContextTriplesMap.set(wid, soOut);
        } catch (err) {
          fileLogger.warn('[dev-server] buildThinkingBlocksFromOrchestration.soContextByWork 失败（容忍：跳过该 work 上下文）', err instanceof Error ? err.message : String(err));
        }
      }
    }

    for (const row of execRows) {
      const wid = String(row.work_id ?? '');
      if (!wid) continue;

      if (String(row.execution_type ?? '') === 'SYSTEM' && !workAgentHasOutput.get(wid)) {
        continue;
      }

      const agentId = String(row.agent_id ?? '');
      const rawAgentName = String(row.agent_name ?? '');

      let agentName = rawAgentName;
      const isUuid = !agentName || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentName) || agentName === agentId;

      if (isUuid) {
        const currIdx = (agentIndexCounter.get(wid) ?? 0) + 1;
        agentIndexCounter.set(wid, currIdx);

        let domainFromTask = '';
        if (row.task_content) {
          try {
            const p = JSON.parse(String(row.task_content));
            if (p && p.task_domain) domainFromTask = String(p.task_domain);
            else if (p && p.user_query) domainFromTask = String(p.user_query).slice(0, 16);
          } catch {  }
        }

        agentName = domainFromTask ? `执行 Agent ${currIdx}: ${domainFromTask}` : `执行 Agent #${currIdx}`;
      }

      const agentType = String(row.agent_type ?? 'WORKER');
      const llmId = row.llm_id ? String(row.llm_id) : undefined;
      const soulId = row.soul_id ? String(row.soul_id) : undefined;

      let inputQuery: string | undefined = undefined;
      const realStrategy = workStrategyMap.get(wid) ?? '';
      const strategyDisplay = realStrategy === 'PLANNING'
        ? 'Planning 策略 (任务分解)'
        : (realStrategy === 'SIMPLE' ? 'Simple 策略 (直接推理)' : (realStrategy || 'Simple 策略 (直接推理)'));
      const contextData: any = {
        strategy: strategyDisplay,
        userProfile: { language: 'zh-CN', format: 'MARKDOWN', style: 'clear' },
        citingMessages: [],
      };

      if (row.task_content) {
        const rawContentStr = String(row.task_content);

        if (rawContentStr.includes('\n---\n')) {
          const idx = rawContentStr.indexOf('\n---\n');
          inputQuery = rawContentStr.slice(idx + 5).trim();
        } else {
          inputQuery = rawContentStr;
        }
      }

      const triples = workContextTriplesMap.get(wid);
      if (triples) {
        const sourceIdsMap: Record<string, string[]> = triples.source_ids_map || {};
        const contentMap: Record<string, string> = triples.content_map || {};
        const attrMap: Record<string, Record<string, unknown>> = triples.attribute_map || {};

        const toMessages = (sourceKey: string): Array<{ info_id: string; content: string }> | undefined => {
          const ids = sourceIdsMap[sourceKey];
          if (!Array.isArray(ids) || ids.length === 0) return undefined;
          const msgs: Array<{ info_id: string; content: string }> = [];
          for (const id of ids) {
            const content = contentMap[id];
            if (content) msgs.push({ info_id: id, content });
          }
          return msgs.length > 0 ? msgs : undefined;
        };

        contextData.source_ids_map = sourceIdsMap;
        contextData.content_map = contentMap;
        contextData.attribute_map = attrMap;
        contextData.selectedMessages = toMessages('CUSTOM');
        contextData.citingMessages = toMessages('CITING');
        contextData.timelineMessages = toMessages('TIMELINE');
        contextData.pinnedMessages = toMessages('PINNED');
        contextData.similarityMessages = toMessages('SIMILARITY');
        contextData.tagRelativeMessages = toMessages('TAG_RELATIVE');
        contextData.keywordMessages = toMessages('KEYWORD');
        contextData.randomMessages = toMessages('RANDOM');
        contextData.categoryIds = {
          selected: sourceIdsMap.CUSTOM ?? sourceIdsMap.SELECTED ?? [],
          citing: sourceIdsMap.CITING ?? [],
          timeline: sourceIdsMap.TIMELINE ?? [],
          pinned: sourceIdsMap.PINNED ?? [],
          similarity: sourceIdsMap.SIMILARITY ?? [],
          tag_relative: sourceIdsMap.TAG_RELATIVE ?? [],
          keyword: sourceIdsMap.KEYWORD ?? [],
          random: sourceIdsMap.RANDOM ?? [],
        };
      }

      let iterJson = row.iterations_json;
      let tokenUsage = row.total_token_usage ? Number(row.total_token_usage) : 0;

      let iters: any[] = [];

      if (!iterJson && agentId) {
        try {
          const fallbackTraceRows = relationDb.queryRaw<Record<string, unknown>>(
            `SELECT iterations_json, total_token_usage FROM agent_execution_trace
             WHERE agent_id = ? ORDER BY ABS(created - ?) ASC LIMIT 1`,
            [agentId, Number(row.created ?? Date.now())],
          );
          if (fallbackTraceRows.length > 0) {
            if (fallbackTraceRows[0].iterations_json) iterJson = fallbackTraceRows[0].iterations_json;
            if (fallbackTraceRows[0].total_token_usage) tokenUsage = Number(fallbackTraceRows[0].total_token_usage);
          }
        } catch (err) {
          fileLogger.warn('[dev-server] buildThinkingBlocksFromOrchestration 轨迹 fallback 查询失败（容忍：无迭代明细）', err instanceof Error ? err.message : String(err));
        }
      }

      const steps: any[] = [];
      let content = '';
      let outputAnswer = row.answer ? String(row.answer) : undefined;
      let fullPrompt = '';
      let fullRawResponse = '';
      let sumInputTokens = 0;
      let sumOutputTokens = 0;
      let hasActTools = false;
      let firstPromptRef: any = null;
      let firstRefIndex = -1;

      if (iterJson) {
        try {
          iters = JSON.parse(String(iterJson));
          if (Array.isArray(iters)) {
            for (const iter of iters) {
              if (iter.think) {
                if (!fullPrompt && iter.think.prompt) fullPrompt = String(iter.think.prompt);
                if (!fullPrompt && iter.think.prompt_ref && !firstPromptRef) {
                  firstPromptRef = iter.think.prompt_ref;
                  firstRefIndex = Number(iter.iteration_index ?? 0);
                }
                if (iter.think.raw_response && !fullRawResponse) fullRawResponse = String(iter.think.raw_response);
                if (iter.think.input_tokens) sumInputTokens += Number(iter.think.input_tokens);
                if (iter.think.output_tokens) sumOutputTokens += Number(iter.think.output_tokens);

                const reasoning = String(iter.think.reasoning ?? '');
                if (reasoning) {
                  content += (content ? '\n' : '') + reasoning;
                  steps.push({
                    phase: 'THINK',
                    iteration: iter.iteration_index ?? (steps.length + 1),
                    content: reasoning,
                    input: iter.think.prompt ? String(iter.think.prompt) : undefined,
                    output: iter.think.raw_response ? String(iter.think.raw_response) : undefined,
                    tokenUsage: iter.think.token_usage,
                    elapsedMs: iter.iteration_elapsed_ms,
                  });
                }
              }
              if (iter.act) {
                const toolName = String(iter.act.tool_type || iter.act.tool_id || 'Tool');
                if (toolName !== 'NONE') {
                  hasActTools = true;
                  steps.push({
                    phase: 'ACT',
                    iteration: iter.iteration_index ?? (steps.length + 1),

                    input: iter.think?.prompt ? String(iter.think.prompt) : undefined,
                    output: iter.act.result !== undefined && iter.act.result !== null ? String(iter.act.result) : undefined,
                    toolCalls: [{
                      toolName: toolName,
                      toolType: String(iter.act.tool_type || 'Tool'),
                      params: iter.act.params,
                      result: iter.act.result,
                    }],
                    elapsedMs: iter.iteration_elapsed_ms,
                  });
                }
              }
              if (iter.reflect) {
                if (!fullPrompt && iter.reflect.prompt) fullPrompt = String(iter.reflect.prompt);
                if (!fullPrompt && iter.reflect.prompt_ref && !firstPromptRef) {
                  firstPromptRef = iter.reflect.prompt_ref;
                  firstRefIndex = Number(iter.iteration_index ?? 0);
                }
                if (iter.reflect.raw_response && !fullRawResponse) fullRawResponse = String(iter.reflect.raw_response);
                if (iter.reflect.input_tokens) sumInputTokens += Number(iter.reflect.input_tokens);
                if (iter.reflect.output_tokens) sumOutputTokens += Number(iter.reflect.output_tokens);

                steps.push({
                  phase: 'REFLECT',
                  iteration: iter.iteration_index ?? (steps.length + 1),
                  reflection: String(iter.reflect.reflection ?? ''),
                  passed: iter.reflect.should_continue === false,
                  input: iter.reflect.prompt ? String(iter.reflect.prompt) : undefined,
                  output: iter.reflect.raw_response ? String(iter.reflect.raw_response) : undefined,
                  elapsedMs: iter.iteration_elapsed_ms,
                });
              }
              if (iter.answer) {
                if (!fullPrompt && iter.answer.prompt) fullPrompt = String(iter.answer.prompt);
                if (!fullPrompt && iter.answer.prompt_ref && !firstPromptRef) {
                  firstPromptRef = iter.answer.prompt_ref;
                  firstRefIndex = Number(iter.iteration_index ?? 0);
                }
                if (iter.answer.raw_response) fullRawResponse = String(iter.answer.raw_response);
                if (iter.answer.input_tokens) sumInputTokens += Number(iter.answer.input_tokens);
                if (iter.answer.output_tokens) sumOutputTokens += Number(iter.answer.output_tokens);
                if (iter.answer.answer && !outputAnswer) {
                  outputAnswer = String(iter.answer.answer);
                }
              }
            }
          }
        } catch {  }
      }

      if (!content && inputQuery) {
        content = inputQuery;
      }

      if (!fullPrompt && firstPromptRef && rebuilder) {
        fullPrompt = await rebuildPromptFromRef(rebuilder, firstPromptRef, firstRefIndex, iters, triples);
      }
      if (!fullPrompt && inputQuery) {
        fullPrompt = inputQuery;
      }

      if (!fullRawResponse) {
        fullRawResponse = outputAnswer || '';
      }

      if (sumInputTokens === 0 && sumOutputTokens === 0) {
        if (tokenUsage > 0) {
          sumInputTokens = Math.round(tokenUsage * 0.7);
          sumOutputTokens = Math.max(0, tokenUsage - sumInputTokens);
        } else {
          const pTokens = Math.ceil((fullPrompt.length || 0) / 4);
          const rTokens = Math.ceil((fullRawResponse.length || 0) / 4);
          if (pTokens > 0 || rTokens > 0) {
            sumInputTokens = pTokens;
            sumOutputTokens = rTokens;
          }
        }
      }

      const thinkingStrategy = hasActTools ? 'ReACT' : 'CoT';

      const block = {
        id: `block-think-${wid}-${agentId}`,
        msgId: '',
        role: 'assistant',
        type: 'ThinkingChain',
        content,
        summary: '',
        durationMs: Number(row.elapsed_ms ?? 0),
        tokenUsage: tokenUsage || (sumInputTokens + sumOutputTokens),
        inputTokens: sumInputTokens,
        outputTokens: sumOutputTokens,
        thinkingStrategy,
        prompt: fullPrompt,
        rawResponse: fullRawResponse,
        agentInfo: {
          id: agentId,
          name: agentName,
          type: agentType,
          llmId,
          soulId,
          promptId: firstPromptRef?.template_id ? String(firstPromptRef.template_id) : undefined,
        },
        context: contextData,
        input: inputQuery,
        output: outputAnswer || fullRawResponse,
        steps,
        meta: {
          status: 'done',
          createdAt: Number(row.created ?? Date.now()),
          updatedAt: Number(row.created ?? Date.now()),
        },
      };

      if (!workBlocksMap.has(wid)) {
        workBlocksMap.set(wid, []);
      }
      workBlocksMap.get(wid)!.push(block);
    }
  } catch {  }

  return { workBlocksMap, workDagMap };
}
