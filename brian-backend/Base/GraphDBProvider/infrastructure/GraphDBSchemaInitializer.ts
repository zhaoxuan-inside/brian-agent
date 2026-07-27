/**
 * @fileoverview GraphDBProvider 表结构初始化。
 *
 * 图数据表（graph_node、graph_edge、graph_activation_event、graph_edge_daily_activation）
 * 通过 GraphDBComponent.initSchema() 在原生图数据库中创建。
 * 配置表 graphdb_config 通过 RelationDBAccess.executeRaw() 在 SQLite 中创建。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { GraphDBComponent } from '../../components/GraphDB/GraphDBComponent';
import { GRAPHDB_CONFIG_TABLE } from '../domain/types';

/**
 * GraphDBProvider 表结构初始化器。
 */
export class GraphDBSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层（用于创建配置表）
   * @param graphDb GraphDB 组件实例（用于创建图数据表）
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly graphDb: GraphDBComponent,
  ) {}

  /**
   * 初始化所有表结构。
   *
   * - 图数据表：通过 GraphDBComponent.initSchema() 创建（幂等）
   * - 配置表：通过 RelationDBAccess.executeRaw() 创建（IF NOT EXISTS）
   */
  init(): void {
    // 在原生图数据库中创建节点表和关系表
    this.graphDb.initSchema();

    // 在 SQLite 中创建 graphdb_config 配置表
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${GRAPHDB_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
