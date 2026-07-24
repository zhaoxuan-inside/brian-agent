import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatDagService } from '../../src/application/ChatDagService';
import type { UserMessage } from '../../src/core/information/InformationService';

function makeMsg(overrides: Partial<UserMessage>): UserMessage {
  return {
    id: overrides.id ?? overrides.msgId ?? 'id',
    userId: 'u1',
    sessionId: 's1',
    exchangeId: 'ex1',
    msgId: 'm0',
    role: 'user',
    content: '',
    summary: '',
    tokens: 0,
    tags: [],
    isLearningMemory: false,
    messageIndex: 0,
    referenceCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// 会话消息：m1(user) -> m2(asst) -> m3(user) -> m4(asst) -> m5(user,分支) -> m6(asst,同一exchange)
// 引用：m5 引用了 m1 → m5/m6 整个 exchange 为分支，排除出主链
function makeMessages(): UserMessage[] {
  return [
    makeMsg({ msgId: 'm1', exchangeId: 'ex1', role: 'user', content: '第一条用户消息', messageIndex: 0, createdAt: 1000 }),
    makeMsg({ msgId: 'm2', exchangeId: 'ex1', role: 'assistant', content: '第一条助手回复', messageIndex: 1, createdAt: 2000 }),
    makeMsg({ msgId: 'm3', exchangeId: 'ex2', role: 'user', content: '第二条用户消息', messageIndex: 2, createdAt: 3000 }),
    makeMsg({ msgId: 'm4', exchangeId: 'ex2', role: 'assistant', content: '第二条助手回复', messageIndex: 3, createdAt: 4000 }),
    makeMsg({ msgId: 'm5', exchangeId: 'ex3', role: 'user', content: '第三条用户消息（分支）', messageIndex: 4, createdAt: 5000 }),
    makeMsg({ msgId: 'm6', exchangeId: 'ex3', role: 'assistant', content: '第三条助手回复（分支）', messageIndex: 5, createdAt: 6000 }),
  ];
}

function makeService(overrides: {
  messages?: UserMessage[];
  references?: { msgId: string; referencedMsgId: string }[];
  llmResult?: string;
  llmError?: boolean;
  hasModel?: boolean;
} = {}) {
  const informationService = {
    getMessagesByChat: vi.fn().mockResolvedValue(overrides.messages ?? makeMessages()),
    getReferencesBySession: vi.fn().mockResolvedValue(
      overrides.references ?? [{ msgId: 'm5', referencedMsgId: 'm1' }]
    ),
    getMessageByMsgId: vi.fn(async (msgId: string) =>
      (overrides.messages ?? makeMessages()).find(m => m.msgId === msgId)),
    getMessagesByMsgIds: vi.fn(async (ids: string[]) =>
      (overrides.messages ?? makeMessages()).filter(m => ids.includes(m.msgId))),
    saveReferences: vi.fn().mockResolvedValue(undefined),
    updateMessageSummary: vi.fn().mockResolvedValue(undefined),
    getMessagesNeedingSummary: vi.fn().mockResolvedValue([]),
  };
  const llmService = {
    chatCompletion: overrides.llmError
      ? vi.fn().mockRejectedValue(new Error('LLM unavailable'))
      : vi.fn().mockResolvedValue({
          choices: [{ message: { role: 'assistant', content: overrides.llmResult ?? '语义摘要' } }],
        }),
  };
  const modelConfigService = {
    listConfigs: vi.fn().mockResolvedValue(
      overrides.hasModel === false
        ? []
        : [{ id: 'cfg-1', modelId: 'gpt-4o-mini', status: 'active', isDefault: true }]
    ),
  };
  const service = new ChatDagService(
    informationService as any,
    llmService as any,
    modelConfigService as any
  );
  return { service, informationService, llmService };
}

describe('ChatDagService.resolveAncestorContext（祖先闭包上下文）', () => {
  it('选中中间节点：包含其自身及以上全部祖先，不包含以下消息', async () => {
    const { service } = makeService();
    const context = await service.resolveAncestorContext('u1', 's1', ['m3']);
    expect(context.map(m => m.content)).toEqual(['第一条用户消息', '第一条助手回复', '第二条用户消息']);
  });

  it('选中最早节点：闭包只包含其自身', async () => {
    const { service } = makeService();
    const context = await service.resolveAncestorContext('u1', 's1', ['m1']);
    expect(context.map(m => m.content)).toEqual(['第一条用户消息']);
  });

  it('选中带引用的节点：沿顺序边与引用边回溯，覆盖全部祖先', async () => {
    const { service } = makeService();
    const context = await service.resolveAncestorContext('u1', 's1', ['m5']);
    expect(context.length).toBe(5);
  });

  it('多选：取并集，按时间正序返回', async () => {
    const { service } = makeService();
    const context = await service.resolveAncestorContext('u1', 's1', ['m3', 'm1']);
    expect(context.map(m => m.content)).toEqual(['第一条用户消息', '第一条助手回复', '第二条用户消息']);
  });

  it('空选择：返回空上下文', async () => {
    const { service } = makeService();
    expect(await service.resolveAncestorContext('u1', 's1', [])).toEqual([]);
  });
});

describe('ChatDagService.buildSessionDag（DAG 构建）', () => {
  it('生成消息级节点与顺序/引用边，分支 exchange（用户+助手）整体排除出主链', async () => {
    const { service } = makeService();
    const dag = await service.buildSessionDag('u1', 's1');

    expect(dag.nodes.length).toBe(6);
    expect(dag.nodes[0].msgId).toBe('m1');
    expect(dag.nodes[0].role).toBe('user');

    const seqEdges = dag.edges.filter(e => e.type === 'sequence');
    const refEdges = dag.edges.filter(e => e.type === 'reference');
    // m5 有引用 → exchange ex3 整体为分支，主链仅 m1~m4（3 条顺序边）
    // 分支 exchange 内部 m5→m6 另有 1 条顺序边；主链不含 m5/m6 的跨 exchange 连接
    expect(seqEdges.length).toBe(4);
    expect(seqEdges).toContainEqual({ from: 'm1', to: 'm2', type: 'sequence' });
    expect(seqEdges).toContainEqual({ from: 'm2', to: 'm3', type: 'sequence' });
    expect(seqEdges).toContainEqual({ from: 'm3', to: 'm4', type: 'sequence' });
    expect(seqEdges).toContainEqual({ from: 'm5', to: 'm6', type: 'sequence' });
    expect(refEdges).toEqual([{ from: 'm1', to: 'm5', type: 'reference' }]);

    // isBranch：ex3（m5/m6）为分支，其余为主链
    expect(dag.nodes.find(n => n.msgId === 'm5')?.isBranch).toBe(true);
    expect(dag.nodes.find(n => n.msgId === 'm6')?.isBranch).toBe(true);
    expect(dag.nodes.find(n => n.msgId === 'm1')?.isBranch).toBe(false);
    expect(dag.nodes.find(n => n.msgId === 'm4')?.isBranch).toBe(false);

    expect(dag.nodes.find(n => n.msgId === 'm5')?.referencesOut).toBe(1);
    expect(dag.nodes.find(n => n.msgId === 'm1')?.referencesIn).toBe(1);
    expect(dag.nodes.find(n => n.msgId === 'm2')?.referencesIn).toBe(0);
  });

  it('summary 为空时回退为内容截断（≤20 字）', async () => {
    const messages = [
      makeMsg({ msgId: 'm1', content: '这是一条长度超过二十个字的消息内容需要被截断处理', summary: '', messageIndex: 0 }),
    ];
    const { service } = makeService({ messages, references: [] });
    const dag = await service.buildSessionDag('u1', 's1');
    expect(dag.nodes[0].summary.length).toBeLessThanOrEqual(20);
  });

  it('引用边两端不在会话内时被忽略', async () => {
    const { service } = makeService({
      references: [{ msgId: 'm1', referencedMsgId: 'ghost-msg' }],
    });
    const dag = await service.buildSessionDag('u1', 's1');
    expect(dag.edges.filter(e => e.type === 'reference').length).toBe(0);
  });
});

describe('ChatDagService.getMessageDetail（消息详情）', () => {
  it('返回完整内容与双向引用摘要列表', async () => {
    const { service } = makeService();
    const detail = await service.getMessageDetail('m1');
    expect(detail).not.toBeNull();
    expect(detail!.content).toBe('第一条用户消息');
    expect(detail!.referencesIn.map(r => r.msgId)).toEqual(['m5']);
    expect(detail!.referencesOut).toEqual([]);
  });

  it('未知 msgId 返回 null', async () => {
    const { service } = makeService();
    expect(await service.getMessageDetail('unknown')).toBeNull();
  });
});

describe('ChatDagService.generateAndSaveSummary（LLM 语义摘要）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('短内容（≤20 字）：直接保存原文，不调用 LLM', async () => {
    const { service, informationService, llmService } = makeService();
    await service.generateAndSaveSummary('m1', '短消息');
    expect(llmService.chatCompletion).not.toHaveBeenCalled();
    expect(informationService.updateMessageSummary).toHaveBeenCalledWith('m1', '短消息');
  });

  it('长内容 + LLM 成功：保存 LLM 语义摘要', async () => {
    const { service, informationService } = makeService({ llmResult: '这是一段语义摘要' });
    await service.generateAndSaveSummary('m1', '这是一条长度明显超过二十个字的消息内容，需要由模型生成语义摘要。');
    expect(informationService.updateMessageSummary).toHaveBeenCalledWith('m1', '这是一段语义摘要');
  });

  it('LLM 返回超过 20 字：截断到 20 字', async () => {
    const { service, informationService } = makeService({
      llmResult: '这个摘要返回的长度超过了二十个字的限制需要被截断处理',
    });
    await service.generateAndSaveSummary('m1', '这是一条长度明显超过二十个字的消息内容，需要由模型生成语义摘要。');
    const saved = informationService.updateMessageSummary.mock.calls[0][1] as string;
    expect(saved.length).toBeLessThanOrEqual(20);
  });

  it('LLM 失败：回退为内容前 20 字截断', async () => {
    const { service, informationService } = makeService({ llmError: true });
    const content = '这是一条长度明显超过二十个字的消息内容，LLM失败时要回退截断。';
    await service.generateAndSaveSummary('m1', content);
    expect(informationService.updateMessageSummary).toHaveBeenCalledWith('m1', content.slice(0, 20));
  });

  it('无可用模型：回退为内容前 20 字截断', async () => {
    const { service, informationService, llmService } = makeService({ hasModel: false });
    const content = '这是一条长度明显超过二十个字的消息内容，没有模型时回退截断。';
    await service.generateAndSaveSummary('m1', content);
    expect(llmService.chatCompletion).not.toHaveBeenCalled();
    expect(informationService.updateMessageSummary).toHaveBeenCalledWith('m1', content.slice(0, 20));
  });
});

describe('ChatDagService.recordReferences（引用记录）', () => {
  it('过滤空值与自引用后保存', async () => {
    const { service, informationService } = makeService();
    await service.recordReferences('s1', 'm5', ['m1', '', 'm5', 'm2']);
    expect(informationService.saveReferences).toHaveBeenCalledWith('s1', 'm5', ['m1', 'm2']);
  });

  it('全部无效时不写库', async () => {
    const { service, informationService } = makeService();
    await service.recordReferences('s1', 'm5', ['', 'm5']);
    expect(informationService.saveReferences).not.toHaveBeenCalled();
  });
});
