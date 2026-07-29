import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setDatabase, addAgent, updateAgent } from '../../src/agent/AgentLibrary/db';
import { NotFoundError } from '../../src/shared/errors';
import {
  createAgentExecutionService,
  ExecAgentInput,
  ExecAgentContext,
  ExecAgentOutput,
  ExecAgentAsyncInput,
  ExecAgentAsyncContext,
  ExecAgentAsyncOutput,
  ThinkInput,
  ThinkContext,
  ThinkOutput,
  ActInput,
  ActContext,
  ActOutput,
  ReflectInput,
  ReflectContext,
  ReflectOutput,
  AnswerInput,
  AnswerContext,
  AnswerOutput,
  GetTraceInput,
  GetTraceContext,
  GetTraceOutput,
  GetExecQueueStatusInput,
  GetExecQueueStatusContext,
  GetExecQueueStatusOutput,
  ConfigAgentExecutionInput,
  ConfigAgentExecutionContext,
  ConfigAgentExecutionOutput,
  AgentExecutionService,
} from '../../src/agent/AgentExecution/AgentExecution';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('AgentExecutionService', () => {
  let db: Database.Database;
  let service: AgentExecutionService;
  let mockLlmService: {
    chatCompletion: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    db = new Database(':memory:');
    setDatabase(db);

    mockLlmService = {
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test response' } }],
        usage: { totalTokens: 42 },
      }),
    };

    service = createAgentExecutionService(db, mockLlmService as any);
  });

  afterEach(() => {
    db.close();
  });

  // ─── helpers ──────────────────────────────────────────────────────

  function seedAgent(overrides: Record<string, unknown> = {}) {
    addAgent({
      agent_id: (overrides.agent_id as string) || 'test-agent',
      agent_type: (overrides.agent_type as any) || 'WORKER',
      strategy_id: (overrides.strategy_id as string) || 'cot',
      llm_id: (overrides.llm_id as string) || 'test-llm',
      soul_id: (overrides.soul_id as string) || '',
      task_signature: (overrides.task_signature as string) || '[test] test task',
      agent_name: (overrides.agent_name as string) || 'TestAgent',
    });
  }

  // ══════════════════════════════════════════════════════════════════
  //  execAgent
  // ══════════════════════════════════════════════════════════════════

  describe('execAgent', () => {
    beforeEach(() => {
      seedAgent();
    });

    // TC-AE-001
    it('basic execution with LLM mock: returns answer, iterations >= 1, trace_id set, elapsed_ms > 0', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'FINISH - task completed successfully' } }],
        usage: { totalTokens: 100 },
      });
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'Final answer: the task is done.' } }],
        usage: { totalTokens: 50 },
      });

      const input = new ExecAgentInput({
        agent_id: 'test-agent',
        work_id: 'work-1',
        interact_id: 'interact-1',
        task_content: 'Write a unit test',
      });
      const context = new ExecAgentContext();
      const output = new ExecAgentOutput();

      const result = await service.execAgent(input, context, output);

      expect(result).toBe(true);
      expect(output.answer).toBe('Final answer: the task is done.');
      expect(output.iterations).toBeGreaterThanOrEqual(1);
      expect(output.trace_id).toBeTruthy();
      expect(output.trace_id).toMatch(UUID_RE);
      expect(output.elapsed_ms).toBeGreaterThan(0);
    });

    // TC-AE-002
    it('agent not found: throws NotFoundError', async () => {
      const input = new ExecAgentInput({
        agent_id: 'non-existent-agent',
        work_id: 'w1',
        interact_id: 'i1',
        task_content: 'test',
      });
      const context = new ExecAgentContext();
      const output = new ExecAgentOutput();

      await expect(service.execAgent(input, context, output)).rejects.toThrow(NotFoundError);
    });

    // TC-AE-003
    it('disabled agent: throws NotFoundError', async () => {
      updateAgent('test-agent', { enable: 0 });

      const input = new ExecAgentInput({
        agent_id: 'test-agent',
        work_id: 'w1',
        interact_id: 'i1',
        task_content: 'test',
      });
      const context = new ExecAgentContext();
      const output = new ExecAgentOutput();

      await expect(service.execAgent(input, context, output)).rejects.toThrow(NotFoundError);
    });

    // TC-AE-004
    it('max iterations limit: mock returns CONTINUE content each time, respects max_iterations=3', async () => {
      mockLlmService.chatCompletion.mockResolvedValue({
        choices: [{ message: { content: 'CONTINUE — need more steps' } }],
        usage: { totalTokens: 10 },
      });

      const input = new ExecAgentInput({
        agent_id: 'test-agent',
        work_id: 'w1',
        interact_id: 'i1',
        task_content: 'Complex multi-step task',
        max_iterations: 3,
      });
      const context = new ExecAgentContext();
      const output = new ExecAgentOutput();

      await service.execAgent(input, context, output);

      expect(output.iterations).toBe(3);
      expect(output.answer).toBe('CONTINUE — need more steps');
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    // TC-AE-005
    it('LLM unavailable: create service without LLM, expect fallback response', async () => {
      const noLlmService = createAgentExecutionService(db);
      seedAgent({ agent_id: 'no-llm-agent', agent_name: 'NoLlmAgent' });

      const input = new ExecAgentInput({
        agent_id: 'no-llm-agent',
        work_id: 'w1',
        interact_id: 'i1',
        task_content: 'Do something without LLM',
      });
      const context = new ExecAgentContext();
      const output = new ExecAgentOutput();

      const result = await noLlmService.execAgent(input, context, output);

      expect(result).toBe(true);
      expect(output.answer).toContain('no-llm-agent');
      expect(output.answer).toContain('Do something without LLM');
      expect(output.iterations).toBe(1);
      expect(output.trace_id).toBeTruthy();
    });

    // TC-AE-006
    it('agent usage recorded after execution (check usage_count incremented)', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'FINISH' } }],
        usage: { totalTokens: 5 },
      });
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'Answer text' } }],
        usage: { totalTokens: 5 },
      });

      const beforeRow = db.prepare('SELECT usage_count FROM agent WHERE agent_id = ?').get('test-agent') as Record<string, unknown>;
      const beforeCount = Number(beforeRow.usage_count);

      const input = new ExecAgentInput({
        agent_id: 'test-agent',
        work_id: 'w1',
        interact_id: 'i1',
        task_content: 'task',
      });
      await service.execAgent(input, new ExecAgentContext(), new ExecAgentOutput());

      const afterRow = db.prepare('SELECT usage_count FROM agent WHERE agent_id = ?').get('test-agent') as Record<string, unknown>;
      expect(Number(afterRow.usage_count)).toBe(beforeCount + 1);
    });

    // TC-AE-007
    it('execution trace saved to agent_execution_trace table', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'FINISH' } }],
        usage: { totalTokens: 5 },
      });
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'Trace answer' } }],
        usage: { totalTokens: 5 },
      });

      const input = new ExecAgentInput({
        agent_id: 'test-agent',
        work_id: 'w-trace',
        interact_id: 'i-trace',
        task_content: 'trace test task',
      });
      const output = new ExecAgentOutput();
      await service.execAgent(input, new ExecAgentContext(), output);

      const traceRows = db.prepare('SELECT * FROM agent_execution_trace').all() as Record<string, unknown>[];
      expect(traceRows).toHaveLength(1);
      const row = traceRows[0];
      expect(row.trace_id).toBe(output.trace_id);
      expect(row.agent_id).toBe('test-agent');
      expect(row.work_id).toBe('w-trace');
      expect(row.interact_id).toBe('i-trace');
      expect(row.task_content).toBe('trace test task');
      expect(row.iterations).toBe(1);
      expect(row.answer).toBe('Trace answer');
      expect(row.elapsed_ms).toBeGreaterThanOrEqual(0);

      const history = JSON.parse(row.history as string);
      expect(Array.isArray(history)).toBe(true);
      expect(history.some((h: string) => h.includes('[Think'))).toBe(true);
      expect(history.some((h: string) => h.includes('[Answer]'))).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  execAgentAsync
  // ══════════════════════════════════════════════════════════════════

  describe('execAgentAsync', () => {
    beforeEach(() => {
      seedAgent();
    });

    // TC-AE-015
    it('normal submit returns job_id', () => {
      const input = new ExecAgentAsyncInput({
        agent_id: 'test-agent',
        work_id: 'w-async',
        interact_id: 'i-async',
        task_content: 'async task',
      });
      const output = new ExecAgentAsyncOutput();

      const result = service.execAgentAsync(input, new ExecAgentAsyncContext(), output);

      expect(result).toBe(true);
      expect(output.job_id).toBeTruthy();
    });

    // TC-AE-016
    it('job_id is a valid UUID-like string', () => {
      const input = new ExecAgentAsyncInput({
        agent_id: 'test-agent',
        work_id: 'w1',
        interact_id: 'i1',
        task_content: 'uuid test',
      });
      const output = new ExecAgentAsyncOutput();

      service.execAgentAsync(input, new ExecAgentAsyncContext(), output);

      expect(output.job_id).toMatch(UUID_RE);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  think
  // ══════════════════════════════════════════════════════════════════

  describe('think', () => {
    // TC-AE-017
    it('basic think: LLM called, reasoning returned, next_action = FINISH (when content contains FINISH)', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'The task is straightforward. FINISH.' } }],
        usage: { totalTokens: 30 },
      });

      const input = new ThinkInput({ agent_id: 'test-agent' });
      const output = new ThinkOutput();

      const result = await service.think(input, new ThinkContext(), output);

      expect(result).toBe(true);
      expect(mockLlmService.chatCompletion).toHaveBeenCalledOnce();
      expect(output.reasoning).toBe('The task is straightforward. FINISH.');
      expect(output.next_action).toBe('FINISH');
      expect(output.token_usage).toBe(30);
    });

    // TC-AE-018
    it('think with non-FINISH content returns next_action = ACT', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'We should call a tool first.' } }],
        usage: { totalTokens: 20 },
      });

      const input = new ThinkInput({ agent_id: 'test-agent' });
      const output = new ThinkOutput();

      await service.think(input, new ThinkContext(), output);

      expect(output.next_action).toBe('ACT');
      expect(output.reasoning).toBe('We should call a tool first.');
    });

    // TC-AE-019
    it('LLM unavailable: returns fallback reasoning', async () => {
      const noLlmService = createAgentExecutionService(db);

      const input = new ThinkInput({ agent_id: 'test-agent' });
      const output = new ThinkOutput();

      const result = await noLlmService.think(input, new ThinkContext(), output);

      expect(result).toBe(true);
      expect(output.reasoning).toBe('[LLM unavailable]');
      expect(output.next_action).toBe('FINISH');
    });

    // TC-AE-020
    it('custom context_data and history passed', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'FINISH based on context.' } }],
        usage: { totalTokens: 25 },
      });

      const input = new ThinkInput({
        agent_id: 'test-agent',
        context_data: 'User wants a report on sales data',
        history: ['[User] Show me Q4 sales', '[Agent] Retrieving data...'],
      });
      const output = new ThinkOutput();

      await service.think(input, new ThinkContext(), output);

      expect(output.reasoning).toBe('FINISH based on context.');
      const callArgs = mockLlmService.chatCompletion.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: any) => m.role === 'user');
      expect(userMsg.content).toContain('User wants a report on sales data');
      expect(userMsg.content).toContain('[User] Show me Q4 sales');
      expect(userMsg.content).toContain('[Agent] Retrieving data...');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  act
  // ══════════════════════════════════════════════════════════════════

  describe('act', () => {
    // TC-AE-021
    it('null/empty next_action: returns "No action required", tool_type=NONE', async () => {
      const input = new ActInput({ agent_id: 'test-agent' });
      const output = new ActOutput();

      const result = await service.act(input, new ActContext(), output);

      expect(result).toBe(true);
      expect(output.result).toBe('No action required');
      expect(output.tool_type).toBe('NONE');
      expect(output.success_status).toBe(true);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    // TC-AE-022
    it('JSON action parsing works', async () => {
      const input = new ActInput({
        agent_id: 'test-agent',
        next_action: JSON.stringify({ tool_type: 'Skill', tool_id: 'code_gen', tool_name: 'CodeGenerator', args: { language: 'ts' } }),
      });
      const output = new ActOutput();

      await service.act(input, new ActContext(), output);

      expect(output.tool_type).toBe('Skill');
      expect(output.tool_id).toBe('code_gen');
      // No SkillManager injected → should be "not available"
      expect(output.result).toContain('not available');
      expect(output.success_status).toBe(false);
    });

    // TC-AE-023
    it('invalid JSON in next_action: handles gracefully (parsed as null, falls back)', async () => {
      const input = new ActInput({
        agent_id: 'test-agent',
        next_action: '{invalid json',
      });
      const output = new ActOutput();

      const result = await service.act(input, new ActContext(), output);

      expect(result).toBe(true);
      expect(output.result).toBe('No action required');
      expect(output.tool_type).toBe('NONE');
      expect(output.success_status).toBe(true);
    });

    // TC-AE-024
    it('empty string next_action treated as no action', async () => {
      const input = new ActInput({ agent_id: 'test-agent', next_action: '' });
      const output = new ActOutput();

      await service.act(input, new ActContext(), output);

      expect(output.result).toBe('No action required');
      expect(output.tool_type).toBe('NONE');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  reflect
  // ══════════════════════════════════════════════════════════════════

  describe('reflect', () => {
    // TC-AE-025
    it('iteration < max_iterations: LLM called for reflection', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'CONTINUE — need more steps' } }],
        usage: { totalTokens: 15 },
      });

      const input = new ReflectInput({
        agent_id: 'test-agent',
        iteration: 0,
        max_iterations: 5,
        history: ['[Think 0] need to fetch data'],
      });
      const output = new ReflectOutput();

      const result = await service.reflect(input, new ReflectContext(), output);

      expect(result).toBe(true);
      expect(mockLlmService.chatCompletion).toHaveBeenCalledOnce();
      expect(output.should_continue).toBe(true);
      expect(output.reflection).toBe('CONTINUE — need more steps');
      expect(output.token_usage).toBe(15);
    });

    // TC-AE-026
    it('LLM returns FINISH → should_continue = false', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'FINISH — task complete' } }],
        usage: { totalTokens: 10 },
      });

      const input = new ReflectInput({
        agent_id: 'test-agent',
        iteration: 0,
        max_iterations: 5,
      });
      const output = new ReflectOutput();

      await service.reflect(input, new ReflectContext(), output);

      expect(output.should_continue).toBe(false);
    });

    // TC-AE-027
    it('iteration >= max_iterations: immediately returns should_continue=false without LLM call', async () => {
      const input = new ReflectInput({
        agent_id: 'test-agent',
        iteration: 10,
        max_iterations: 10,
      });
      const output = new ReflectOutput();

      const result = await service.reflect(input, new ReflectContext(), output);

      expect(result).toBe(true);
      expect(output.should_continue).toBe(false);
      expect(output.reflection).toBe('Reached max iterations');
      expect(mockLlmService.chatCompletion).not.toHaveBeenCalled();
    });

    // TC-AE-028
    it('LLM unavailable: returns should_continue=false', async () => {
      const noLlmService = createAgentExecutionService(db);

      const input = new ReflectInput({
        agent_id: 'test-agent',
        iteration: 0,
        max_iterations: 5,
      });
      const output = new ReflectOutput();

      const result = await noLlmService.reflect(input, new ReflectContext(), output);

      expect(result).toBe(true);
      expect(output.should_continue).toBe(false);
      expect(output.reflection).toBe('[LLM unavailable]');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  answer
  // ══════════════════════════════════════════════════════════════════

  describe('answer', () => {
    // TC-AE-029
    it('basic answer: LLM called, answer returned', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'Here is the final result: 42' } }],
        usage: { totalTokens: 40 },
      });

      const input = new AnswerInput({
        agent_id: 'test-agent',
        task_content: 'What is the meaning of life?',
        history: ['[Think 0] Need to compute', '[Reflect 0] Make final calculation'],
      });
      const output = new AnswerOutput();

      const result = await service.answer(input, new AnswerContext(), output);

      expect(result).toBe(true);
      expect(mockLlmService.chatCompletion).toHaveBeenCalledOnce();
      expect(output.answer).toBe('Here is the final result: 42');
      expect(output.token_usage).toBe(40);
    });

    // TC-AE-030
    it('LLM unavailable: returns fallback answer with task_content', async () => {
      const noLlmService = createAgentExecutionService(db);

      const input = new AnswerInput({
        agent_id: 'test-agent',
        task_content: 'Hello world task',
      });
      const output = new AnswerOutput();

      const result = await noLlmService.answer(input, new AnswerContext(), output);

      expect(result).toBe(true);
      expect(output.answer).toBe('Task: Hello world task');
    });

    // TC-AE-031
    it('LLM throws error: graceful fallback included in answer', async () => {
      mockLlmService.chatCompletion.mockRejectedValueOnce(new Error('LLM timeout'));

      const input = new AnswerInput({
        agent_id: 'test-agent',
        task_content: 'Test error handling',
      });
      const output = new AnswerOutput();

      const result = await service.answer(input, new AnswerContext(), output);

      expect(result).toBe(true);
      expect(output.answer).toContain('Answer generation error');
      expect(output.answer).toContain('LLM timeout');
      expect(output.token_usage).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  getTrace
  // ══════════════════════════════════════════════════════════════════

  describe('getTrace', () => {
    // TC-AE-032
    it('trace not found: returns trace_id in output with error message', () => {
      const input = new GetTraceInput({ trace_id: 'nonexistent-trace-id' });
      const output = new GetTraceOutput();

      const result = service.getTrace(input, new GetTraceContext(), output);

      expect(result).toBe(true);
      expect(output.trace).toEqual({
        trace_id: 'nonexistent-trace-id',
        error: 'Trace not found',
      });
    });

    // TC-AE-033
    it('create a trace by running execAgent, then query it', async () => {
      seedAgent({ agent_id: 'trace-query-agent' });
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'FINISH' } }],
        usage: { totalTokens: 5 },
      });
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'The answer from trace query.' } }],
        usage: { totalTokens: 5 },
      });

      const execInput = new ExecAgentInput({
        agent_id: 'trace-query-agent',
        work_id: 'w-tq',
        interact_id: 'i-tq',
        task_content: 'trace query task',
      });
      const execOutput = new ExecAgentOutput();
      await service.execAgent(execInput, new ExecAgentContext(), execOutput);

      const traceInput = new GetTraceInput({ trace_id: execOutput.trace_id! });
      const traceOutput = new GetTraceOutput();

      const result = service.getTrace(traceInput, new GetTraceContext(), traceOutput);

      expect(result).toBe(true);
      expect(traceOutput.trace).toBeDefined();
      expect(traceOutput.trace!.trace_id).toBe(execOutput.trace_id);
      expect(traceOutput.trace!.agent_id).toBe('trace-query-agent');
      expect(traceOutput.trace!.task_content).toBe('trace query task');
      expect(traceOutput.trace!.answer).toBe('The answer from trace query.');
      expect(traceOutput.trace!.iterations).toBe(1);
      expect(traceOutput.trace!.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(traceOutput.trace!.history)).toBe(true);
      expect(traceOutput.trace!.error).toBeUndefined();
    });

    // TC-AE-034
    it('history is parsed as JSON array from the stored string', async () => {
      seedAgent({ agent_id: 'history-parse-agent' });
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'FINISH' } }],
        usage: { totalTokens: 1 },
      });
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: 'answer' } }],
        usage: { totalTokens: 1 },
      });

      const execInput = new ExecAgentInput({
        agent_id: 'history-parse-agent',
        work_id: 'w',
        interact_id: 'i',
        task_content: 'history test',
      });
      const execOutput = new ExecAgentOutput();
      await service.execAgent(execInput, new ExecAgentContext(), execOutput);

      const traceInput = new GetTraceInput({ trace_id: execOutput.trace_id! });
      const traceOutput = new GetTraceOutput();
      service.getTrace(traceInput, new GetTraceContext(), traceOutput);

      const history = traceOutput.trace!.history as string[];
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history.every((h: string) => typeof h === 'string')).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  getExecQueueStatus
  // ══════════════════════════════════════════════════════════════════

  describe('getExecQueueStatus', () => {
    // TC-AE-035
    it('without MQCore: returns zeroed stats', () => {
      const output = new GetExecQueueStatusOutput();
      const result = service.getExecQueueStatus(new GetExecQueueStatusInput(), new GetExecQueueStatusContext(), output);

      expect(result).toBe(true);
      expect(output.queue_stats).toEqual({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      });
      expect(output.workers).toEqual([]);
    });

    // TC-AE-036
    it('queue_stats has all expected keys', () => {
      const output = new GetExecQueueStatusOutput();
      service.getExecQueueStatus(new GetExecQueueStatusInput(), new GetExecQueueStatusContext(), output);

      expect(output.queue_stats).toHaveProperty('pending');
      expect(output.queue_stats).toHaveProperty('processing');
      expect(output.queue_stats).toHaveProperty('completed');
      expect(output.queue_stats).toHaveProperty('failed');
      expect(output.workers).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  //  configAgentExecution
  // ══════════════════════════════════════════════════════════════════

  describe('configAgentExecution', () => {
    // TC-AE-037
    it('config initialized: default_max_iterations=10, async_worker_interval=1000, prompt template IDs are empty strings', () => {
      const input = new ConfigAgentExecutionInput({});
      const output = new ConfigAgentExecutionOutput();

      const result = service.configAgentExecution(input, new ConfigAgentExecutionContext(), output);

      expect(result).toBe(true);
      expect(output.think_prompt_template_id).toBe('');
      expect(output.reflect_prompt_template_id).toBe('');
      expect(output.answer_prompt_template_id).toBe('');
      expect(output.default_max_iterations).toBe(10);
      expect(output.async_worker_interval).toBe(1000);
    });

    // TC-AE-038
    it('update config fields: all updated correctly', () => {
      const input = new ConfigAgentExecutionInput({
        think_prompt_template_id: 'tpl-think-1',
        reflect_prompt_template_id: 'tpl-reflect-2',
        answer_prompt_template_id: 'tpl-answer-3',
        default_max_iterations: 5,
        async_worker_interval: 2000,
      });
      const output = new ConfigAgentExecutionOutput();

      service.configAgentExecution(input, new ConfigAgentExecutionContext(), output);

      expect(output.think_prompt_template_id).toBe('tpl-think-1');
      expect(output.reflect_prompt_template_id).toBe('tpl-reflect-2');
      expect(output.answer_prompt_template_id).toBe('tpl-answer-3');
      expect(output.default_max_iterations).toBe(5);
      expect(output.async_worker_interval).toBe(2000);
    });
  });
});
