import { describe, it, expect, beforeAll } from 'vitest';
import { NotFoundError } from '@brian-agent/base';
import { AgentLibraryService } from '../AgentLibrary/application/AgentLibraryService';
import {
  AgentLibraryContext, AddAgentInput, AddAgentOutput, GetAgentInput, GetAgentOutput,
  BindAgentComponentInput, BindAgentComponentOutput,
  UnbindAgentComponentInput, UnbindAgentComponentOutput,
  ComponentKind,
} from '../AgentLibrary/domain/types';
import { createTestDb, setupAgentTestMocks, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS } from './test-helpers';

describe('AgentLibrary 绑定 API（绑定唯一事实源 = agent 表）', () => {
  let service: AgentLibraryService;

  beforeAll(async () => {
    await setupAgentTestMocks();
    const db = await createTestDb();
    try {
      db.executeRaw('ALTER TABLE agent_library_config ADD COLUMN regen_rate INTEGER NOT NULL DEFAULT 75');
    } catch {  }
    service = new AgentLibraryService(db, NOOP_LLM_ACCESS, NOOP_PROMPTS_ACCESS);
  });

  async function makeAgent(): Promise<string> {
    const agentId = `bind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await service.addAgent(Object.assign(new AddAgentInput(), {
      agent_id: agentId, agent_type: 'WORKER', strategy_id: 'strategy-1',
      soul_id: 'soul-base', task_signature: '[general] binding', agent_name: 'BindAgent',
    }), new AddAgentOutput(), new AgentLibraryContext());
    return agentId;
  }

  async function getRecord(agentId: string) {
    const out = new GetAgentOutput();
    await service.soAgent(Object.assign(new GetAgentInput(), { agent_id: agentId }), out, new AgentLibraryContext());
    return out.agents[0];
  }

  it('bindAgentComponent 应全量替换 skill 绑定并落 agent 表', async () => {
    const agentId = await makeAgent();
    const out = new BindAgentComponentOutput();
    await service.bindAgentComponent(Object.assign(new BindAgentComponentInput(), {
      agent_id: agentId, component_kind: ComponentKind.Skill, component_ids: ['skill-a', 'skill-b'],
    }), out, new AgentLibraryContext());
    expect(out.bound).toEqual(['skill-a', 'skill-b']);

    await service.bindAgentComponent(Object.assign(new BindAgentComponentInput(), {
      agent_id: agentId, component_kind: ComponentKind.Skill, component_ids: ['skill-c'],
    }), new BindAgentComponentOutput(), new AgentLibraryContext());

    const record = await getRecord(agentId);
    expect(record.skill_ids).toEqual(['skill-c']);
  });

  it('soul/prompt 应单值绑定，unbind 缺省解绑全部', async () => {
    const agentId = await makeAgent();
    await service.bindAgentComponent(Object.assign(new BindAgentComponentInput(), {
      agent_id: agentId, component_kind: ComponentKind.Soul, component_ids: ['soul-new'],
    }), new BindAgentComponentOutput(), new AgentLibraryContext());
    await service.bindAgentComponent(Object.assign(new BindAgentComponentInput(), {
      agent_id: agentId, component_kind: ComponentKind.Prompt, component_ids: ['prompt-1'],
    }), new BindAgentComponentOutput(), new AgentLibraryContext());

    let record = await getRecord(agentId);
    expect(record.soul_id).toBe('soul-new');
    expect(record.prompt_template_id).toBe('prompt-1');

    const unbindOut = new UnbindAgentComponentOutput();
    await service.unbindAgentComponent(Object.assign(new UnbindAgentComponentInput(), {
      agent_id: agentId, component_kind: ComponentKind.Soul,
    }), unbindOut, new AgentLibraryContext());
    expect(unbindOut.unbound).toBe(true);
    record = await getRecord(agentId);
    expect(record.soul_id).toBe('');

    const again = new UnbindAgentComponentOutput();
    await service.unbindAgentComponent(Object.assign(new UnbindAgentComponentInput(), {
      agent_id: agentId, component_kind: ComponentKind.Soul,
    }), again, new AgentLibraryContext());
    expect(again.unbound).toBe(false);
  });

  it('未知 agent 应 fail-loud', async () => {
    await expect(
      service.bindAgentComponent(Object.assign(new BindAgentComponentInput(), {
        agent_id: 'not-exists', component_kind: ComponentKind.Skill, component_ids: ['x'],
      }), new BindAgentComponentOutput(), new AgentLibraryContext()),
    ).rejects.toThrow(NotFoundError);
  });
});
