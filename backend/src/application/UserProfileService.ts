import { z } from 'zod';
import { DBWrapper } from '../base/DBWrapper';
import { logger } from '../infrastructure/logger';

export const UserProfileSchema = z.object({
  userId: z.string(),
  name: z.string().optional(),
  avatar: z.string().optional(),
  preferences: z.record(z.string(), z.any()).default({}),
  tags: z.array(z.string()).default([]),
  interests: z.array(z.object({
    topic: z.string(),
    score: z.number().default(1),
  })).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export class UserProfileService {
  private profiles: Map<string, UserProfile> = new Map();

  constructor(private db?: DBWrapper) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const cached = this.profiles.get(userId);
    if (cached) {
      logger.info('UserProfileService', `[getProfile] userId=${userId} (cache hit)`);
      return cached;
    }

    logger.info('UserProfileService', `[getProfile] userId=${userId} (cache miss, loading from DB)`);
    if (this.db) {
      try {
        const row = await this.db.get<any>(
          'SELECT * FROM user_profiles WHERE user_id = ?',
          [userId]
        );
        if (row) {
          const profile = this.mapRowToProfile(row);
          this.profiles.set(userId, profile);
          return profile;
        }
      } catch {
        logger.warn('UserProfileService', `[getProfile] DB query failed for userId=${userId}, creating new`);
      }
    }

    const newProfile: UserProfile = {
      userId,
      preferences: {},
      tags: [],
      interests: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    logger.info('UserProfileService', `[getProfile] created new profile for userId=${userId}`);
    this.profiles.set(userId, newProfile);
    await this.persistProfile(newProfile);
    return newProfile;
  }

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    logger.info('UserProfileService', `[updateProfile] userId=${userId} keys=${Object.keys(updates).join(',')}`);
    const profile = await this.getProfile(userId);

    if (updates.preferences) {
      profile.preferences = { ...profile.preferences, ...updates.preferences };
    }
    if (updates.tags !== undefined) profile.tags = updates.tags;
    if (updates.interests !== undefined) profile.interests = updates.interests;
    if (updates.name !== undefined) profile.name = updates.name;
    if (updates.avatar !== undefined) profile.avatar = updates.avatar;

    profile.updatedAt = Date.now();
    this.profiles.set(userId, profile);
    await this.persistProfile(profile);
    return profile;
  }

  async analyzeFromMessage(userId: string, userMessage: string, assistantMessage: string): Promise<void> {
    logger.info('UserProfileService', `[analyzeFromMessage] userId=${userId} msgLen=${userMessage.length}`);
    const profile = await this.getProfile(userId);

    const keywords = this.extractKeywords(userMessage);
    for (const keyword of keywords) {
      const existingInterest = profile.interests.find(i => i.topic.toLowerCase() === keyword.toLowerCase());
      if (existingInterest) {
        existingInterest.score += 0.5;
      } else {
        profile.interests.push({ topic: keyword, score: 1 });
      }
    }
    logger.info('UserProfileService', `[analyzeFromMessage] extracted ${keywords.length} keywords`);

    profile.updatedAt = Date.now();
    this.profiles.set(userId, profile);
    await this.persistProfile(profile);
  }

  async addTag(userId: string, tag: string): Promise<UserProfile> {
    logger.info('UserProfileService', `[addTag] userId=${userId} tag=${tag}`);
    const profile = await this.getProfile(userId);
    if (!profile.tags.includes(tag)) {
      profile.tags.push(tag);
      profile.updatedAt = Date.now();
      this.profiles.set(userId, profile);
      await this.persistProfile(profile);
    }
    return profile;
  }

  async removeTag(userId: string, tag: string): Promise<UserProfile> {
    logger.info('UserProfileService', `[removeTag] userId=${userId} tag=${tag}`);
    const profile = await this.getProfile(userId);
    profile.tags = profile.tags.filter(t => t !== tag);
    profile.updatedAt = Date.now();
    this.profiles.set(userId, profile);
    await this.persistProfile(profile);
    return profile;
  }

  async getInterests(userId: string): Promise<{ topic: string; score: number }[]> {
    const profile = await this.getProfile(userId);
    return profile.interests.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  private async persistProfile(profile: UserProfile): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.run(
        `INSERT OR REPLACE INTO user_profiles (user_id, name, avatar, preferences, tags, interests, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          profile.userId,
          profile.name || null,
          profile.avatar || null,
          JSON.stringify(profile.preferences),
          JSON.stringify(profile.tags),
          JSON.stringify(profile.interests),
          profile.createdAt,
          profile.updatedAt,
        ]
      );
    } catch {
      // non-critical: silently ignore persistence failures
    }
  }

  private mapRowToProfile(row: any): UserProfile {
    return {
      userId: row.user_id,
      name: row.name,
      avatar: row.avatar,
      preferences: this.parseJSON(row.preferences, {}),
      tags: this.parseJSON(row.tags, []),
      interests: this.parseJSON(row.interests, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseJSON(value: any, fallback: any): any {
    if (!value) return fallback;
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return fallback;
    }
  }

  private extractKeywords(text: string): string[] {
    const commonWords = new Set(['the', 'and', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
      'into', 'over', 'after', 'and', 'but', 'or', 'as', 'if', 'when', 'than',
      'because', 'while', 'although', 'though', 'that', 'which', 'who', 'whom',
      'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'what',
      'how', 'why', 'a', 'an', 'some', 'any', 'each', 'every', 'all', 'both',
      'few', 'more', 'most', 'other', 'another', 'much', 'many', 'such', 'no',
      'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just']);

    const words = text.toLowerCase().match(/[a-zA-Z]+/g) || [];
    return words.filter(w => !commonWords.has(w)).slice(0, 10);
  }
}