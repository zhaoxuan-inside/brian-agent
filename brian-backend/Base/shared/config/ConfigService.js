"use strict";
/**
 * @fileoverview 配置服务。
 *
 * 各 Provider 的配置项（含启用/禁用状态、各类默认值）统一存储于关系数据库配置表
 * （如 graphdb_config、llm_config 等），采用键值对结构。
 *
 * ConfigService 封装配置的读取、写入与默认值初始化逻辑，
 * 依赖 {@link IConfigStorage} 接口（由 RelationDBProvider 的 access 层实现），
 * 避免 shared 层对具体 Provider 产生循环依赖。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigService = exports.ValueType = void 0;
/**
 * 配置值类型枚举。
 */
var ValueType;
(function (ValueType) {
    ValueType["INT"] = "INT";
    ValueType["DOUBLE"] = "DOUBLE";
    ValueType["BOOLEAN"] = "BOOLEAN";
    ValueType["STRING"] = "STRING";
})(ValueType || (exports.ValueType = ValueType = {}));
/**
 * 配置服务。
 *
 * 各 Provider 在 infrastructure 层创建 ConfigService 实例，
 * 传入 IConfigStorage 实现与配置表名，即可统一管理配置项。
 *
 * 用法示例：
 * ```typescript
 * const config = new ConfigService(configStorage, 'graphdb_config');
 * await config.initDefaults([{ config_key: 'enabled', config_value: 'true', value_type: 'BOOLEAN' }]);
 * const enabled = await config.getBoolean('enabled', true);
 * ```
 */
class ConfigService {
    storage;
    table;
    /**
     * @param storage 配置存储实现
     * @param table 配置表名（如 'graphdb_config'）
     */
    constructor(storage, table) {
        this.storage = storage;
        this.table = table;
    }
    /**
     * 读取配置原始字符串值。
     *
     * @param key 配置键
     * @param defaultValue 默认值（配置不存在时返回）
     * @returns 配置值字符串或默认值
     */
    async getString(key, defaultValue) {
        const row = await this.storage.selectOne(this.table, [
            { field: 'config_key', operator: 'EQ', value: key },
        ]);
        if (!row) {
            return defaultValue;
        }
        return String(row.config_value);
    }
    /**
     * 读取 INT 类型配置。
     */
    async getInt(key, defaultValue) {
        const raw = await this.getString(key);
        if (raw === undefined) {
            return defaultValue;
        }
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }
    /**
     * 读取 DOUBLE 类型配置。
     */
    async getDouble(key, defaultValue) {
        const raw = await this.getString(key);
        if (raw === undefined) {
            return defaultValue;
        }
        const parsed = parseFloat(raw);
        return Number.isNaN(parsed) ? defaultValue : parsed;
    }
    /**
     * 读取 BOOLEAN 类型配置。
     */
    async getBoolean(key, defaultValue) {
        const raw = await this.getString(key);
        if (raw === undefined) {
            return defaultValue;
        }
        return raw === 'true' || raw === '1';
    }
    /**
     * 写入配置（upsert 语义：存在则更新，不存在则新增）。
     *
     * @param key 配置键
     * @param value 配置值
     * @param valueType 值类型
     * @param description 说明
     */
    async set(key, value, valueType, description) {
        const strValue = String(value);
        const exists = await this.storage.count(this.table, [
            { field: 'config_key', operator: 'EQ', value: key },
        ]);
        const now = Date.now();
        if (exists > 0) {
            await this.storage.update(this.table, [
                { field: 'config_value', value: strValue },
                { field: 'value_type', value: valueType },
                ...(description !== undefined
                    ? [{ field: 'description', value: description }]
                    : []),
                { field: 'updated', value: now },
            ], [{ field: 'config_key', operator: 'EQ', value: key }]);
        }
        else {
            await this.storage.insert(this.table, [
                { field: 'config_key', value: key },
                { field: 'config_value', value: strValue },
                { field: 'value_type', value: valueType },
                ...(description !== undefined
                    ? [{ field: 'description', value: description }]
                    : []),
                { field: 'updated', value: now },
            ]);
        }
    }
    /**
     * 初始化默认配置项。
     *
     * 仅在配置项不存在时写入，不覆盖已有值。
     *
     * @param defaults 默认配置项列表
     */
    async initDefaults(defaults) {
        for (const item of defaults) {
            const exists = await this.storage.count(this.table, [
                { field: 'config_key', operator: 'EQ', value: item.config_key },
            ]);
            if (exists === 0) {
                await this.storage.insert(this.table, [
                    { field: 'config_key', value: item.config_key },
                    { field: 'config_value', value: item.config_value },
                    { field: 'value_type', value: item.value_type },
                    ...(item.description !== undefined
                        ? [{ field: 'description', value: item.description }]
                        : []),
                    { field: 'updated', value: Date.now() },
                ]);
            }
        }
    }
}
exports.ConfigService = ConfigService;
//# sourceMappingURL=ConfigService.js.map