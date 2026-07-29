import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setDatabase, addAgent } from '../../src/agent/AgentLibrary/db';
import {
  createEvolutorAgentService,
  EvalWorkAgentInput,
  EvalWorkAgentContext,
  EvalWorkAgentOutput,
  EvalWriterAgentInput,
  EvalWriterAgentContext,
  EvalWriterAgentOutput,
  StartEvalScheduleInput,
  StartEvalScheduleContext,
  StartEvalScheduleOutput,
  StopEvalScheduleInput,
  StopEvalScheduleContext,
  StopEvalScheduleOutput,
  GetEvaluationInput,
  GetEvaluationContext,
  GetEvaluationOutput,
  GetEvolutionReportInput,
  GetEvolutionReportContext,
  GetEvolutionReportOutput,
  ConfigEvolutorAgentInput,
  ConfigEvolutorAgentContext,
  ConfigEvolutorAgentOutput,
} from '../../src/agent/EvolutorAgent/EvolutorAgent';

let db: Database.Database;
let service: ReturnType<typeof createEvolutorAgentService>;
let mockLlmService: { chatCompletion: ReturnType<typeof vi.fn> };

beforeEach(() => {
  db = new Database(':memory:');
  setDatabase(db);

  mockLlmService = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"correctness":85,"completeness":80,"efficiency":75,"relevance":90,"overall":82}' } }],
      usage: { totalTokens: 30 },
    }),
  };

  service = createEvolutorAgentService(db as unknown as import('../../src/agent/infra/dbTypes').AgentDatabase, mockLlmService as unknown as import('../../src/core/llm/LLMService').LLMService);

  addAgent({ agent_id: 'test-agent', agent_type: 'WORKER', strategy_id: 'cot', llm_id: '', soul_id: '', task_signature: '[test] test', agent_name: 'TestAgent' });
  addAgent({ agent_id: 'writer-agent', agent_type: 'WRITER', strategy_id: 'cot', llm_id: '', soul_id: '', task_signature: '[write] writer', agent_name: 'WriterAgent' });
});

afterEach(() => {
  vi.clearAllTimers?.();
  db.close();
});

