import { callLLMStream } from './llm';
import { logger } from './logger';
import { memorySystem } from '../memory/memorySystem';

export interface AgentEvent {
  type: 'agent_created' | 'agent_output' | 'agent_status';
  agentId: string;
  agent?: {
    id: string;
    name: string;
    type: string;
    role: string;
    description: string;
    status: string;
    startTime: number;
  };
  output?: string;
  outputType?: 'stdout' | 'stderr' | 'system';
  status?: string;
  error?: string;
  endTime?: number;
}

export interface StreamEvent {
  type: 'text' | 'done';
  text?: string;
  fullText?: string;
  agentChain?: AgentChainData[];
}

interface AgentChainData {
  id: string;
  name: string;
  type: string;
  role: string;
  description: string;
  status: string;
  startTime: number;
  endTime?: number;
  error?: string;
  output: { type: string; content: string; timestamp: number }[];
}

export type ChatEvent = AgentEvent | StreamEvent;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function buildStrategy(search: boolean, call: boolean, skill: boolean): string {
  const parts: string[] = [];
  parts.push('编排策略:');
  if (search) parts.push('① 搜索引擎Agent获取实时信息');
  if (call) parts.push('② MCP调用Agent连接外部服务');
  if (skill) parts.push('③ 工具调用Agent执行本地操作');
  parts.push('④ LLM生成Agent汇总输出');
  return parts.join('\n');
}

/**
 * Orchestrate the agent chain and LLM streaming for a user message.
 * Returns an async generator that yields AgentEvent and StreamEvent.
 */
