import { randomBytes } from 'crypto';

/**
 * Generate a time-ordered UUID v7.
 * Format: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
 *   - First 48 bits: Unix timestamp in ms (hex)
 *   - Version: 7
 *   - Remaining: random
 */
export function generateUUIDv7(): string {
  const ts = Date.now().toString(16).padStart(12, '0');
  const rand = randomBytes(10).toString('hex');
  return `${ts.slice(0, 8)}-${ts.slice(8)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 19)}`;
}

export function generateId(): string {
  const timestamp = Date.now().toString(36).padStart(8, '0');
  const random = randomBytes(8).toString('hex');
  return `${timestamp}-${random}`;
}
