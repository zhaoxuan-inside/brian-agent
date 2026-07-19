import { RequestHandler } from 'express';
import { logger } from '../infrastructure/logger';

/**
 * Generic toggle handler factory for get→update pattern.
 * Used by /skill/:id/toggle and /mcp/:id/toggle.
 *
 * @param getter    Fetch the entity by ID (returns null if not found)
 * @param updater   Update entity.enabled = !entity.enabled, return updated entity
 * @param label     Resource label for logging (e.g. "Skill", "MCP")
 * @param code      Error code prefix for structured errors
 */
export function createToggleHandler<T extends { id: string; enabled: boolean }>(
  getter: (id: string) => Promise<T | null | undefined>,
  updater: (id: string, data: { enabled: boolean }) => Promise<T | null | undefined>,
  label: string,
  code: string,
): RequestHandler {
  return async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await getter(id);
      if (!existing) {
        res.status(404).json({ error: `${label} not found`, code: 'NOT_FOUND' });
        return;
      }
      const updated = await updater(id, { enabled: !existing.enabled });
      logger.info(label, `${label} toggled: ${id} -> ${updated?.enabled ? 'enabled' : 'disabled'}`);
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code });
      }
    }
  };
}

/**
 * Direct toggle handler for services that expose a dedicated toggle() method.
 * Used by /agent/:id/toggle (agentBuilder.toggle toggles `active` not `enabled`).
 */
export function createDirectToggleHandler<T>(
  toggleFn: (id: string) => Promise<T>,
  label: string,
  code: string,
): RequestHandler {
  return async (req, res) => {
    try {
      const { id } = req.params;
      const result = await toggleFn(id);
      logger.info(label, `${label} toggled: ${id}`);
      res.json(result);
    } catch (err: any) {
      if (err.message?.includes('not found')) {
        res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
      } else {
        res.status(500).json({ error: err.message, code });
      }
    }
  };
}
