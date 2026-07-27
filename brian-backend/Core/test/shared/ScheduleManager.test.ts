import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleManager } from '../../shared/ScheduleManager';

describe('ScheduleManager', () => {
  let manager: ScheduleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ScheduleManager();
  });

  afterEach(() => {
    manager.cancelAll();
    vi.useRealTimers();
  });

  describe('schedule', () => {
    it('should schedule a task for a key', () => {
      const task = vi.fn();
      manager.schedule('key1', task, 1000);
      expect(manager.has('key1')).toBe(true);
      expect(manager.keys()).toEqual(['key1']);
    });

    it('should replace existing schedule for same key', () => {
      const task1 = vi.fn();
      const task2 = vi.fn();
      manager.schedule('key1', task1, 1000);
      manager.schedule('key1', task2, 1000);
      expect(manager.has('key1')).toBe(true);
      expect(manager.keys().length).toBe(1);
    });

    it('should execute task on interval', () => {
      const task = vi.fn();
      manager.schedule('key1', task, 1000);
      expect(task).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(task).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(task).toHaveBeenCalledTimes(2);
    });

    it('should pass key to task', () => {
      const task = vi.fn();
      manager.schedule('key1', task, 1000);
      vi.advanceTimersByTime(1000);
      expect(task).toHaveBeenCalledWith('key1');
    });

    it('should not crash when task throws', () => {
      const task = vi.fn().mockRejectedValue(new Error('boom'));
      expect(() => {
        manager.schedule('key1', task, 1000);
        vi.advanceTimersByTime(1000);
      }).not.toThrow();
    });

    it('should support multiple different keys', () => {
      const task1 = vi.fn();
      const task2 = vi.fn();
      manager.schedule('key1', task1, 1000);
      manager.schedule('key2', task2, 2000);
      expect(manager.keys().length).toBe(2);
      vi.advanceTimersByTime(1000);
      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(task1).toHaveBeenCalledTimes(2);
      expect(task2).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('should cancel a scheduled task', () => {
      const task = vi.fn();
      manager.schedule('key1', task, 1000);
      expect(manager.has('key1')).toBe(true);
      manager.cancel('key1');
      expect(manager.has('key1')).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(task).not.toHaveBeenCalled();
    });

    it('should not throw when cancelling non-existent key', () => {
      expect(() => manager.cancel('nonexistent')).not.toThrow();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all scheduled tasks', () => {
      const task1 = vi.fn();
      const task2 = vi.fn();
      manager.schedule('key1', task1, 1000);
      manager.schedule('key2', task2, 1000);
      manager.cancelAll();
      expect(manager.keys().length).toBe(0);
      vi.advanceTimersByTime(2000);
      expect(task1).not.toHaveBeenCalled();
      expect(task2).not.toHaveBeenCalled();
    });
  });

  describe('has', () => {
    it('should return false for unscheduled key', () => {
      expect(manager.has('nonexistent')).toBe(false);
    });

    it('should return true for scheduled key', () => {
      manager.schedule('key1', vi.fn(), 1000);
      expect(manager.has('key1')).toBe(true);
    });
  });

  describe('keys', () => {
    it('should return empty array when no tasks scheduled', () => {
      expect(manager.keys()).toEqual([]);
    });

    it('should return all scheduled keys', () => {
      manager.schedule('a', vi.fn(), 1000);
      manager.schedule('b', vi.fn(), 1000);
      expect(manager.keys()).toEqual(['a', 'b']);
    });
  });
});