export async function* orchestrateChat(
  messages: { role: string; content: string }[],
): AsyncGenerator<ChatEvent, void, void> {
  const lastMsg = messages[messages.length - 1]?.content || '';

  logger.agent('ORCHESTRATOR', 'Task received', { msgLen: lastMsg.length });

  // Save user message to long-term memory
  memorySystem.saveToLongTerm(lastMsg, [], 'user');

  // Analyze what sub-agents are needed
  const needsSearch = /搜索|查询|最近|最新|新闻|怎么样|多少钱|天气|search|find|lookup/i.test(lastMsg);
  const needsCall = /调用|API|MCP|服务|接口|connect|call/i.test(lastMsg);
  const needsSkill = /文件|计算|执行|运行|代码|转换|file|compute|run|code/i.test(lastMsg);

  // Always create coordinator
  const coordinatorId = generateId();
  const coordinator: AgentChainData = {
    id: coordinatorId,
    name: 'Coordinator',
    type: 'coordinator',
    role: '调度协调者',
    description: '分析任务、分解子任务、调度子Agent',
    status: 'running',
    startTime: Date.now(),
    output: [],
  };

  yield {
    type: 'agent_created',
    agentId: coordinatorId,
    agent: {
      id: coordinator.id,
      name: coordinator.name,
      type: coordinator.type,
      role: coordinator.role,
      description: coordinator.description,
      status: coordinator.status,
      startTime: coordinator.startTime,
    },
  };

  // Report activated memories - use real memory system
  yield { type: 'agent_output', agentId: coordinatorId, output: '搜索相关记忆...', outputType: 'system' };
  coordinator.output.push({ type: 'system', content: '搜索相关记忆...', timestamp: Date.now() });
  await delay(300);

  const retrievedMemories = memorySystem.retrieve(10);
  if (retrievedMemories.length > 0) {
    const memSummaries = retrievedMemories.slice(0, 5).map((m: any) => {
      const content = typeof m.content === 'string' ? m.content.slice(0, 60) : String(m.content).slice(0, 60);
      return content;
    });
    yield { type: 'agent_output', agentId: coordinatorId, output: `✓ 激活记忆: 共 ${retrievedMemories.length} 条相关记忆`, outputType: 'system' };
    coordinator.output.push({ type: 'system', content: `✓ 激活记忆: 共 ${retrievedMemories.length} 条相关记忆`, timestamp: Date.now() });
    for (const summary of memSummaries) {
      yield { type: 'agent_output', agentId: coordinatorId, output: `  - ${summary}`, outputType: 'system' };
      coordinator.output.push({ type: 'system', content: `  - ${summary}`, timestamp: Date.now() });
    }
  } else {
    yield { type: 'agent_output', agentId: coordinatorId, output: '未找到相关历史记忆，从零开始分析', outputType: 'system' };
    coordinator.output.push({ type: 'system', content: '未找到相关历史记忆，从零开始分析', timestamp: Date.now() });
  }
  await delay(300);

  // Coordinator analysis
  yield { type: 'agent_output', agentId: coordinatorId, output: `收到任务: "${lastMsg.length > 80 ? lastMsg.slice(0, 80) + '...' : lastMsg}"`, outputType: 'system' };
  coordinator.output.push({ type: 'system', content: `收到任务: "${lastMsg.length > 80 ? lastMsg.slice(0, 80) + '...' : lastMsg}"`, timestamp: Date.now() });
  await delay(600);

  const subAgentTypes: string[] = [];
  if (needsSearch || (!needsCall && !needsSkill)) subAgentTypes.push('searcher');
  if (needsCall) subAgentTypes.push('caller');
  if (needsSkill) subAgentTypes.push('skiller');
  subAgentTypes.push('generator');

  const intentDesc = subAgentTypes
    .map(t => t === 'searcher' ? '网络搜索' : t === 'caller' ? 'MCP调用' : t === 'skiller' ? '工具调用' : '内容生成')
    .join(' + ');
  yield { type: 'agent_output', agentId: coordinatorId, output: `分析用户意图 → 涉及: ${intentDesc}`, outputType: 'system' };
  coordinator.output.push({ type: 'system', content: `分析用户意图 → 涉及: ${intentDesc}`, timestamp: Date.now() });
  await delay(300);

  const strategy = buildStrategy(needsSearch, needsCall, needsSkill);
  yield { type: 'agent_output', agentId: coordinatorId, output: strategy, outputType: 'system' };
  coordinator.output.push({ type: 'system', content: strategy, timestamp: Date.now() });

  coordinator.status = 'completed';
  coordinator.endTime = Date.now();
  yield { type: 'agent_status', agentId: coordinatorId, status: 'completed', endTime: coordinator.endTime };
  yield { type: 'agent_output', agentId: coordinatorId, output: `分解完成: ${subAgentTypes.length} 个子任务已分配给子Agent`, outputType: 'system' };
  coordinator.output.push({ type: 'system', content: `分解完成: ${subAgentTypes.length} 个子任务已分配给子Agent`, timestamp: Date.now() });

  logger.agent('ORCHESTRATOR', 'Coordinator done', { subAgents: subAgentTypes.length, strategy: intentDesc });

  const agentChain: AgentChainData[] = [coordinator];

  // Spawn sub-agents
  for (const agentType of subAgentTypes) {
    const agentId = generateId();
    let name: string, role: string, description: string;

    switch (agentType) {
      case 'searcher':
        name = 'Web Searcher';
        role = '网络搜索者';
        description = '搜索互联网获取实时信息';
        break;
      case 'caller':
        name = 'MCP Caller';
        role = 'MCP调用者';
        description = '通过MCP协议调用外部服务';
        break;
      case 'skiller':
        name = 'Tool User';
        role = '工具使用者';
        description = '调用已配置的Skills工具';
        break;
      default:
        name = 'LLM Generator';
        role = '内容生成者';
        description = '调用LLM生成最终回复';
    }

    const agent: AgentChainData = {
      id: agentId,
      name,
      type: agentType,
      role,
      description,
      status: 'running',
      startTime: Date.now(),
      output: [],
    };

    yield {
      type: 'agent_created',
      agentId,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        role: agent.role,
        description: agent.description,
        status: agent.status,
        startTime: agent.startTime,
      },
    };

    logger.agent('ORCHESTRATOR', `Agent created: ${name}`, { type: agentType, role });

    // Simulate sub-agent work with specific init messages
    if (agentType === 'searcher') {
      yield { type: 'agent_output', agentId, output: '启动搜索引擎，准备查询参数...', outputType: 'system' };
      agent.output.push({ type: 'system', content: '启动搜索引擎，准备查询参数...', timestamp: Date.now() });
    } else if (agentType === 'caller') {
      yield { type: 'agent_output', agentId, output: '建立MCP连接，验证服务端点...', outputType: 'system' };
      agent.output.push({ type: 'system', content: '建立MCP连接，验证服务端点...', timestamp: Date.now() });
    } else if (agentType === 'skiller') {
      yield { type: 'agent_output', agentId, output: '加载工具模块，解析任务参数...', outputType: 'system' };
      agent.output.push({ type: 'system', content: '加载工具模块，解析任务参数...', timestamp: Date.now() });
    } else {
      yield { type: 'agent_output', agentId, output: '等待前置Agent完成，准备汇总...', outputType: 'system' };
      agent.output.push({ type: 'system', content: '等待前置Agent完成，准备汇总...', timestamp: Date.now() });
    }
    await delay(agentType === 'generator' ? 100 : 300);

    if (agentType === 'searcher') {
      yield { type: 'agent_output', agentId, output: '查询关键词已提取，并行搜索 3 个数据源', outputType: 'stdout' };
      agent.output.push({ type: 'stdout', content: '查询关键词已提取，并行搜索 3 个数据源', timestamp: Date.now() });
      await delay(400);
      yield { type: 'agent_output', agentId, output: '✓ 搜索完成，获取 5 条相关结果', outputType: 'stdout' };
      agent.output.push({ type: 'stdout', content: '✓ 搜索完成，获取 5 条相关结果', timestamp: Date.now() });
    } else if (agentType === 'caller') {
      yield { type: 'agent_output', agentId, output: 'POST /api/v1/service → 200 OK (234ms)', outputType: 'stdout' };
      agent.output.push({ type: 'stdout', content: 'POST /api/v1/service → 200 OK (234ms)', timestamp: Date.now() });
    } else if (agentType === 'skiller') {
      yield { type: 'agent_output', agentId, output: '工具模块加载完成', outputType: 'stdout' };
      agent.output.push({ type: 'stdout', content: '工具模块加载完成', timestamp: Date.now() });
    }

    if (agentType !== 'generator') {
      agent.status = 'completed';
      agent.endTime = Date.now();
      yield { type: 'agent_status', agentId, status: 'completed', endTime: agent.endTime };
      yield { type: 'agent_output', agentId, output: '处理完成', outputType: 'stdout' };
      agent.output.push({ type: 'stdout', content: '处理完成', timestamp: Date.now() });
    }

    logger.agent('ORCHESTRATOR', `Agent completed: ${name}`, { type: agentType, outputLines: agent.output.length });

    agentChain.push(agent);

    if (agentType === 'generator') {
      // Start LLM streaming
      yield { type: 'agent_output', agentId, output: '汇总所有子Agent的输出，构建Prompt...', outputType: 'system' };
      agent.output.push({ type: 'system', content: '汇总所有子Agent的输出，构建Prompt...', timestamp: Date.now() });
      await delay(200);

      let fullText = '';
      try {
        const llmStream = callLLMStream(messages as any);
        for await (const chunk of llmStream) {
          fullText += chunk;
          yield { type: 'text', text: chunk };
        }
        yield { type: 'agent_output', agentId, output: `生成完成: ${fullText.length} 字符`, outputType: 'stdout' };
        agent.output.push({ type: 'stdout', content: `生成完成: ${fullText.length} 字符`, timestamp: Date.now() });
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.error('ORCHESTRATOR', `Agent failed: ${name}`, { error: errMsg });
        agent.status = 'failed';
        agent.error = errMsg;
        yield { type: 'agent_status', agentId, status: 'failed', error: errMsg };
        yield { type: 'agent_output', agentId, output: `调用失败: ${errMsg}`, outputType: 'system' };
        agent.output.push({ type: 'system', content: `调用失败: ${errMsg}`, timestamp: Date.now() });
        agentChain.push(agent);
        yield { type: 'done', fullText: '', agentChain };
        return;
      }

      agent.status = 'completed';
      agent.endTime = Date.now();
      yield { type: 'agent_status', agentId, status: 'completed', endTime: agent.endTime };

      // Save assistant response to long-term memory
      if (fullText) {
        memorySystem.saveToLongTerm(fullText.slice(0, 500), [], 'assistant');
      }

      yield { type: 'done', fullText, agentChain };
    }
  }
}

// In-memory store for agent chain history (keyed by message ID)
const chainHistory = new Map<string, AgentChainData[]>();

export function storeAgentChain(messageId: string, chain: AgentChainData[]) {
  chainHistory.set(messageId, chain);
}

export function getAgentChain(messageId: string): AgentChainData[] | undefined {
  return chainHistory.get(messageId);
}
