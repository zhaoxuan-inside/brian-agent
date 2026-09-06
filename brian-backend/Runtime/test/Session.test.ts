/**
 * @fileoverview Session 模块单元测试（Runtime v2 · 阶段1）。
 *
 * 真实 :memory: SQLite + mock logger（Runtime vitest 约定）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess } from '@brian-agent/base';
import { SessionAccess } from '../Session/access/SessionAccess';
import {
  SessionContext,
  AddSessionInput,
  AddSessionOutput,
  AddMessageInput,
  AddMessageOutput,
  AddPartInput,
  AddPartOutput,
  UpdatePartInput,
  UpdatePartOutput,
  SoMessagesInput,
  SoMessagesOutput,
  MessageRole,
  PartType,
  PartStatus,
} from '../Session/domain/types';

describe('Session', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let sessionAccess: SessionAccess;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-session-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    sessionAccess = new SessionAccess(relationDb);
    await sessionAccess.initialize();
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  async function makeSession(): Promise<string> {
    const input = new AddSessionInput();
    input.session_key = `sess-${Date.now()}`;
    const output = new AddSessionOutput();
    await sessionAccess.addSession(input, output, new SessionContext());
    return output.session_id;
  }

  async function makeMessage(sessionId: string, role: MessageRole, content: string): Promise<string> {
    const input = new AddMessageInput();
    input.session_id = sessionId;
    input.role = role;
    input.content = content;
    const output = new AddMessageOutput();
    await sessionAccess.addMessage(input, output, new SessionContext());
    return output.message_id;
  }

  it('addSession 应该幂等：重复 session_key 返回既有 id', async () => {
    const first = new AddSessionInput();
    first.session_key = 'sess-dup';
    const firstOut = new AddSessionOutput();
    const second = new AddSessionInput();
    second.session_key = 'sess-dup';
    const secondOut = new AddSessionOutput();
    await sessionAccess.addSession(first, firstOut, new SessionContext());
    await sessionAccess.addSession(second, secondOut, new SessionContext());
    expect(firstOut.created).toBe(true);
    expect(secondOut.created).toBe(false);
    expect(firstOut.session_id).toBe(secondOut.session_id);
  });

  it('addMessage 应该保证 seq 严格递增', async () => {
    const sessionId = await makeSession();
    const seqs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const input = new AddMessageInput();
      input.session_id = sessionId;
      input.role = i % 2 === 0 ? MessageRole.User : MessageRole.Assistant;
      input.content = `msg-${i}`;
      const output = new AddMessageOutput();
      await sessionAccess.addMessage(input, output, new SessionContext());
      seqs.push(output.seq);
    }
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('soMessages 应该按 seq 升序返回消息与有序 Parts', async () => {
    const sessionId = await makeSession();
    await makeMessage(sessionId, 'user', '问题');
    const mid = await makeMessage(sessionId, 'assistant', '答案');
    const partIds: string[] = [];
    for (const partType of [PartType.Reasoning, PartType.Text]) {
      const input = new AddPartInput();
      input.message_id = mid;
      input.part_type = partType;
      input.content = partType === PartType.Reasoning ? '思考' : '正文';
      const output = new AddPartOutput();
      await sessionAccess.addPart(input, output, new SessionContext());
      partIds.push(output.part_id);
    }
    const soInput = new SoMessagesInput();
    soInput.session_id = sessionId;
    const soOut = new SoMessagesOutput();
    await sessionAccess.soMessages(soInput, soOut, new SessionContext());
    expect(soOut.messages.map((m) => m.content)).toEqual(['问题', '答案']);
    const answer = soOut.messages[1];
    expect(answer.parts.map((p) => p.part_type)).toEqual(['reasoning', 'text']);
    expect(answer.parts[0].id).toBe(partIds[0]);
  });

  it('updatePart 应该应用状态机与 content delta 追加', async () => {
    const sessionId = await makeSession();
    const mid = await makeMessage(sessionId, 'assistant', '');
    const input = new AddPartInput();
    input.message_id = mid;
    input.part_type = PartType.Text;
    input.content = '你好';
    const output = new AddPartOutput();
    await sessionAccess.addPart(input, output, new SessionContext());
    const upd = new UpdatePartInput();
    upd.part_id = output.part_id;
    upd.content_patch = '，世界';
    upd.status = PartStatus.Completed;
    await sessionAccess.updatePart(upd, new UpdatePartOutput(), new SessionContext());
    const soIn = new SoMessagesInput();
    soIn.session_id = sessionId;
    const soOut = new SoMessagesOutput();
    await sessionAccess.soMessages(soIn, soOut, new SessionContext());
    expect(soOut.messages[0].parts[0].content).toBe('你好，世界');
    expect(soOut.messages[0].parts[0].status).toBe('completed');
  });

  it('updatePart 不存在的 Part 应该 fail-loud', async () => {
    const upd = new UpdatePartInput();
    upd.part_id = 'not-exists';
    await expect(
      sessionAccess.updatePart(upd, new UpdatePartOutput(), new SessionContext()),
    ).rejects.toMatchObject({ error_code: 'NOT_FOUND' });
  });

  it('soMessages 分页游标（before_seq）应该生效', async () => {
    const sessionId = await makeSession();
    for (let i = 0; i < 4; i++) {
      await makeMessage(sessionId, i % 2 === 0 ? MessageRole.User : MessageRole.Assistant, `m-${i}`);
    }
    const page = new SoMessagesInput();
    page.session_id = sessionId;
    page.before_seq = 3;
    const pageOut = new SoMessagesOutput();
    await sessionAccess.soMessages(page, pageOut, new SessionContext());
    expect(pageOut.messages.map((m) => m.seq)).toEqual([1, 2]);
  });
});
