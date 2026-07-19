import type { AgentStatus } from '../shared/types';
import { logger } from '../infrastructure/logger';

export class AgentLifecycle {
  private statuses: Map<string, AgentStatus>;
  private createdAt: Map<string, number>;
  private lastActiveAt: Map<string, number>;
  private cancelFlags: Map<string, boolean>;

  constructor() {
    this.statuses = new Map();
    this.createdAt = new Map();
    this.lastActiveAt = new Map();
    this.cancelFlags = new Map();
  }

  createAgent(agentId: string): void {
    if (this.statuses.has(agentId)) {
      logger.warn('AgentLifecycle', `Agent ${agentId} already exists, re-creating`);
    }
    this.statuses.set(agentId, 'idle');
    this.createdAt.set(agentId, Date.now());
    this.lastActiveAt.set(agentId, Date.now());
    this.cancelFlags.set(agentId, false);
    logger.agent('AgentLifecycle', `Agent created: ${agentId}`);
  }

  activate(agentId: string): void {
    const status = this.statuses.get(agentId);
    if (!status) {
      throw new Error(`Agent ${agentId} not found. Call createAgent first.`);
    }
    if (status === 'running') {
      logger.warn('AgentLifecycle', `Agent ${agentId} is already running`);
      return;
    }
    this.statuses.set(agentId, 'running');
    this.lastActiveAt.set(agentId, Date.now());
    this.cancelFlags.set(agentId, false);
    logger.agent('AgentLifecycle', `Agent activated: ${agentId}`);
  }

  deactivate(agentId: string): void {
    const status = this.statuses.get(agentId);
    if (!status) {
      throw new Error(`Agent ${agentId} not found`);
    }
    if (status === 'idle') {
      return;
    }
    this.statuses.set(agentId, 'idle');
    logger.agent('AgentLifecycle', `Agent deactivated: ${agentId}`);
  }

  getStatus(agentId: string): AgentStatus {
    const status = this.statuses.get(agentId);
    if (!status) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return status;
  }

  /**
   * Cancel a running agent. The agent should check isCancelled()
   * periodically and stop execution when cancelled.
   */
  cancel(agentId: string): void {
    const status = this.statuses.get(agentId);
    if (!status) {
      throw new Error(`Agent ${agentId} not found`);
    }
    this.cancelFlags.set(agentId, true);
    this.statuses.set(agentId, 'failed');
    logger.agent('AgentLifecycle', `Agent cancelled: ${agentId}`);
  }

  /**
   * Check if an agent has been cancelled.
   */
  isCancelled(agentId: string): boolean {
    return this.cancelFlags.get(agentId) || false;
  }

  destroy(agentId: string): void {
    const status = this.statuses.get(agentId);
    if (!status) {
      return;
    }
    if (status === 'running') {
      this.cancelFlags.set(agentId, true);
    }
    this.statuses.delete(agentId);
    this.createdAt.delete(agentId);
    this.lastActiveAt.delete(agentId);
    this.cancelFlags.delete(agentId);
    logger.agent('AgentLifecycle', `Agent destroyed: ${agentId}`);
  }

  /**
   * Mark an agent as completed successfully.
   */
  complete(agentId: string): void {
    const status = this.statuses.get(agentId);
    if (!status) {
      throw new Error(`Agent ${agentId} not found`);
    }
    this.statuses.set(agentId, 'completed');
    logger.agent('AgentLifecycle', `Agent completed: ${agentId}`);
  }

  /**
   * Mark an agent as failed due to an error.
   */
  fail(agentId: string): void {
    const status = this.statuses.get(agentId);
    if (!status) {
      throw new Error(`Agent ${agentId} not found`);
    }
    this.statuses.set(agentId, 'failed');
    logger.agent('AgentLifecycle', `Agent failed: ${agentId}`);
  }

  /**
   * Get all agent IDs and their statuses.
   */
  listAll(): { agentId: string; status: AgentStatus; createdAt: number; lastActiveAt: number }[] {
    const result: { agentId: string; status: AgentStatus; createdAt: number; lastActiveAt: number }[] = [];
    for (const [agentId, status] of this.statuses.entries()) {
      result.push({
        agentId,
        status,
        createdAt: this.createdAt.get(agentId) || 0,
        lastActiveAt: this.lastActiveAt.get(agentId) || 0,
      });
    }
    return result;
  }

  /**
   * Get agents filtered by status.
   */
  getByStatus(status: AgentStatus): string[] {
    const result: string[] = [];
    for (const [agentId, s] of this.statuses.entries()) {
      if (s === status) {
        result.push(agentId);
      }
    }
    return result;
  }

  /**
   * Get the age of an agent in milliseconds since creation.
   */
  getAge(agentId: string): number {
    const created = this.createdAt.get(agentId);
    if (!created) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return Date.now() - created;
  }

  /**
   * Get time since last activation in milliseconds.
   */
  getTimeSinceLastActive(agentId: string): number {
    const lastActive = this.lastActiveAt.get(agentId);
    if (!lastActive) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return Date.now() - lastActive;
  }
}