describe('EvolutorAgentService', () => {
  // ─── evalWorkAgent ──────────────────────────────────────────────
  describe('evalWorkAgent', () => {
    // TC-EA-001
    it('TC-EA-001: evaluates with LLM and returns scores for all 5 dimensions', async () => {
      const input = new EvalWorkAgentInput({ agent_id: 'test-agent', work_id: 'w1', interact_id: 'i1', task_content: 'Build a REST API', agent_output: '{"result": "done"}', trace_id: 'tr1' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      const result = await service.evalWorkAgent(input, context, output);

      expect(result).toBe(true);
      expect(output.eval_id).toBeTruthy();
      expect(output.scores).toEqual({
        correctness: 85,
        completeness: 80,
        efficiency: 75,
        relevance: 90,
        overall: 82,
      });
      expect(output.need_optimize).toBe(false);
      expect(output.suggestions).toEqual([]);
    });

    // TC-EA-002
    it('TC-EA-002: agent not found returns false', async () => {
      const input = new EvalWorkAgentInput({ agent_id: 'nonexistent', work_id: 'w1', interact_id: 'i1', task_content: 'test', agent_output: 'test', trace_id: 'tr1' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      const result = await service.evalWorkAgent(input, context, output);

      expect(result).toBe(false);
    });

    // TC-EA-003
    it('TC-EA-003: overall >= threshold: need_optimize=false', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: '{"correctness":90,"completeness":88,"efficiency":85,"relevance":92,"overall":89}' } }],
        usage: { totalTokens: 30 },
      });

      const input = new EvalWorkAgentInput({ agent_id: 'test-agent', work_id: 'w1', interact_id: 'i1', task_content: 'Task', agent_output: 'Output', trace_id: 'tr1' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      await service.evalWorkAgent(input, context, output);

      expect(output.need_optimize).toBe(false);
      expect(output.suggestions).toEqual([]);
    });

    // TC-EA-004
    it('TC-EA-004: overall < 60: need_optimize=true, suggestions non-empty', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: '{"correctness":30,"completeness":25,"efficiency":20,"relevance":35,"overall":28}' } }],
        usage: { totalTokens: 30 },
      });

      const input = new EvalWorkAgentInput({ agent_id: 'test-agent', work_id: 'w1', interact_id: 'i1', task_content: 'Bad task', agent_output: 'Bad output', trace_id: 'tr1' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      await service.evalWorkAgent(input, context, output);

      expect(output.need_optimize).toBe(true);
      expect(output.suggestions).toEqual(['Consider task content detail', 'Review agent configuration']);
    });

    // TC-EA-005
    it('TC-EA-005: without LLM service uses heuristic scores', async () => {
      const noLlmService = createEvolutorAgentService(db as unknown as import('../../src/agent/infra/dbTypes').AgentDatabase);

      const input = new EvalWorkAgentInput({ agent_id: 'test-agent', work_id: 'w1', interact_id: 'i1', task_content: 'Hello world task content for testing', agent_output: 'Good output response from agent', trace_id: 'tr1' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      const result = await noLlmService.evalWorkAgent(input, context, output);

      expect(result).toBe(true);
      expect(output.scores).toBeDefined();
      expect(output.scores!.correctness).toBeGreaterThanOrEqual(0);
      expect(output.scores!.completeness).toBeGreaterThanOrEqual(0);
      expect(output.scores!.efficiency).toBeGreaterThanOrEqual(0);
      expect(output.scores!.relevance).toBeGreaterThanOrEqual(0);
      expect(output.scores!.overall).toBeGreaterThanOrEqual(0);
    });

    // TC-EA-006
    it('TC-EA-006: LLM fails falls back to heuristic evaluation', async () => {
      mockLlmService.chatCompletion.mockRejectedValueOnce(new Error('LLM failure'));

      const input = new EvalWorkAgentInput({ agent_id: 'test-agent', work_id: 'w1', interact_id: 'i1', task_content: 'Task content for fallback', agent_output: 'Agent output for fallback test', trace_id: 'tr1' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      const result = await service.evalWorkAgent(input, context, output);

      expect(result).toBe(true);
      expect(output.scores).toBeDefined();
      expect(output.eval_id).toBeTruthy();
      expect(output.scores!.correctness).toBeDefined();
      expect(output.scores!.completeness).toBeDefined();
    });

    // TC-EA-007
    it('TC-EA-007: evaluation persisted to agent_evaluation table', async () => {
      const input = new EvalWorkAgentInput({ agent_id: 'test-agent', work_id: 'w2', interact_id: 'i2', task_content: 'Task persist', agent_output: 'Output persist', trace_id: 'tr2' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      await service.evalWorkAgent(input, context, output);

      const row = db.prepare('SELECT * FROM agent_evaluation WHERE eval_id = ?').get(output.eval_id) as Record<string, unknown> | undefined;
      expect(row).toBeDefined();
      expect(row!.agent_id).toBe('test-agent');
      expect(row!.eval_type).toBe('WORK_AGENT');
      expect(row!.work_id).toBe('w2');
      expect(row!.interact_id).toBe('i2');
      const scores = JSON.parse(row!.scores as string);
      expect(scores.overall).toBe(82);
    });

    // TC-EA-008
    it('TC-EA-008: agent eval_score updated in agent table', async () => {
      const input = new EvalWorkAgentInput({ agent_id: 'test-agent', work_id: 'w3', interact_id: 'i3', task_content: 'Task score', agent_output: 'Output score', trace_id: 'tr3' });
      const context = new EvalWorkAgentContext();
      const output = new EvalWorkAgentOutput();

      await service.evalWorkAgent(input, context, output);

      const agent = db.prepare('SELECT eval_score FROM agent WHERE agent_id = ?').get('test-agent') as Record<string, unknown>;
      expect(agent.eval_score).toBe(82);
    });
  });

  // ─── evalWriterAgent ────────────────────────────────────────────
  describe('evalWriterAgent', () => {
    // TC-EA-009
    it('TC-EA-009: evaluates Writer with LLM for 5 dimensions', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: '{"clarity":88,"informativeness":82,"user_alignment":90,"conciseness":78,"overall":85}' } }],
        usage: { totalTokens: 30 },
      });

      const input = new EvalWriterAgentInput({ agent_id: 'writer-agent', work_id: 'w1', interact_id: 'i1', user_query: 'What is TypeScript?', final_response: 'TypeScript is a typed superset of JavaScript.', agent_results: [] });
      const context = new EvalWriterAgentContext();
      const output = new EvalWriterAgentOutput();

      const result = await service.evalWriterAgent(input, context, output);

      expect(result).toBe(true);
      expect(output.eval_id).toBeTruthy();
      expect(output.scores).toEqual({
        clarity: 88,
        informativeness: 82,
        user_alignment: 90,
        conciseness: 78,
        overall: 85,
      });
    });

    // TC-EA-010
    it('TC-EA-010: eval_type=WRITER_AGENT in stored record', async () => {
      const input = new EvalWriterAgentInput({ agent_id: 'writer-agent', work_id: 'w2', interact_id: 'i2', user_query: 'Hello', final_response: 'Hi there!', agent_results: [] });
      const context = new EvalWriterAgentContext();
      const output = new EvalWriterAgentOutput();

      await service.evalWriterAgent(input, context, output);

      const row = db.prepare('SELECT * FROM agent_evaluation WHERE eval_id = ?').get(output.eval_id) as Record<string, unknown>;
      expect(row.eval_type).toBe('WRITER_AGENT');
      expect(row.agent_id).toBe('writer-agent');
    });

    // TC-EA-011
    it('TC-EA-011: need_optimize detection based on threshold for Writer', async () => {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: '{"clarity":20,"informativeness":15,"user_alignment":25,"conciseness":10,"overall":18}' } }],
        usage: { totalTokens: 30 },
      });

      const input = new EvalWriterAgentInput({ agent_id: 'writer-agent', work_id: 'w3', interact_id: 'i3', user_query: 'Query', final_response: 'Bad', agent_results: [] });
      const context = new EvalWriterAgentContext();
      const output = new EvalWriterAgentOutput();

      await service.evalWriterAgent(input, context, output);

      expect(output.need_optimize).toBe(true);
      expect(output.suggestions).toEqual(['Consider restructuring the response', 'Review user profile alignment']);
    });
  });

  // ─── startEvalSchedule / stopEvalSchedule ───────────────────────
  describe('startEvalSchedule & stopEvalSchedule', () => {
    // TC-EA-012
    it('TC-EA-012: startEvalSchedule returns worker_id', () => {
      const input = new StartEvalScheduleInput({ interval_ms: 60000 });
      const context = new StartEvalScheduleContext();
      const output = new StartEvalScheduleOutput();

      const result = (service as unknown as { startEvalSchedule: (i: StartEvalScheduleInput, c: StartEvalScheduleContext, o: StartEvalScheduleOutput) => boolean }).startEvalSchedule(input, context, output);

      expect(result).toBe(true);
      expect(output.worker_id).toBeTruthy();
      expect(typeof output.worker_id).toBe('string');
    });

    // TC-EA-013
    it('TC-EA-013: stopEvalSchedule with worker_id stops specific worker', () => {
      const startInput = new StartEvalScheduleInput({ interval_ms: 60000 });
      const startContext = new StartEvalScheduleContext();
      const startOutput = new StartEvalScheduleOutput();
      (service as unknown as { startEvalSchedule: (i: StartEvalScheduleInput, c: StartEvalScheduleContext, o: StartEvalScheduleOutput) => boolean }).startEvalSchedule(startInput, startContext, startOutput);

      const stopInput = new StopEvalScheduleInput({ worker_id: startOutput.worker_id });
      const stopContext = new StopEvalScheduleContext();
      const stopOutput = new StopEvalScheduleOutput();
      const result = (service as unknown as { stopEvalSchedule: (i: StopEvalScheduleInput, c: StopEvalScheduleContext, o: StopEvalScheduleOutput) => boolean }).stopEvalSchedule(stopInput, stopContext, stopOutput);

      expect(result).toBe(true);
    });

    // TC-EA-014
    it('TC-EA-014: stopEvalSchedule without worker_id stops all workers', () => {
      const svc = service as unknown as { startEvalSchedule: (i: StartEvalScheduleInput, c: StartEvalScheduleContext, o: StartEvalScheduleOutput) => boolean; stopEvalSchedule: (i: StopEvalScheduleInput, c: StopEvalScheduleContext, o: StopEvalScheduleOutput) => boolean };
      svc.startEvalSchedule(new StartEvalScheduleInput({ interval_ms: 60000 }), new StartEvalScheduleContext(), new StartEvalScheduleOutput());
      svc.startEvalSchedule(new StartEvalScheduleInput({ interval_ms: 120000 }), new StartEvalScheduleContext(), new StartEvalScheduleOutput());

      const stopInput = new StopEvalScheduleInput({});
      const stopContext = new StopEvalScheduleContext();
      const stopOutput = new StopEvalScheduleOutput();

      expect(() => svc.stopEvalSchedule(stopInput, stopContext, stopOutput)).not.toThrow();
    });

    // TC-EA-015
    it('TC-EA-015: duplicate start does not throw', () => {
      const svc = service as unknown as { startEvalSchedule: (i: StartEvalScheduleInput, c: StartEvalScheduleContext, o: StartEvalScheduleOutput) => boolean };

      expect(() => {
        svc.startEvalSchedule(new StartEvalScheduleInput({ interval_ms: 60000 }), new StartEvalScheduleContext(), new StartEvalScheduleOutput());
        svc.startEvalSchedule(new StartEvalScheduleInput({ interval_ms: 60000 }), new StartEvalScheduleContext(), new StartEvalScheduleOutput());
      }).not.toThrow();
    });

    // TC-EA-016
    it('TC-EA-016: default interval_ms used when not provided', () => {
      const input = new StartEvalScheduleInput({});
      const context = new StartEvalScheduleContext();
      const output = new StartEvalScheduleOutput();

      const result = (service as unknown as { startEvalSchedule: (i: StartEvalScheduleInput, c: StartEvalScheduleContext, o: StartEvalScheduleOutput) => boolean }).startEvalSchedule(input, context, output);

      expect(result).toBe(true);
      expect(output.worker_id).toBeTruthy();
    });

    // TC-EA-017
    it('TC-EA-017: schedule timer fires with fake timers', async () => {
      vi.useFakeTimers();

      const svc = service as unknown as { startEvalSchedule: (i: StartEvalScheduleInput, c: StartEvalScheduleContext, o: StartEvalScheduleOutput) => boolean; stopEvalSchedule: (i: StopEvalScheduleInput, c: StopEvalScheduleContext, o: StopEvalScheduleOutput) => boolean };
      const output = new StartEvalScheduleOutput();
      svc.startEvalSchedule(new StartEvalScheduleInput({ interval_ms: 5000 }), new StartEvalScheduleContext(), output);

      const evalWriteSpy = vi.spyOn(service, 'evalWorkAgent');

      await vi.advanceTimersByTimeAsync(5000);

      svc.stopEvalSchedule(new StopEvalScheduleInput({ worker_id: output.worker_id }), new StopEvalScheduleContext(), new StopEvalScheduleOutput());

      vi.useRealTimers();
    });

    // TC-EA-018
    it('TC-EA-018: stopEvalSchedule with non-existent worker_id does not throw', () => {
      const svc = service as unknown as { stopEvalSchedule: (i: StopEvalScheduleInput, c: StopEvalScheduleContext, o: StopEvalScheduleOutput) => boolean };

      expect(() => {
        svc.stopEvalSchedule(new StopEvalScheduleInput({ worker_id: 'nonexistent' }), new StopEvalScheduleContext(), new StopEvalScheduleOutput());
      }).not.toThrow();
    });

    // TC-EA-019
    it('TC-EA-019: stopEvalSchedule returns true', () => {
      const svc = service as unknown as { startEvalSchedule: (i: StartEvalScheduleInput, c: StartEvalScheduleContext, o: StartEvalScheduleOutput) => boolean; stopEvalSchedule: (i: StopEvalScheduleInput, c: StopEvalScheduleContext, o: StopEvalScheduleOutput) => boolean };
      const startOutput = new StartEvalScheduleOutput();
      svc.startEvalSchedule(new StartEvalScheduleInput({}), new StartEvalScheduleContext(), startOutput);

      const stopOutput = new StopEvalScheduleOutput();
      const result = svc.stopEvalSchedule(new StopEvalScheduleInput({ worker_id: startOutput.worker_id }), new StopEvalScheduleContext(), stopOutput);

      expect(result).toBe(true);
    });
  });

  // ─── getEvaluation ──────────────────────────────────────────────
  describe('getEvaluation', () => {
    async function createEvaluation(agentId: string, taskContent: string, agentOutput: string): Promise<string> {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: '{"correctness":90,"completeness":85,"efficiency":80,"relevance":88,"overall":86}' } }],
        usage: { totalTokens: 30 },
      });
      const input = new EvalWorkAgentInput({ agent_id: agentId, work_id: 'w-getEval', interact_id: 'i-getEval', task_content: taskContent, agent_output: agentOutput, trace_id: 'tr-getEval' });
      const output = new EvalWorkAgentOutput();
      await service.evalWorkAgent(input, new EvalWorkAgentContext(), output);
      return output.eval_id!;
    }

    // TC-EA-020
    it('TC-EA-020: query by agent_id returns evaluations', async () => {
      await createEvaluation('test-agent', 'Task A', 'Output A');
      await createEvaluation('test-agent', 'Task B', 'Output B');

      const input = new GetEvaluationInput({ agent_id: 'test-agent' });
      const context = new GetEvaluationContext();
      const output = new GetEvaluationOutput();

      const result = (service as unknown as { getEvaluation: (i: GetEvaluationInput, c: GetEvaluationContext, o: GetEvaluationOutput) => boolean }).getEvaluation(input, context, output);

      expect(result).toBe(true);
      expect(output.evaluations).toBeDefined();
      expect(output.evaluations!.length).toBe(2);
    });

    // TC-EA-021
    it('TC-EA-021: query by eval_type filters correctly', async () => {
      await createEvaluation('test-agent', 'Task X', 'Output X');

      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: '{"clarity":90,"informativeness":85,"user_alignment":88,"conciseness":80,"overall":86}' } }],
        usage: { totalTokens: 30 },
      });
      const writerInput = new EvalWriterAgentInput({ agent_id: 'writer-agent', work_id: 'w-wr', interact_id: 'i-wr', user_query: 'Q', final_response: 'R', agent_results: [] });
      const writerOutput = new EvalWriterAgentOutput();
      await service.evalWriterAgent(writerInput, new EvalWriterAgentContext(), writerOutput);

      const input = new GetEvaluationInput({ eval_type: 'WRITER_AGENT' });
      const context = new GetEvaluationContext();
      const output = new GetEvaluationOutput();

      (service as unknown as { getEvaluation: (i: GetEvaluationInput, c: GetEvaluationContext, o: GetEvaluationOutput) => boolean }).getEvaluation(input, context, output);

      expect(output.evaluations!.length).toBe(1);
      expect(output.evaluations![0].eval_type).toBe('WRITER_AGENT');
    });

    // TC-EA-022
    it('TC-EA-022: pagination works', async () => {
      for (let i = 0; i < 5; i++) {
        await createEvaluation('test-agent', `Task ${i}`, `Output ${i}`);
      }

      const input = new GetEvaluationInput({ agent_id: 'test-agent', page_num: 1, page_size: 2 });
      const context = new GetEvaluationContext();
      const output = new GetEvaluationOutput();

      (service as unknown as { getEvaluation: (i: GetEvaluationInput, c: GetEvaluationContext, o: GetEvaluationOutput) => boolean }).getEvaluation(input, context, output);

      expect(output.evaluations!.length).toBe(2);
    });

    // TC-EA-023
    it('TC-EA-023: second page returns correct offset', async () => {
      for (let i = 0; i < 5; i++) {
        await createEvaluation('test-agent', `Task ${i}`, `Output ${i}`);
      }

      const input = new GetEvaluationInput({ agent_id: 'test-agent', page_num: 2, page_size: 2 });
      const context = new GetEvaluationContext();
      const output = new GetEvaluationOutput();

      (service as unknown as { getEvaluation: (i: GetEvaluationInput, c: GetEvaluationContext, o: GetEvaluationOutput) => boolean }).getEvaluation(input, context, output);

      expect(output.evaluations!.length).toBe(2);
    });

    // TC-EA-024
    it('TC-EA-024: empty results returns empty array', () => {
      const input = new GetEvaluationInput({ agent_id: 'no-eval-agent' });
      const context = new GetEvaluationContext();
      const output = new GetEvaluationOutput();

      const result = (service as unknown as { getEvaluation: (i: GetEvaluationInput, c: GetEvaluationContext, o: GetEvaluationOutput) => boolean }).getEvaluation(input, context, output);

      expect(result).toBe(true);
      expect(output.evaluations).toEqual([]);
    });
  });

  // ─── getEvolutionReport ─────────────────────────────────────────
  describe('getEvolutionReport', () => {
    async function createEvaluation(agentId: string, taskContent: string, agentOutput: string, scoreJson: string): Promise<void> {
      mockLlmService.chatCompletion.mockResolvedValueOnce({
        choices: [{ message: { content: scoreJson } }],
        usage: { totalTokens: 30 },
      });
      const input = new EvalWorkAgentInput({ agent_id: agentId, work_id: 'w-report', interact_id: 'i-report', task_content: taskContent, agent_output: agentOutput, trace_id: 'tr-report' });
      const output = new EvalWorkAgentOutput();
      await service.evalWorkAgent(input, new EvalWorkAgentContext(), output);
    }

    // TC-EA-025
    it('TC-EA-025: basic report for agent with evaluations', async () => {
      await createEvaluation('test-agent', 'T1', 'O1', '{"correctness":80,"completeness":75,"efficiency":70,"relevance":85,"overall":78}');
      await createEvaluation('test-agent', 'T2', 'O2', '{"correctness":90,"completeness":88,"efficiency":85,"relevance":92,"overall":89}');

      const input = new GetEvolutionReportInput({ agent_id: 'test-agent' });
      const context = new GetEvolutionReportContext();
      const output = new GetEvolutionReportOutput();

      const result = (service as unknown as { getEvolutionReport: (i: GetEvolutionReportInput, c: GetEvolutionReportContext, o: GetEvolutionReportOutput) => boolean }).getEvolutionReport(input, context, output);

      expect(result).toBe(true);
      expect(output.report).toBeDefined();
      expect(output.report!.agent_id).toBe('test-agent');
      expect(output.report!.agent_name).toBe('TestAgent');
      expect(output.report!.agent_type).toBe('WORKER');
      expect(output.report!.current_score).toBe(89);
      expect(output.report!.score_trend).toHaveLength(2);
    });

    // TC-EA-026
    it('TC-EA-026: report includes component_changes and usage_trend', async () => {
      const input = new GetEvolutionReportInput({ agent_id: 'test-agent' });
      const context = new GetEvolutionReportContext();
      const output = new GetEvolutionReportOutput();

      (service as unknown as { getEvolutionReport: (i: GetEvolutionReportInput, c: GetEvolutionReportContext, o: GetEvolutionReportOutput) => boolean }).getEvolutionReport(input, context, output);

      expect(output.report).toBeDefined();
      expect(output.report!.component_changes).toEqual([]);
      expect(output.report!.usage_trend).toEqual([]);
    });

    // TC-EA-027
    it('TC-EA-027: no evaluations: report with empty trends', () => {
      const input = new GetEvolutionReportInput({ agent_id: 'test-agent' });
      const context = new GetEvolutionReportContext();
      const output = new GetEvolutionReportOutput();

      (service as unknown as { getEvolutionReport: (i: GetEvolutionReportInput, c: GetEvolutionReportContext, o: GetEvolutionReportOutput) => boolean }).getEvolutionReport(input, context, output);

      expect(output.report).toBeDefined();
      expect(output.report!.score_trend).toEqual([]);
      expect(output.report!.current_score).toBe(50);
    });

    // TC-EA-028
    it('TC-EA-028: report includes evolution_summary', async () => {
      await createEvaluation('test-agent', 'T', 'O', '{"correctness":70,"completeness":65,"efficiency":60,"relevance":75,"overall":68}');

      const input = new GetEvolutionReportInput({ agent_id: 'test-agent' });
      const context = new GetEvolutionReportContext();
      const output = new GetEvolutionReportOutput();

      (service as unknown as { getEvolutionReport: (i: GetEvolutionReportInput, c: GetEvolutionReportContext, o: GetEvolutionReportOutput) => boolean }).getEvolutionReport(input, context, output);

      expect(output.report).toBeDefined();
      expect(output.report!.evolution_summary).toContain('test-agent');
      expect(output.report!.evolution_summary).toContain('Current overall score');
      expect(output.report!.evolution_summary).toContain('68');
    });

    // TC-EA-029
    it('TC-EA-029: agent without evals still reports agent metadata', () => {
      const input = new GetEvolutionReportInput({ agent_id: 'writer-agent' });
      const context = new GetEvolutionReportContext();
      const output = new GetEvolutionReportOutput();

      (service as unknown as { getEvolutionReport: (i: GetEvolutionReportInput, c: GetEvolutionReportContext, o: GetEvolutionReportOutput) => boolean }).getEvolutionReport(input, context, output);

      expect(output.report!.agent_name).toBe('WriterAgent');
      expect(output.report!.agent_type).toBe('WRITER');
    });
  });

  // ─── configEvolutorAgent ────────────────────────────────────────
  describe('configEvolutorAgent', () => {
    function getRawConfig() {
      return service as unknown as { configEvolutorAgent: (i: ConfigEvolutorAgentInput, c: ConfigEvolutorAgentContext, o: ConfigEvolutorAgentOutput) => boolean };
    }

    // TC-EA-030
    it('TC-EA-030: initial config has default values', () => {
      const input = new ConfigEvolutorAgentInput({});
      const context = new ConfigEvolutorAgentContext();
      const output = new ConfigEvolutorAgentOutput();

      getRawConfig().configEvolutorAgent(input, context, output);

      expect(output.optimize_threshold).toBe(60);
      expect(output.eval_frequency_threshold).toBe(5);
      expect(output.eval_schedule_interval_ms).toBe(3600000);
      expect(output.eval_batch_size).toBe(20);
      expect(output.eval_work_prompt_template_id).toBe('');
      expect(output.eval_write_prompt_template_id).toBe('');
    });

    // TC-EA-031
    it('TC-EA-031: update optimize_threshold works', () => {
      const updateInput = new ConfigEvolutorAgentInput({ optimize_threshold: 80 });
      const updateContext = new ConfigEvolutorAgentContext();
      const updateOutput = new ConfigEvolutorAgentOutput();
      getRawConfig().configEvolutorAgent(updateInput, updateContext, updateOutput);

      expect(updateOutput.optimize_threshold).toBe(80);

      const readInput = new ConfigEvolutorAgentInput({});
      const readOutput = new ConfigEvolutorAgentOutput();
      getRawConfig().configEvolutorAgent(readInput, new ConfigEvolutorAgentContext(), readOutput);

      expect(readOutput.optimize_threshold).toBe(80);
    });

    // TC-EA-032
    it('TC-EA-032: update eval_schedule_interval_ms and eval_batch_size', () => {
      const input = new ConfigEvolutorAgentInput({ eval_schedule_interval_ms: 7200000, eval_batch_size: 50 });
      const context = new ConfigEvolutorAgentContext();
      const output = new ConfigEvolutorAgentOutput();
      getRawConfig().configEvolutorAgent(input, context, output);

      expect(output.eval_schedule_interval_ms).toBe(7200000);
      expect(output.eval_batch_size).toBe(50);
    });

    // TC-EA-033
    it('TC-EA-033: update eval_frequency_threshold persists', () => {
      const input = new ConfigEvolutorAgentInput({ eval_frequency_threshold: 10 });
      const context = new ConfigEvolutorAgentContext();
      const output = new ConfigEvolutorAgentOutput();
      getRawConfig().configEvolutorAgent(input, context, output);

      expect(output.eval_frequency_threshold).toBe(10);

      const readInput = new ConfigEvolutorAgentInput({});
      const readOutput = new ConfigEvolutorAgentOutput();
      getRawConfig().configEvolutorAgent(readInput, new ConfigEvolutorAgentContext(), readOutput);

      expect(readOutput.eval_frequency_threshold).toBe(10);
    });
  });
});
