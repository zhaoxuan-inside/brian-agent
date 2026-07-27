/**
 * @fileoverview MQProvider 表结构初始化。
 *
 * 创建 queue_message、mq_config 两张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 *
 * 表结构依据 `MQProvider-PRD.md` 第 4 节。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { QUEUE_MESSAGE_TABLE, MQ_CONFIG_TABLE } from '../domain/types';

/**
 * MQProvider 表结构初始化器。
 *
 * 在 MQAccess 初始化时调用，确保所有表存在。
 */
export class MQSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  /**
   * 创建所有 MQProvider 表（IF NOT EXISTS 语义，可安全重复调用）。
   */
  init(): void {
    // queue_message 表（消息队列表）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${QUEUE_MESSAGE_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "queue"        TEXT    NOT NULL,
        "payload"      TEXT    NOT NULL,
        "priority"     INTEGER NOT NULL DEFAULT 5,
        "status"       TEXT    NOT NULL,
        "retry_count"  INTEGER NOT NULL DEFAULT 0,
        "max_retries"  INTEGER NOT NULL DEFAULT 3,
        "processed_at" INTEGER
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_created" ON "${QUEUE_MESSAGE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_updated" ON "${QUEUE_MESSAGE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_queue" ON "${QUEUE_MESSAGE_TABLE}" ("queue")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${QUEUE_MESSAGE_TABLE}_status" ON "${QUEUE_MESSAGE_TABLE}" ("status")`,
    );

    // mq_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MQ_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
