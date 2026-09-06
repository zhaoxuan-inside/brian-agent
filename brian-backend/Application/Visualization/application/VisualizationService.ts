import { Metrics, Report } from '@brian-agent/base';
import type {
  RelationDBAccess,
  LLMAccess,
  SoulAccess,
  SkillAccess,
  MCPAccess,
  PromptsAccess,
  GraphDBAccess,
  Logger,
} from '@brian-agent/base';
import {
  IdGenerator,
  Operator,
  InfoType,
  GetLLMInput,
  GetLLMOutput,
  LLMContext,
  GetSoulInput,
  GetSoulOutput,
  SoulContext,
  GetSkillInput,
  GetSkillOutput,
  SkillContext,
  GetMcpInput,
  GetMcpOutput,
  McpContext,
  GetPromptInput,
  GetPromptOutput,
  PromptContext,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { InfoCoreContext, LastNInfoInput, LastNInfoOutput, GraphInfoInput, GraphInfoOutput, SoCitationEdgesInput, SoCitationEdgesOutput } from '@brian-agent/core';
import type {
  AgentExecutionAccess,
  AgentLibraryAccess,
  AgentContextAccess,
  EvolutorAgentAccess,
  PlannerAgentAccess,
} from '@brian-agent/agent';
import {
  AgentExecutionContext,
  GetTraceInput,
  GetTraceOutput,
  AgentLibraryContext,
  GetAgentInput,
  GetAgentOutput,
  AgentContextContext,
  GetContextDetailInput,
  GetContextDetailOutput,
  EvolutorAgentContext,
  GetEvaluationInput,
  GetEvaluationOutput,
  PlannerAgentContext,
  GetPlanInput,
  GetPlanOutput,
} from '@brian-agent/agent';
import {
  VisualizationContext,
  GetVisualizedMessagesInput,
  GetVisualizedMessagesOutput,
  GetVisualizedMessageGraphInput,
  GetVisualizedMessageGraphOutput,
  GetVisualizedAgentDAGInput,
  GetVisualizedAgentDAGOutput,
  GetVisualizedWorkFlowInput,
  GetVisualizedWorkFlowOutput,
  GetAgentTraceInput,
  GetAgentTraceOutput,
  GetVisualizedMessageDAGInput,
  GetVisualizedMessageDAGOutput,
  GetResourceInput,
  GetResourceOutput,
  ConfigVisualizationInput,
  ConfigVisualizationOutput,
  VISUALIZATION_CONFIG_TABLE,
  INFO_RAW_TABLE,
  DEFAULT_MAX_NODES_PER_GRAPH,
  DEFAULT_MESSAGE_SUMMARY_LENGTH,
  DEFAULT_RESOLVE_CONTENT_BY_DEFAULT,
  QUESTION_ANSWER_EDGE_TYPE,
  CITATION_EDGE_TYPE,
  FOLLOW_UP_EDGE_TYPE,
  GraphVisualizationConfigInput,
  GraphVisualizationConfigOutput,
  DEFAULT_GRAPH_REPULSION,
  DEFAULT_GRAPH_SPRING_STRENGTH,
} from '../domain/types';

interface VisualizationConfigRow {
  id: string;
  max_nodes_per_graph: number;
  default_message_summary_length: number;
  resolve_content_by_default: number;
  tag_graph_repulsion: number;
  tag_graph_spring_strength: number;
  tag_graph_show_labels: number;
  keyword_graph_repulsion: number;
  keyword_graph_spring_strength: number;
  keyword_graph_show_labels: number;
}

interface CitationData {
  citingInfoIds: string[];
  citedInfoIds: string[];
  citingCount: number;
  citedCount: number;
}

export class VisualizationService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly agentExecution: AgentExecutionAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentContext: AgentContextAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly plannerAgent: PlannerAgentAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly llmAccess: LLMAccess,
    private readonly soulAccess: SoulAccess,
    private readonly skillAccess: SkillAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly graphDBAccess: GraphDBAccess,
    private readonly logger?: Logger,
  ) {}

  async soVisualizedMessages(input: GetVisualizedMessagesInput, output: GetVisualizedMessagesOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const lastN = input.lastN ?? 50;
    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;
    const includeCitingInfo = input.include_citing_info ?? true;
    const includeContextSource = input.include_context_source ?? false;

    const lastNOut = new LastNInfoOutput();
    const lastNInput = Object.assign(new LastNInfoInput(), {
      session_id: input.session_id,
      work_id: input.work_id,
      interact_id: input.interact_id,
      lastN,
    });

    try {
      await this.infoCore.lastNInfo(lastNInput, lastNOut, new InfoCoreContext());
    } catch (err) {
      this.logWarn('lastNInfo failed', err);
      return true;
    }

    const allMessages = lastNOut.list.map((row) => ({
      id: String(row.id ?? ''),
      created: Number(row.created ?? 0),
      updated: Number(row.updated ?? 0),
      session_id: String(row.session_id ?? ''),
      work_id: String(row.work_id ?? ''),
      interact_id: String(row.interact_id ?? ''),
      info_id: String(row.info_id ?? ''),
      info_type: String(row.info_type ?? ''),
      info_creator_id: String(row.info_creator_id ?? ''),
      info_creator_role: String(row.info_creator_role ?? ''),
      info: String(row.info ?? ''),
      info_length: Number(row.info_length ?? 0),
      pin: Number(row.pin ?? 0),
      handle_result_type: String(row.handle_result_type ?? ''),
    }));

    const total = allMessages.length;
    const startIdx = (pageCurrent - 1) * pageSize;
    const pagedMessages = allMessages.slice(startIdx, startIdx + pageSize);

    const infoIds = pagedMessages.map((m) => m.info_id).filter(Boolean);
    const citationMap = await this.buildCitationMap(infoIds, includeCitingInfo);

    const enhancedMessages: Array<Record<string, unknown>> = [];

    for (const msg of pagedMessages) {
      const enhanced: Record<string, unknown> = { ...msg };
      const infoId = msg.info_id;

      if (includeCitingInfo && infoId) {
        const citeData = citationMap.get(infoId);
        if (citeData) {
          enhanced.citing_info_ids = citeData.citingInfoIds;
          enhanced.cited_info_ids = citeData.citedInfoIds;
          enhanced.citing_count = citeData.citingCount;
          enhanced.cited_count = citeData.citedCount;
        } else {
          enhanced.citing_info_ids = [];
          enhanced.cited_info_ids = [];
          enhanced.citing_count = 0;
          enhanced.cited_count = 0;
        }
      }

      if (includeContextSource && infoId && msg.info_creator_role === 'AGENT') {
        enhanced.context_source_info = await this.resolveContextSourceInfo(infoId);
      }

      if (infoId) {
        const parents = await this.buildParentInfoIds(infoId);
        enhanced.parent_info_ids = parents;
      }

      enhancedMessages.push(enhanced);
    }

    output.messages = enhancedMessages;
    output.total = total;
    return true;
  }

  async soVisualizedMessageGraph(input: GetVisualizedMessageGraphInput, output: GetVisualizedMessageGraphOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const maxNodes = input.max_nodes ?? config.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH;

    const graphOut = new GraphInfoOutput();
    try {
      await this.infoCore.graphInfo(
        Object.assign(new GraphInfoInput(), { session_id: input.session_id }),
        graphOut,
        new InfoCoreContext(),
      );
    } catch (err) {
      this.logWarn('graphInfo failed', err);
      output.session_id = input.session_id;
      output.graph = { nodes: [], edges: [] };
      output.metadata = { error: 'graphInfo failed' };
      return true;
    }

    const rawGraph = graphOut.graph;
    const rawNodes = (rawGraph.nodes ?? []) as Array<{ id: string; label: string; info_id: string; info_type?: string; info_creator_role?: string; handle_result_type?: string }>;
    const rawEdges = (rawGraph.edges ?? []) as Array<{ id: string; from: string; to: string; citing_info_id: string; cited_info_id: string; edge_type?: string }>;

    // 截断节点（graphInfo 已统一以 info_id 作为节点 id，与边 from/to 同命名空间）
    const limitedNodes = rawNodes.slice(0, maxNodes);
    const limitedNodeIds = new Set(limitedNodes.map((n) => n.id));

    const infoIds = limitedNodes.map((n) => n.info_id).filter(Boolean);
    const summaryMap = await this.buildSummaryMap(infoIds);
    const globalCitationMap = await this.buildCitationMap([...new Set(infoIds)], true);
    const summaryLength = config.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH;

    const enhancedNodes = limitedNodes.map((node) => {
      const infoId = node.info_id;
      const summary = summaryMap.get(infoId);
      const citeData = globalCitationMap.get(infoId);
      return {
        id: node.id,
        label: node.label ?? '',
        info_id: infoId ?? '',
        info_type: node.info_type ?? '',
        info_creator_role: node.info_creator_role ?? '',
        handle_result_type: node.handle_result_type ?? '',
        info_summary: this.truncate(summary ?? node.label ?? infoId ?? '', summaryLength),
        citing_count: citeData?.citingCount ?? 0,
        cited_count: citeData?.citedCount ?? 0,
      };
    });

    // 过滤边：只保留两端节点均未被截断的边
    const enhancedEdges = rawEdges
      .filter((edge) => limitedNodeIds.has(edge.from) && limitedNodeIds.has(edge.to))
      .map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        citing_info_id: edge.citing_info_id ?? '',
        cited_info_id: edge.cited_info_id ?? '',
        edge_type: edge.edge_type ?? 'CITATION',
      }));

    const totalNodes = rawNodes.length;
    const totalEdges = rawEdges.length;

    output.session_id = input.session_id;
    output.graph = {
      nodes: enhancedNodes,
      edges: enhancedEdges,
    };
    output.metadata = {
      total_nodes: totalNodes,
      total_edges: totalEdges,
      displayed_nodes: enhancedNodes.length,
      displayed_edges: enhancedEdges.length,
      max_nodes_limit: maxNodes,
      truncated: totalNodes > maxNodes,
    };
    return true;
  }

  async soVisualizedAgentDAG(input: GetVisualizedAgentDAGInput, output: GetVisualizedAgentDAGOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // V1 编排可视化已移除（Orchestration 模块删除）；agent DAG 数据由前端事件流归约
    output.dag = { nodes: [], edges: [] };
    return true;
  }

  async soVisualizedWorkFlow(input: GetVisualizedWorkFlowInput, output: GetVisualizedWorkFlowOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // V1 编排可视化已移除；timeline 由前端事件流归约
    output.timeline = { events: [] } as Record<string, unknown>;
    return true;
  }

  async soAgentTrace(input: GetAgentTraceInput, output: GetAgentTraceOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const traceId = input.trace_id ?? '';
    const traceOut = new GetTraceOutput();

    if (traceId) {
      try {
        await this.agentExecution.soTrace(
          Object.assign(new GetTraceInput(), { trace_id: traceId }),
          traceOut,
          new AgentExecutionContext(),
        );
      } catch (err) {
        this.logWarn('soTrace by trace_id failed', err);
        output.trace = { error: 'soTrace failed', trace_id: traceId, agent_id: input.agent_id };
        return true;
      }
    }

    if (!traceOut.trace && input.agent_id) {
      try {
        await this.agentExecution.soTrace(
          Object.assign(new GetTraceInput(), { trace_id: input.agent_id }),
          traceOut,
          Object.assign(new AgentExecutionContext(), { trace_id: input.agent_id }),
        );
      } catch (err) {
        this.logWarn('soTrace by agent_id failed', err);
      }
    }

    if (!traceOut.trace) {
      output.trace = { error: 'no trace found', agent_id: input.agent_id, trace_id: traceId };
      return true;
    }

    const rawTrace = traceOut.trace;
    const steps: Array<Record<string, unknown>> = [];

    for (const iteration of (rawTrace.iterations ?? []) as unknown as Array<Record<string, unknown>>) {
      const iterIdx = iteration.iteration_index ?? 0;

      if (iteration.think) {
        steps.push({
          phase: 'THINK',
          iteration: iterIdx,
          content: (iteration.think as Record<string, unknown>)?.reasoning ?? '',
          token_usage: (iteration.think as Record<string, unknown>)?.token_usage ?? 0,
          elapsed_ms: iteration.iteration_elapsed_ms ?? 0,
        });
      }

      if (iteration.act) {
        const actData = iteration.act as Record<string, unknown>;
        const toolCalls = Array.isArray(actData.tool_calls) ? actData.tool_calls as Array<Record<string, unknown>> : [];
        const resolvedCalls = await this.resolveToolCalls(toolCalls);

        steps.push({
          phase: 'ACT',
          iteration: iterIdx,
          tool_calls: resolvedCalls,
          result: actData.result ?? '',
          token_usage: actData.token_usage ?? 0,
          elapsed_ms: iteration.iteration_elapsed_ms ?? 0,
        });
      }

      if (iteration.reflect) {
        steps.push({
          phase: 'REFLECT',
          iteration: iterIdx,
          reflection: (iteration.reflect as Record<string, unknown>)?.reflection ?? '',
          should_continue: (iteration.reflect as Record<string, unknown>)?.should_continue ?? false,
          token_usage: (iteration.reflect as Record<string, unknown>)?.token_usage ?? 0,
          elapsed_ms: iteration.iteration_elapsed_ms ?? 0,
        });
      }
    }

    output.trace = {
      trace_id: rawTrace.trace_id,
      agent_id: rawTrace.agent_id,
      start_time: rawTrace.start_time,
      end_time: rawTrace.end_time,
      total_elapsed_ms: rawTrace.total_elapsed_ms,
      total_token_usage: rawTrace.total_token_usage,
      iteration_count: (rawTrace.iterations as unknown[])?.length ?? 0,
      steps,
      final_answer: this.extractFinalAnswer(rawTrace),
    };
    return true;
  }

  async soVisualizedMessageDAG(input: GetVisualizedMessageDAGInput, output: GetVisualizedMessageDAGOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const maxNodes = input.max_nodes ?? config.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH;
    const rawRows = await this.queryMessageRows(input);
    if (rawRows === null) {
      output.session_id = input.session_id;
      output.graph = { nodes: [], edges: [] };
      output.metadata = { error: 'query info_raw failed' };
      return true;
    }

    const nodes = await this.buildMessageNodes(rawRows, maxNodes);
    const edges = await this.buildMessageEdges(rawRows, nodes, input);

    output.session_id = input.session_id;
    output.graph = { nodes, edges };
    output.metadata = this.buildDagMetadata(rawRows, nodes, edges, maxNodes, input);
    return true;
  }

  private async queryMessageRows(
    input: GetVisualizedMessageDAGInput,
  ): Promise<Array<Record<string, unknown>> | null> {
    let rawRows: Array<Record<string, unknown>> = [];
    try {
      rawRows = await this.relationDb.select(INFO_RAW_TABLE, {
        conditions: [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }],
        order_by: [{ field: 'created', direction: 'DESC' as const }],
        fields: ['id', 'created', 'session_id', 'work_id', 'interact_id', 'info_id', 'info_type', 'info_creator_id', 'info_creator_role', 'info', 'info_length', 'pin', 'trace_id', 'handle_result_type'],
      });
    } catch (err) {
      this.logWarn('query info_raw failed', err);
      return null;
    }
    if (input.work_id) {
      rawRows = rawRows.filter((r) => String(r.work_id ?? '') === input.work_id);
    }
    return rawRows;
  }

  private async buildMessageNodes(
    rawRows: Array<Record<string, unknown>>,
    maxNodes: number,
  ): Promise<Array<Record<string, unknown>>> {
    const nodeRows = this.collectNodeRows(rawRows, maxNodes);
    const infoIds = nodeRows.map((r) => String(r.info_id ?? '')).filter(Boolean);
    const [summaryMap, citationMap] = await Promise.all([
      this.buildSummaryMap(infoIds),
      this.buildCitationMap(infoIds, true),
    ]);
    return nodeRows.map((row) => this.buildMessageNode(row, summaryMap, citationMap));
  }

  private collectNodeRows(
    rawRows: Array<Record<string, unknown>>,
    maxNodes: number,
  ): Array<Record<string, unknown>> {
    const nodeSet = new Set<string>();
    const nodeRows: Array<Record<string, unknown>> = [];
    for (const row of rawRows) {
      const infoId = String(row.info_id ?? '');
      if (!infoId || nodeSet.has(infoId)) continue;
      nodeSet.add(infoId);
      nodeRows.push(row);
      if (nodeRows.length >= maxNodes) break;
    }
    return nodeRows;
  }

  private buildMessageNode(
    row: Record<string, unknown>,
    summaryMap: Map<string, string>,
    citationMap: Map<string, CitationData>,
  ): Record<string, unknown> {
    const infoId = String(row.info_id ?? '');
    const cite = citationMap.get(infoId);
    return {
      id: infoId,
      label: infoId.slice(0, 16),
      info_id: infoId,
      work_id: String(row.work_id ?? ''),
      interact_id: String(row.interact_id ?? ''),
      info_type: String(row.info_type ?? ''),
      info_creator_role: String(row.info_creator_role ?? ''),
      trace_id: String(row.trace_id ?? ''),
      handle_result_type: String(row.handle_result_type ?? ''),
      info_summary: summaryMap.get(infoId) ?? '',
      info: String(row.info ?? ''),
      info_length: Number(row.info_length ?? 0),
      created: Number(row.created ?? 0),
      pin: Number(row.pin ?? 0) === 1,
      citing_count: cite?.citingCount ?? 0,
      cited_count: cite?.citedCount ?? 0,
      citing_info_ids: cite?.citingInfoIds ?? [],
      cited_info_ids: cite?.citedInfoIds ?? [],
    };
  }

  private async buildMessageEdges(
    rawRows: Array<Record<string, unknown>>,
    nodes: Array<Record<string, unknown>>,
    input: GetVisualizedMessageDAGInput,
  ): Promise<Array<Record<string, unknown>>> {
    const edges: Array<Record<string, unknown>> = [];
    if (input.include_question_answer_edges ?? true) {
      edges.push(...this.buildQuestionAnswerEdges(rawRows));
    }
    if (input.include_citation_edges ?? true) {
      edges.push(...(await this.buildCitationEdges(nodes)));
      this.appendFollowUpEdges(nodes, edges);
    }
    return this.dedupeEdges(edges);
  }

  private buildQuestionAnswerEdges(
    rawRows: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    const edges: Array<Record<string, unknown>> = [];
    for (const [reqId, respId, workId] of this.iterQuestionAnswerPairs(rawRows)) {
      const dirKey = `${reqId}->${respId}`;
      edges.push({ id: `qa_${dirKey}`, from: reqId, to: respId, edge_type: QUESTION_ANSWER_EDGE_TYPE, work_id: workId });
    }
    return edges;
  }

  private *iterQuestionAnswerPairs(
    rawRows: Array<Record<string, unknown>>,
  ): Generator<[string, string, string]> {
    for (const [workId, rows] of this.groupRowsByWork(rawRows)) {
      const reqIds: string[] = [];
      const respIds: string[] = [];
      for (const row of rows) {
        const id = String(row.info_id ?? '');
        if (!id) continue;
        const isRequest = String(row.info_type ?? '').toUpperCase() === InfoType.REQUEST;
        (isRequest ? reqIds : respIds).push(id);
      }
      for (const req of reqIds) {
        for (const resp of respIds) {
          if (req !== resp) yield [req, resp, workId];
        }
      }
    }
  }

  private groupRowsByWork(
    rawRows: Array<Record<string, unknown>>,
  ): Map<string, Array<Record<string, unknown>>> {
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rawRows) {
      const workId = String(row.work_id ?? '');
      if (!workId) continue;
      if (!groups.has(workId)) groups.set(workId, []);
      groups.get(workId)!.push(row);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => Number(a.created ?? 0) - Number(b.created ?? 0));
    }
    return groups;
  }

  private async buildCitationEdges(
    nodes: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> {
    const allInfoIds = new Set(nodes.map((n) => String(n.info_id)));
    try {
      const citeOut = new SoCitationEdgesOutput();
      await this.infoCore.soCitationEdges(new SoCitationEdgesInput(), citeOut, new InfoCoreContext());
      return citeOut.edges
        .filter((e) => allInfoIds.has(e.citing_info_id) && e.cited_info_id && e.citing_info_id)
        .map((e) => ({
          id: `cite_${e.cited_info_id}_${e.citing_info_id}`,
          from: e.cited_info_id,
          to: e.citing_info_id,
          edge_type: CITATION_EDGE_TYPE,
        }));
    } catch (err) {
      this.logWarn('query GraphDB citations failed', err);
      return [];
    }
  }

  private appendFollowUpEdges(
    nodes: Array<Record<string, unknown>>,
    edges: Array<Record<string, unknown>>,
  ): void {
    const citingTargetIds = new Set<string>();
    for (const e of edges) {
      if (e.edge_type === CITATION_EDGE_TYPE) citingTargetIds.add(String(e.to));
    }

    const ordered = nodes
      .filter((n) => {
        const t = String(n.info_type ?? '').toUpperCase();
        return t === InfoType.REQUEST || t === InfoType.RESPONSE;
      })
      .sort((a, b) => Number(a.created ?? 0) - Number(b.created ?? 0));

    let lastResponseId: string | null = null;
    for (const n of ordered) {
      const infoId = String(n.info_id ?? '');
      const type = String(n.info_type ?? '').toUpperCase();
      if (type === InfoType.RESPONSE) {
        lastResponseId = infoId;
      } else if (lastResponseId && lastResponseId !== infoId && !citingTargetIds.has(infoId)) {
        edges.push({
          id: `followup_${lastResponseId}->${infoId}`,
          from: lastResponseId,
          to: infoId,
          edge_type: FOLLOW_UP_EDGE_TYPE,
        });
      }
    }
  }

  private dedupeEdges(edges: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const seen = new Set<string>();
    return edges.filter((e) => {
      const key = `${String(e.from)}->${String(e.to)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private buildDagMetadata(
    rawRows: Array<Record<string, unknown>>,
    nodes: Array<Record<string, unknown>>,
    edges: Array<Record<string, unknown>>,
    maxNodes: number,
    input: GetVisualizedMessageDAGInput,
  ): Record<string, unknown> {
    return {
      total_nodes: rawRows.length,
      displayed_nodes: nodes.length,
      total_edges: edges.length,
      max_nodes_limit: maxNodes,
      truncated: rawRows.length > maxNodes,
      include_question_answer: input.include_question_answer_edges ?? true,
      include_citation: input.include_citation_edges ?? true,
    };
  }

  async soResource(input: GetResourceInput, output: GetResourceOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { resource_type, resource_id } = input;

    try {
      switch (resource_type.toLowerCase()) {
        case 'agent': {
          const out = new GetAgentOutput();
          await this.agentLibrary.soAgent(
            Object.assign(new GetAgentInput(), { agent_id: resource_id }),
            out,
            new AgentLibraryContext(),
          );
          output.resource = out.agents.length > 0 ? (out.agents[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'llm': {
          const out = new GetLLMOutput();
          await this.llmAccess.soLLMById(
            Object.assign(new GetLLMInput(), { id: resource_id }),
            out,
            new LLMContext(),
          );
          output.resource = (out.llm ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'soul': {
          const out = new GetSoulOutput();
          await this.soulAccess.soSoulById(
            Object.assign(new GetSoulInput(), { id: resource_id }),
            out,
            new SoulContext(),
          );
          output.resource = (out.soul ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'skill': {
          const out = new GetSkillOutput();
          await this.skillAccess.soSkillById(
            Object.assign(new GetSkillInput(), { id: resource_id }),
            out,
            new SkillContext(),
          );
          output.resource = (out.skill ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'mcp': {
          const out = new GetMcpOutput();
          await this.mcpAccess.soMcpById(
            Object.assign(new GetMcpInput(), { id: resource_id }),
            out,
            new McpContext(),
          );
          output.resource = (out.mcp ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'prompt': {
          const out = new GetPromptOutput();
          await this.promptsAccess.soPromptById(
            Object.assign(new GetPromptInput(), { id: resource_id }),
            out,
            new PromptContext(),
          );
          output.resource = (out.prompt ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'trace': {
          const out = new GetTraceOutput();
          await this.agentExecution.soTrace(
            Object.assign(new GetTraceInput(), { trace_id: resource_id }),
            out,
            new AgentExecutionContext(),
          );
          output.resource = (out.trace ?? {}) as unknown as Record<string, unknown>;
          break;
        }
        case 'info': {
          const out = new LastNInfoOutput();
          await this.infoCore.lastNInfo(
            Object.assign(new LastNInfoInput(), { info_id: resource_id, lastN: 1 }),
            out,
            new InfoCoreContext(),
          );
          output.resource = out.list.length > 0 ? (out.list[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'eval': {
          const out = new GetEvaluationOutput();
          await this.evolutorAgent.soEvaluation(
            Object.assign(new GetEvaluationInput(), { conditions: [{ field: 'eval_id', operator: Operator.EQ, value: resource_id }] }),
            out,
            new EvolutorAgentContext(),
          );
          output.resource = out.evaluations.length > 0 ? (out.evaluations[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'plan': {
          const out = new GetPlanOutput();
          await this.plannerAgent.soPlan(
            Object.assign(new GetPlanInput(), { plan_id: resource_id }),
            out,
            new PlannerAgentContext(),
          );
          output.resource = out.plans.length > 0 ? (out.plans[0] as unknown as Record<string, unknown>) : {};
          break;
        }
        case 'context': {
          const out = new GetContextDetailOutput();
          await this.agentContext.soContextDetail(
            Object.assign(new GetContextDetailInput(), { work_id: resource_id }),
            out,
            new AgentContextContext(),
          );
          output.resource = out as unknown as Record<string, unknown>;
          break;
        }
        default: {
          output.resource = { error: `unknown resource_type: ${resource_type}` };
        }
      }
    } catch (err) {
      this.logWarn(`soResource ${resource_type}/${resource_id} failed`, err);
      output.resource = { error: `soResource failed: ${resource_type}/${resource_id}` };
    }

    return true;
  }

  async configVisualization(input: ConfigVisualizationInput, output: ConfigVisualizationOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let config = await this.getConfigFull();

    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(VISUALIZATION_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'max_nodes_per_graph', value: DEFAULT_MAX_NODES_PER_GRAPH },
        { field: 'default_message_summary_length', value: DEFAULT_MESSAGE_SUMMARY_LENGTH },
        { field: 'resolve_content_by_default', value: DEFAULT_RESOLVE_CONTENT_BY_DEFAULT },
        { field: 'tag_graph_repulsion', value: DEFAULT_GRAPH_REPULSION },
        { field: 'tag_graph_spring_strength', value: DEFAULT_GRAPH_SPRING_STRENGTH },
        { field: 'tag_graph_show_labels', value: 1 },
        { field: 'keyword_graph_repulsion', value: DEFAULT_GRAPH_REPULSION },
        { field: 'keyword_graph_spring_strength', value: DEFAULT_GRAPH_SPRING_STRENGTH },
        { field: 'keyword_graph_show_labels', value: 1 },
      ]);
      config = await this.getConfigFull();
    }

    if (!config) {
      output.config = { error: 'config init failed' };
      return true;
    }

    const data: Array<{ field: string; value: unknown }> = [];
    if (input.max_nodes_per_graph !== undefined) {
      data.push({ field: 'max_nodes_per_graph', value: input.max_nodes_per_graph });
    }
    if (input.default_message_summary_length !== undefined) {
      data.push({ field: 'default_message_summary_length', value: input.default_message_summary_length });
    }
    if (input.resolve_content_by_default !== undefined) {
      data.push({ field: 'resolve_content_by_default', value: input.resolve_content_by_default ? 1 : 0 });
    }
    const prefix = input.graph_type === 'keyword' ? 'keyword_graph' : 'tag_graph';
    if (input.graph_repulsion !== undefined) {
      data.push({ field: `${prefix}_repulsion`, value: input.graph_repulsion });
    }
    if (input.graph_spring_strength !== undefined) {
      data.push({ field: `${prefix}_spring_strength`, value: input.graph_spring_strength });
    }
    if (input.graph_show_labels !== undefined) {
      data.push({ field: `${prefix}_show_labels`, value: input.graph_show_labels ? 1 : 0 });
    }

    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(VISUALIZATION_CONFIG_TABLE, data, [
        { field: 'id', operator: Operator.EQ, value: config.id },
      ]);
    }

    const latest = await this.getConfigFull();
    output.config = {
      max_nodes_per_graph: latest?.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH,
      default_message_summary_length: latest?.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH,
      resolve_content_by_default: latest?.resolve_content_by_default ?? DEFAULT_RESOLVE_CONTENT_BY_DEFAULT,
      tag_graph_repulsion: latest?.tag_graph_repulsion ?? DEFAULT_GRAPH_REPULSION,
      tag_graph_spring_strength: latest?.tag_graph_spring_strength ?? DEFAULT_GRAPH_SPRING_STRENGTH,
      tag_graph_show_labels: (latest?.tag_graph_show_labels ?? 1) === 1,
      keyword_graph_repulsion: latest?.keyword_graph_repulsion ?? DEFAULT_GRAPH_REPULSION,
      keyword_graph_spring_strength: latest?.keyword_graph_spring_strength ?? DEFAULT_GRAPH_SPRING_STRENGTH,
      keyword_graph_show_labels: (latest?.keyword_graph_show_labels ?? 1) === 1,
    };
    return true;
  }

  async soGraphVisualizationConfig(input: GraphVisualizationConfigInput, output: GraphVisualizationConfigOutput, _ctx: VisualizationContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const isKeyword = input.graph_type === 'keyword';
    output.graph_repulsion = isKeyword ? config.keyword_graph_repulsion : config.tag_graph_repulsion;
    output.graph_spring_strength = isKeyword ? config.keyword_graph_spring_strength : config.tag_graph_spring_strength;
    output.graph_show_labels = (isKeyword ? config.keyword_graph_show_labels : config.tag_graph_show_labels) === 1;
    return true;
  }

  private async getConfig(): Promise<VisualizationConfigRow> {
    const full = await this.getConfigFull();
    return {
      id: full?.id ?? '',
      max_nodes_per_graph: full?.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH,
      default_message_summary_length: full?.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH,
      resolve_content_by_default: full?.resolve_content_by_default ?? DEFAULT_RESOLVE_CONTENT_BY_DEFAULT,
      tag_graph_repulsion: full?.tag_graph_repulsion ?? DEFAULT_GRAPH_REPULSION,
      tag_graph_spring_strength: full?.tag_graph_spring_strength ?? DEFAULT_GRAPH_SPRING_STRENGTH,
      tag_graph_show_labels: full?.tag_graph_show_labels ?? 1,
      keyword_graph_repulsion: full?.keyword_graph_repulsion ?? DEFAULT_GRAPH_REPULSION,
      keyword_graph_spring_strength: full?.keyword_graph_spring_strength ?? DEFAULT_GRAPH_SPRING_STRENGTH,
      keyword_graph_show_labels: full?.keyword_graph_show_labels ?? 1,
    };
  }

  private async getConfigFull(): Promise<VisualizationConfigRow | null> {
    const rows = await this.relationDb.select(VISUALIZATION_CONFIG_TABLE, {});
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: String(row.id ?? ''),
      max_nodes_per_graph: Number(row.max_nodes_per_graph ?? DEFAULT_MAX_NODES_PER_GRAPH),
      default_message_summary_length: Number(row.default_message_summary_length ?? DEFAULT_MESSAGE_SUMMARY_LENGTH),
      resolve_content_by_default: Number(row.resolve_content_by_default ?? DEFAULT_RESOLVE_CONTENT_BY_DEFAULT),
      tag_graph_repulsion: Number(row.tag_graph_repulsion ?? DEFAULT_GRAPH_REPULSION),
      tag_graph_spring_strength: Number(row.tag_graph_spring_strength ?? DEFAULT_GRAPH_SPRING_STRENGTH),
      tag_graph_show_labels: Number(row.tag_graph_show_labels ?? 1),
      keyword_graph_repulsion: Number(row.keyword_graph_repulsion ?? DEFAULT_GRAPH_REPULSION),
      keyword_graph_spring_strength: Number(row.keyword_graph_spring_strength ?? DEFAULT_GRAPH_SPRING_STRENGTH),
      keyword_graph_show_labels: Number(row.keyword_graph_show_labels ?? 1),
    };
  }

  private async buildCitationMap(infoIds: string[], includeCiting: boolean): Promise<Map<string, CitationData>> {
    const map = new Map<string, CitationData>();
    if (!includeCiting || infoIds.length === 0) return map;

    try {
      const citeOut = new SoCitationEdgesOutput();
      await this.infoCore.soCitationEdges(new SoCitationEdgesInput(), citeOut, new InfoCoreContext());
      const citedRows = citeOut.edges;

      for (const id of infoIds) {
        const citingInfoIds: string[] = [];
        const citedInfoIds: string[] = [];
        let citingCount = 0;

        for (const row of citedRows) {
          if (row.citing_info_id === id) {
            citedInfoIds.push(row.cited_info_id);
          }
          if (row.cited_info_id === id) {
            citingInfoIds.push(row.citing_info_id);
            citingCount++;
          }
        }

        map.set(id, {
          citingInfoIds,
          citedInfoIds: [...new Set(citedInfoIds)],
          citingCount,
          citedCount: new Set(citedInfoIds).size,
        });
      }
    } catch (err) {
      this.logWarn('buildCitationMap failed', err);
    }

    return map;
  }

  private async buildSummaryMap(infoIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (infoIds.length === 0) return map;

    try {
      for (const infoId of infoIds) {
        const rows = await this.relationDb.select('info_summary', {
          conditions: [{ field: 'info_id', operator: Operator.EQ, value: infoId }],
          fields: ['info_id', 'summary'],
        });
        for (const row of rows) {
          map.set(String(row.info_id ?? ''), String(row.summary ?? ''));
        }
      }
    } catch (err) {
      this.logWarn('buildSummaryMap failed', err);
    }

    return map;
  }

  private async buildParentInfoIds(infoId: string): Promise<string[]> {
    try {
      const citeOut = new SoCitationEdgesOutput();
      await this.infoCore.soCitationEdges(Object.assign(new SoCitationEdgesInput(), { citing_info_id: infoId }), citeOut, new InfoCoreContext());
      return [...new Set(citeOut.edges.map((e) => e.cited_info_id).filter(Boolean))];
    } catch {
      return [];
    }
  }

  private async resolveContextSourceInfo(infoId: string): Promise<Record<string, unknown>> {
    try {
      const rows = await this.relationDb.select('info_context_config', {
        fields: ['id', 'base_timeline_count', 'base_tag_relative_count', 'base_similarity_count', 'base_keyword_count', 'base_random_count', 'total'],
      });
      return { config: rows[0] ?? {}, info_id: infoId };
    } catch {
      return { info_id: infoId };
    }
  }

  private async enrichAgentDAG(dag: Record<string, unknown>, config: VisualizationConfigRow): Promise<void> {
    const graph = (dag.graph ?? {}) as Record<string, unknown>;
    const nodes = (graph.nodes ?? dag.nodes ?? dag.agents ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      await this.enrichAgentDAGNode(node, config);
    }
  }

  private async enrichAgentDAGNode(node: Record<string, unknown>, _config: VisualizationConfigRow): Promise<void> {
    const componentRefs = (node.component_refs ?? {}) as Record<string, unknown>;
    const resultRefs = (node.result_refs ?? {}) as Record<string, unknown>;
    const agentId = String(node.agent_id ?? '');

    if (agentId) {
      if (!node.agent_name) node.agent_name = String(componentRefs.agent_name ?? '');
      if (!node.agent_type) node.agent_type = String(componentRefs.agent_type ?? '');
    }

    const llmId = String(componentRefs.llm_id ?? '');
    if (llmId) {
      try {
        const out = new GetLLMOutput();
        await this.llmAccess.soLLMById(
          Object.assign(new GetLLMInput(), { id: llmId }),
          out,
          new LLMContext(),
        );
        if (out.llm) {
          node.llm_detail = out.llm as unknown as Record<string, unknown>;
        }
      } catch {
      }
    }

    const soulId = String(componentRefs.soul_id ?? '');
    if (soulId) {
      try {
        const out = new GetSoulOutput();
        await this.soulAccess.soSoulById(
          Object.assign(new GetSoulInput(), { id: soulId }),
          out,
          new SoulContext(),
        );
        if (out.soul) {
          node.soul_detail = out.soul as unknown as Record<string, unknown>;
        }
      } catch {
      }
    }

    const skillIds = (componentRefs.skill_ids ?? []) as string[];
    if (skillIds.length > 0) {
      node.skill_details = [];
      for (const id of skillIds) {
        try { (node.skill_details as Record<string, unknown>[]).push(await this.resolveSkill(id)); } catch { /* ignore */ }
      }
    }

    const mcpIds = (componentRefs.mcp_ids ?? []) as string[];
    if (mcpIds.length > 0) {
      node.mcp_details = [];
      for (const id of mcpIds) {
        try { (node.mcp_details as Record<string, unknown>[]).push(await this.resolveMcp(id)); } catch { /* ignore */ }
      }
    }

    const promptTemplateIds = (componentRefs.prompt_template_ids ?? {}) as Record<string, unknown>;
    if (promptTemplateIds && typeof promptTemplateIds === 'object') {
      const promptDetails: Record<string, unknown> = {};
      for (const [k, id] of Object.entries(promptTemplateIds)) {
        if (typeof id === 'string' && id) {
          try { promptDetails[k] = await this.resolvePrompt(id); } catch { promptDetails[k] = { id }; }
        }
      }
      if (Object.keys(promptDetails).length > 0) node.prompt_details = promptDetails;
    }

    const evalId = String(resultRefs.eval_id ?? '');
    if (evalId) {
      try {
        const out = new GetEvaluationOutput();
        await this.evolutorAgent.soEvaluation(
          Object.assign(new GetEvaluationInput(), {
            conditions: [{ field: 'eval_id', operator: Operator.EQ, value: evalId }],
          }),
          out,
          new EvolutorAgentContext(),
        );
        if (out.evaluations.length > 0) {
          node.eval_detail = out.evaluations[0] as unknown as Record<string, unknown>;
        }
      } catch {
      }
    }
  }

  private async enrichComponentRefs(refs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const enriched: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(refs)) {
      if (typeof value === 'string') {
        enriched[key] = await this.resolveSingleRef(key, value);
      } else if (Array.isArray(value)) {
        const resolved: unknown[] = [];
        for (const item of value) {
          if (typeof item === 'string') {
            resolved.push(await this.resolveSingleRef(key, item));
          } else {
            resolved.push(item);
          }
        }
        enriched[key] = resolved;
      } else {
        enriched[key] = value;
      }
    }

    return enriched;
  }

  private async resolveSingleRef(key: string, id: string): Promise<unknown> {
    const k = key.toLowerCase();
    try {
      if (k.includes('agent')) {
        const out = new GetAgentOutput();
        await this.agentLibrary.soAgent(Object.assign(new GetAgentInput(), { agent_id: id }), out, new AgentLibraryContext());
        return out.agents[0] ?? { agent_id: id };
      }
      if (k.includes('llm')) return await this.resolveLLM(id);
      if (k.includes('soul')) return await this.resolveSoul(id);
      if (k.includes('skill')) return await this.resolveSkill(id);
      if (k.includes('mcp')) return await this.resolveMcp(id);
      if (k.includes('prompt')) return await this.resolvePrompt(id);
      if (k.includes('info') || k.includes('context')) {
        const out = new LastNInfoOutput();
        await this.infoCore.lastNInfo(Object.assign(new LastNInfoInput(), { info_id: id, lastN: 1 }), out, new InfoCoreContext());
        return out.list[0] ?? { info_id: id };
      }
    } catch {
    }
    return { id };
  }

  private async resolveLLM(id: string): Promise<Record<string, unknown>> {
    const out = new GetLLMOutput();
    await this.llmAccess.soLLMById(Object.assign(new GetLLMInput(), { id }), out, new LLMContext());
    return (out.llm ?? { id }) as unknown as Record<string, unknown>;
  }

  private async resolveSoul(id: string): Promise<Record<string, unknown>> {
    const out = new GetSoulOutput();
    await this.soulAccess.soSoulById(Object.assign(new GetSoulInput(), { id }), out, new SoulContext());
    return (out.soul ?? { id }) as unknown as Record<string, unknown>;
  }

  private async resolveSkill(id: string): Promise<Record<string, unknown>> {
    try {
      const out = new GetSkillOutput();
      await this.skillAccess.soSkillById(Object.assign(new GetSkillInput(), { id }), out, new SkillContext());
      return (out.skill ?? { id }) as unknown as Record<string, unknown>;
    } catch {
      return { id };
    }
  }

  private async resolveMcp(id: string): Promise<Record<string, unknown>> {
    try {
      const out = new GetMcpOutput();
      await this.mcpAccess.soMcpById(Object.assign(new GetMcpInput(), { id }), out, new McpContext());
      return (out.mcp ?? { id }) as unknown as Record<string, unknown>;
    } catch {
      return { id };
    }
  }

  private async resolvePrompt(id: string): Promise<Record<string, unknown>> {
    try {
      const out = new GetPromptOutput();
      await this.promptsAccess.soPromptById(Object.assign(new GetPromptInput(), { id }), out, new PromptContext());
      return (out.prompt ?? { id }) as unknown as Record<string, unknown>;
    } catch {
      return { id };
    }
  }

  private async enrichIdArrayField(
    node: Record<string, unknown>,
    fieldName: string,
    resolver: (id: string) => Promise<Record<string, unknown>>,
  ): Promise<void> {
    const ids = node[fieldName];
    if (!Array.isArray(ids) || ids.length === 0) return;

    const resolved: Record<string, unknown>[] = [];
    for (const id of ids) {
      if (typeof id === 'string') {
        resolved.push(await resolver(id));
      }
    }
    node[`${fieldName}_resolved`] = resolved;
  }

  private async enrichPlanningPhase(phase: Record<string, unknown>): Promise<void> {
    const planId = String(phase.plan_id ?? '');
    if (!planId) return;

    try {
      const out = new GetPlanOutput();
      await this.plannerAgent.soPlan(
        Object.assign(new GetPlanInput(), { plan_id: planId }),
        out,
        new PlannerAgentContext(),
      );
      if (out.plans.length > 0) {
        phase.plan_detail = out.plans[0] as unknown as Record<string, unknown>;
      }
    } catch {
    }
  }

  private async enrichBuildPhase(phase: Record<string, unknown>): Promise<void> {
    const agentIds = Array.isArray(phase.agent_ids) ? phase.agent_ids as string[] : [];
    if (agentIds.length === 0) return;

    const resolved: Record<string, unknown>[] = [];
    for (const id of agentIds) {
      try {
        const out = new GetAgentOutput();
        await this.agentLibrary.soAgent(
          Object.assign(new GetAgentInput(), { agent_id: id }),
          out,
          new AgentLibraryContext(),
        );
        resolved.push(out.agents[0] ? (out.agents[0] as unknown as Record<string, unknown>) : { agent_id: id });
      } catch {
        resolved.push({ agent_id: id });
      }
    }
    phase.agent_details = resolved;
  }

  private async enrichExecutingPhase(phase: Record<string, unknown>): Promise<void> {
    const execIds = Array.isArray(phase.agent_execution_ids) ? phase.agent_execution_ids as string[] : [];
    if (execIds.length === 0) return;

    const summaries: Record<string, unknown>[] = [];
    for (const id of execIds) {
      try {
        const out = new GetTraceOutput();
        await this.agentExecution.soTrace(
          Object.assign(new GetTraceInput(), { trace_id: id }),
          out,
          new AgentExecutionContext(),
        );
        if (out.trace) {
          summaries.push({
            trace_id: out.trace.trace_id,
            agent_id: out.trace.agent_id,
            iterations: out.trace.iterations?.length ?? 0,
            total_elapsed_ms: out.trace.total_elapsed_ms,
          });
        } else {
          summaries.push({ trace_id: id });
        }
      } catch {
        summaries.push({ trace_id: id });
      }
    }
    phase.execution_summaries = summaries;
  }

  private async enrichWritingPhase(phase: Record<string, unknown>): Promise<void> {
    const writerAgentId = String(phase.writer_agent_id ?? '');
    if (!writerAgentId) return;

    try {
      const out = new GetAgentOutput();
      await this.agentLibrary.soAgent(
        Object.assign(new GetAgentInput(), { agent_id: writerAgentId }),
        out,
        new AgentLibraryContext(),
      );
      if (out.agents.length > 0) {
        phase.writer_detail = out.agents[0] as unknown as Record<string, unknown>;
      }
    } catch {
    }
  }

  private async enrichEvaluatingPhase(phase: Record<string, unknown>): Promise<void> {
    const evalIds = Array.isArray(phase.eval_ids) ? phase.eval_ids as string[] : [];
    if (evalIds.length === 0) return;

    try {
      const out = new GetEvaluationOutput();
      await this.evolutorAgent.soEvaluation(
        Object.assign(new GetEvaluationInput(), {
          conditions: [],
        }),
        out,
        new EvolutorAgentContext(),
      );
      const matched = out.evaluations.filter((e) => evalIds.includes(e.eval_id));
      phase.eval_details = matched as unknown as Record<string, unknown>[];
    } catch {
    }
  }

  private async resolveToolCalls(toolCalls: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
    const resolved: Array<Record<string, unknown>> = [];

    for (const call of toolCalls) {
      const toolType = String(call.tool_type ?? call.type ?? '').toUpperCase();
      const toolId = String(call.tool_id ?? call.id ?? '');

      const resolvedCall: Record<string, unknown> = { ...call };

      try {
        if (toolType === 'SKILL' && toolId) {
          resolvedCall.tool_name = await this.resolveToolName('skill', toolId);
        } else if (toolType === 'MCP' && toolId) {
          resolvedCall.tool_name = await this.resolveToolName('mcp', toolId);
        }
      } catch {
      }

      resolved.push(resolvedCall);
    }

    return resolved;
  }

  private async resolveToolName(toolType: string, id: string): Promise<string> {
    try {
      if (toolType === 'skill') {
        const out = new GetSkillOutput();
        await this.skillAccess.soSkillById(
          Object.assign(new GetSkillInput(), { id }),
          out,
          new SkillContext(),
        );
        const skill = out.skill as Record<string, unknown> | null;
        return String(skill?.skill_name ?? skill?.name ?? id);
      }
      if (toolType === 'mcp') {
        const out = new GetMcpOutput();
        await this.mcpAccess.soMcpById(
          Object.assign(new GetMcpInput(), { id }),
          out,
          new McpContext(),
        );
        const mcp = out.mcp as Record<string, unknown> | null;
        return String(mcp?.mcp_name ?? mcp?.name ?? id);
      }
    } catch {
    }
    return id;
  }

  private extractFinalAnswer(rawTrace: Record<string, unknown>): string {
    const iterations = rawTrace.iterations as Array<Record<string, unknown>> | undefined;
    if (!iterations || iterations.length === 0) return '';

    for (let i = iterations.length - 1; i >= 0; i--) {
      const iter = iterations[i];
      if (iter.answer) {
        return String((iter.answer as Record<string, unknown>)?.answer ?? '');
      }
    }
    return '';
  }

  private truncate(text: string, maxLen: number): string {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  private logWarn(msg: string, err: unknown): void {
    if (this.logger) {
      this.logger.debug(`[VisualizationService] ${msg}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
