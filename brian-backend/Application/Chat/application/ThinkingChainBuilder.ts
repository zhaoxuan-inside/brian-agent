import { PromptRebuilder } from '../../../Agent/AgentExecution/application/trace/PromptRebuilder';
import { InfoCoreContext } from '../../../Core/InfoCoreProvider';
import type { RelationDBAccess } from '../../../Base/RelationDBProvider/access/RelationDBAccess';

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
export async function buildThinkingBlocksAndDag(
  relationDb: RelationDBAccess,
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

    // 预先查询 Work 对应的 Task/Agent DAG 关系记录
    const dagRows = relationDb.queryRaw<Record<string, unknown>>(
      `SELECT r.plan_id, r.agent_dag_json, p.work_id, p.task_dag 
       FROM orchestration_agent_dag_record r
       LEFT JOIN agent_plan p ON r.plan_id = p.plan_id
       WHERE p.work_id IN (${placeholders})`,
      workIds,
    );

    const dagNodeInfoMap = new Map<string, { label: string; domain?: string; taskContent?: string }>();
    const workStrategyMap = new Map<string, string>();

    // 查询 orchestration_work 表获取真实的编排策略
    try {
      const strategyRows = relationDb.queryRaw<{ work_id: string; orchestration_strategy: string }>(
        `SELECT work_id, orchestration_strategy FROM orchestration_work WHERE work_id IN (${placeholders})`,
        workIds,
      );
      for (const sRow of strategyRows) {
        const wId = String(sRow.work_id ?? '');
        if (wId) workStrategyMap.set(wId, String(sRow.orchestration_strategy ?? ''));
      }
    } catch { /* degrade gracefully */ }
    
    for (const dRow of dagRows) {
      const wId = String(dRow.work_id ?? '');
      let dagObj: any = undefined;
      try { if (dRow.agent_dag_json) dagObj = JSON.parse(String(dRow.agent_dag_json)); } catch { /* ignore */ }

      // ===== 修改后：解析 agent_plan.task_dag 得到 Planner 的任务级拆解（Task DAG），
      //      并随 workDagMap 一起下发供"思考过程"弹窗展示 Planning 策略拆解 =====
      let taskDagObj: any = undefined;
      try { if (dRow.task_dag) taskDagObj = JSON.parse(String(dRow.task_dag)); } catch { /* ignore */ }

      const taskDagNodes = (taskDagObj && Array.isArray(taskDagObj.nodes) ? taskDagObj.nodes : [])
        .map((t: any, i: number) => {
          const content = String(t.task_content ?? '');
          const domain = String(t.task_domain ?? '');
          return {
            id: String(t.task_id ?? `task-${i}`),
            label: domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`),
            domain,
            content,
            complexity: Number(t.task_complexity ?? 0),
            priority: Number(t.priority ?? 0),
            dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
          };
        });
      const taskDagEdges = (taskDagObj && Array.isArray(taskDagObj.edges) ? taskDagObj.edges : [])
        .map((e: any) => ({
          source: String(e.from_task_id ?? ''),
          target: String(e.to_task_id ?? ''),
        }));

      if (dagObj && Array.isArray(dagObj.agent_nodes)) {
        for (let idx = 0; idx < dagObj.agent_nodes.length; idx++) {
          const node = dagObj.agent_nodes[idx];
          const agId = String(node.agent_id ?? '');
          const domain = String(node.task_domain || '');
          const content = String(node.task_content || '');
          const shortTitle = domain || (content ? content.slice(0, 16) : `子任务 #${idx + 1}`);
          const label = `任务 ${idx + 1}: ${shortTitle}`;

          if (agId) {
            dagNodeInfoMap.set(agId, { label, domain, taskContent: content });
          }
        }

        if (wId) {
          workDagMap.set(wId, {
            planId: dagObj.plan_id,
            totalCount: dagObj.total_agent_count || dagObj.agent_nodes.length,
            taskDag: taskDagNodes.length > 0
              ? { nodes: taskDagNodes, edges: taskDagEdges }
              : undefined,
            nodes: dagObj.agent_nodes.map((n: any, i: number) => {
              const domain = String(n.task_domain || '');
              const content = String(n.task_content || '');
              const title = domain || (content ? content.slice(0, 16) : `任务 #${i + 1}`);
              return {
                // 节点主键改用 task_id（唯一），agent_id 仅作展示/执行联动字段：
                // 同一 Agent 可复用到多个任务（如 30fb48e6 同时承担 task_2 / task_4），
                // 若以 agent_id 为主键会重复 key 导致画布节点折叠、依赖边形成假环、布局塌陷。
                id: String(n.task_id || `task-${i}`),
                agentId: String(n.agent_id || ''),
                label: `任务 ${i + 1}: ${title}`,
                domain,
                content,
                status: n.status || 'COMPLETED',
                taskId: String(n.task_id || ''),
              };
            }),
            edges: (dagObj.agent_edges || []).map((e: any) => ({
              // 依赖边按任务级 id 关联（与节点主键 task_id 一致），避免 agent 复用导致的假环
              source: String(e.from_task_id || ''),
              target: String(e.to_task_id || ''),
              label: String(e.data_dependency || ''),
            })),
          });
        }
      }
    }

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

    // 预计算每个 work 的 Work Agent 是否产生有效输出：Work Agent 空输出时，
    // 后续 Writer / Evolutor 等系统 Agent 的展示块应被跳过（不应展示在思考过程里）。
    const workAgentHasOutput = new Map<string, boolean>();
    for (const row of execRows) {
      if (String(row.execution_type ?? '') === 'SINGLE') {
        const wid = String(row.work_id ?? '');
        const ans = row.answer ? String(row.answer).trim() : '';
        if (ans) workAgentHasOutput.set(wid, true);
      }
    }

    // 查询 orchestration_work.metadata 获取 IntentAgent 需求理解结果
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
        } catch { /* ignore */ }
      }
    }

    // 为每个 work 创建 IntentAgent 的 ThinkingBlock
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

    // 预查询每个 work 的上下文三对象（source_ids_map / content_map / attribute_map），
    // 由 InfoCoreProvider.soContextByWork 从 info_context_source 表 + info_raw 回查得到。
    const workContextTriplesMap = new Map<string, any>();
    if (infoCore && typeof infoCore.soContextByWork === 'function') {
      for (const wid of workIds) {
        if (!wid) continue;
        try {
          const soOut: any = { source_ids_map: {}, content_map: {}, attribute_map: {} };
          await infoCore.soContextByWork({ work_id: wid }, soOut, new InfoCoreContext());
          workContextTriplesMap.set(wid, soOut);
        } catch { /* ignore */ }
      }
    }

    for (const row of execRows) {
      const wid = String(row.work_id ?? '');
      if (!wid) continue;

      // 系统 Agent（Writer / Evolutor）在 Work Agent 无有效输出时不应展示
      if (String(row.execution_type ?? '') === 'SYSTEM' && !workAgentHasOutput.get(wid)) {
        continue;
      }

      const agentId = String(row.agent_id ?? '');
      const rawAgentName = String(row.agent_name ?? '');

      // 优先使用数据库记录的具有业务特性的 agent_name，严格消除 UUID
      let agentName = rawAgentName;
      const isUuid = !agentName || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentName) || agentName === agentId;

      if (isUuid) {
        if (dagNodeInfoMap.has(agentId)) {
          agentName = dagNodeInfoMap.get(agentId)!.label;
        } else {
          const currIdx = (agentIndexCounter.get(wid) ?? 0) + 1;
          agentIndexCounter.set(wid, currIdx);
          
          let domainFromTask = '';
          if (row.task_content) {
            try {
              const p = JSON.parse(String(row.task_content));
              if (p && p.task_domain) domainFromTask = String(p.task_domain);
              else if (p && p.user_query) domainFromTask = String(p.user_query).slice(0, 16);
            } catch { /* ignore */ }
          }

          agentName = domainFromTask ? `执行 Agent ${currIdx}: ${domainFromTask}` : `执行 Agent #${currIdx}`;
        }
      }

      const agentType = String(row.agent_type ?? 'WORKER');
      const llmId = row.llm_id ? String(row.llm_id) : undefined;
      const soulId = row.soul_id ? String(row.soul_id) : undefined;

      // 解析 task_content 构造完整的 Input 与 Context 数据
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

      // ===== 修改后的代码：task_content 为纯任务内容（不再拼 work_context 前缀），
      //      上下文改经 InfoCoreProvider.soContextByWork(work_id) 从 info_context_source 表 + info_raw 回查 =====
      if (row.task_content) {
        const rawContentStr = String(row.task_content);
        // 兼容历史数据：旧记录 task_content 可能仍携带 work_context JSON 前缀，按 \n---\n 剥离
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

        // 各来源的消息列表（只携带 info_id 与内容，不展示属性）
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

      // 如果精确匹配 trace_id 没有找到 iterations_json，再次尝试使用 agent_id + created 拟合获取 trace
      let iterJson = row.iterations_json;
      let tokenUsage = row.total_token_usage ? Number(row.total_token_usage) : 0;
      // 轨迹迭代数组（外层作用域声明，供后续 prompt 重建使用；缺失 trace 时为 [])
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
        } catch { /* ignore fallback error */ }
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
        } catch { /* ignore */ }
      }

      if (!content && inputQuery) {
        content = inputQuery;
      }
      // 新格式：无完整 prompt，按 prompt_ref 经 PromptProvider 重建（补 context 与 history）
      if (!fullPrompt && firstPromptRef && rebuilder) {
        fullPrompt = await rebuildPromptFromRef(rebuilder, firstPromptRef, firstRefIndex, iters, triples);
      }
      if (!fullPrompt && inputQuery) {
        fullPrompt = inputQuery;
      }
      // 模型的完整回复只允许回退到最终答案，禁止回退到 content/inputQuery（用户输入），
      // 否则“模型的完整回复 (LLM Response)”会误显示成用户本次发送的内容。
      if (!fullRawResponse) {
        fullRawResponse = outputAnswer || '';
      }
      // ===== 修改后的代码：精准/估算 Token 用量，防止非零 Token 显示为 0 =====
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

      // 同步补全 workDagMap 中节点的输入输出、执行状态和 token 统计
      // （执行状态由 orchestration_agent_execution.status 决定：COMPLETED 成功 / EXEC_FAILED 失败 / CANCELLED·PENDING 未执行）
      if (workDagMap.has(wid)) {
        const dagData = workDagMap.get(wid);
        // 按 task_id 精确定位节点：同一 Agent 复用多个任务时，每条执行记录对应唯一 task，
        // 避免 find(agentId) 只命中第一个任务节点导致复用任务的节点信息缺失。
        const taskIdOfRow = String(row.task_id ?? '');
        const nodeInDag = taskIdOfRow
          ? dagData.nodes.find((n: any) => n.taskId === taskIdOfRow)
          : dagData.nodes.find((n: any) => n.agentId === agentId);
        if (nodeInDag) {
          nodeInDag.agentName = agentName;
          nodeInDag.input = inputQuery;
          nodeInDag.output = outputAnswer;
          nodeInDag.elapsedMs = Number(row.elapsed_ms ?? 0);
          nodeInDag.tokenUsage = tokenUsage;
          const execStatus = String(row.status ?? '').toUpperCase();
          if (execStatus.includes('COMPLET') || execStatus.includes('SUCCESS')) {
            nodeInDag.status = 'COMPLETED';
          } else if (execStatus.includes('FAIL') || execStatus.includes('ERROR')) {
            nodeInDag.status = 'EXEC_FAILED';
          } else if (execStatus.includes('CANCEL')) {
            nodeInDag.status = 'CANCELLED';
          } else if (execStatus.includes('RUN') || execStatus.includes('PROCESS')) {
            nodeInDag.status = 'RUNNING';
          } else {
            nodeInDag.status = 'PENDING';
          }
        }
      }
    }
  } catch { /* degrade gracefully */ }

  return { workBlocksMap, workDagMap };
}
export { buildThinkingBlocksAndDag };
