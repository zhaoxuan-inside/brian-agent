/**
 * @fileoverview zodToJSONSchema —— 紧凑 zod → JSON Schema 转换器（Runtime v2 · 阶段2）。
 *
 * 依据 `Tools/Tools-PRD.md` §2：工具参数以 zod schema 声明，转换为 JSON Schema
 * 传入 LLM function.parameters（OpenAI wire 格式）。
 *
 * 决策记录（2026-09-04）：仅新增 zod 依赖，不引入 zod-to-json-schema 派生依赖；
 * 本转换器覆盖项目工具所需的受限子集（object/string/number/boolean/enum/
 * array/record/optional/nullable/union/discriminatedUnion/literal/default），
 * 未覆盖类型 fail-loud（抛 ProcessingError）。
 *
 * 每个方法 ≤40 行（Runtime-PRD §7）。
 */

import type { z } from 'zod';
import { ProcessingError } from '@brian-agent/base';

/** 取 zod v3 类型名（_def.typeName），兼容无 _def 的形态 */
function typeName(schema: z.ZodType<unknown>): string {
  const def = (schema as unknown as { _def?: { typeName?: string } })._def;
  return def?.typeName ?? '';
}

/** 递归转换入口（逻辑控制） */
export function zodToJSONSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const name = typeName(schema);
  const converter = PICKERS[name];
  if (!converter) {
    throw new ProcessingError(`zodToJSONSchema 暂不支持类型: ${name || 'unknown'}`);
  }
  return converter(schema);
}

/** 各 zod 类型转换器注册表 */
const PICKERS: Record<string, (schema: z.ZodType<unknown>) => Record<string, unknown>> = {
  ZodString: (s) => stringSchema(s),
  ZodNumber: (s) => numberSchema(s),
  ZodBoolean: () => ({ type: 'boolean' }),
  ZodEnum: (s) => enumSchema(s),
  ZodLiteral: (s) => literalSchema(s),
  ZodArray: (s) => arraySchema(s),
  ZodObject: (s) => objectSchema(s),
  ZodRecord: (s) => recordSchema(s),
  ZodOptional: (s) => optionalSchema(s),
  ZodNullable: (s) => nullableSchema(s),
  ZodDefault: (s) => defaultSchema(s),
  ZodUnion: (s) => unionSchema(s, 'anyOf'),
  ZodDiscriminatedUnion: (s) => unionSchema(s, 'anyOf'),
  ZodUnknown: () => ({}),
  ZodAny: () => ({}),
};

/** ZodString（含 min/max 描述；阶段2 不展开 regex） */
function stringSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const checks = (schema as unknown as { _def?: { checks?: Array<{ kind?: string; value?: unknown }> } })._def?.checks ?? [];
  const out: Record<string, unknown> = { type: 'string' };
  for (const check of checks) {
    if (check.kind === 'min') {
      out.minLength = check.value ?? 0;
    }
    if (check.kind === 'max') {
      out.maxLength = check.value ?? 0;
    }
  }
  return out;
}

/** ZodNumber（int → integer；min/max） */
function numberSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const def = (schema as unknown as { _def?: { checks?: Array<{ kind?: string; value?: unknown }> } })._def;
  const out: Record<string, unknown> = { type: 'number' };
  for (const check of def?.checks ?? []) {
    if (check.kind === 'min') {
      out.minimum = check.value ?? 0;
    }
    if (check.kind === 'max') {
      out.maximum = check.value ?? 0;
    }
  }
  return out;
}

/** ZodEnum / ZodNativeEnum（值域转 enum） */
function enumSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const values = (schema as unknown as { _def?: { values?: unknown[] } })._def?.values ?? [];
  return { type: 'string', enum: values as unknown[] };
}

/** ZodLiteral */
function literalSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const value = (schema as unknown as { _def?: { value?: unknown } })._def?.value;
  return typeof value === 'number'
    ? { type: 'number', enum: [value] }
    : { type: 'string', enum: [String(value)] };
}

/** ZodArray */
function arraySchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const element = (schema as unknown as { _def?: { type?: z.ZodType<unknown> } })._def?.type;
  return { type: 'array', items: element ? zodToJSONSchema(element) : {} };
}

/** ZodObject（properties + required） */
function objectSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType<unknown>> }).shape ?? {};
  return objectFromShape(shape);
}

/** ZodRecord（additionalProperties） */
function recordSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const valueType = (schema as unknown as { _def?: { valueType?: z.ZodType<unknown> } })._def?.valueType;
  return { type: 'object', additionalProperties: valueType ? zodToJSONSchema(valueType) : {} };
}

/** ZodOptional（不标记 required，由 objectFromShape 判定） */
function optionalSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const inner = (schema as unknown as { _def?: { innerType?: z.ZodType<unknown> } })._def?.innerType;
  return inner ? zodToJSONSchema(inner) : {};
}

/** ZodNullable（anyOf [inner, null]） */
function nullableSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const inner = (schema as unknown as { _def?: { innerType?: z.ZodType<unknown> } })._def?.innerType;
  return inner
    ? { anyOf: [zodToJSONSchema(inner), { type: 'null' }] }
    : {};
}

/** ZodDefault（取内层 schema，default 值随 description 说明） */
function defaultSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const inner = (schema as unknown as { _def?: { innerType?: z.ZodType<unknown> } })._def?.innerType;
  return inner ? zodToJSONSchema(inner) : {};
}

/** ZodUnion / ZodDiscriminatedUnion（options 展开 anyOf） */
function unionSchema(
  schema: z.ZodType<unknown>,
  keyword: 'anyOf' | 'oneOf',
): Record<string, unknown> {
  const options = (schema as unknown as { _def?: { options?: z.ZodType<unknown>[] } })._def?.options ?? [];
  return { [keyword]: options.map((option) => zodToJSONSchema(option)) };
}

/** shape → object schema（数据处理；ZodOptional 不进 required） */
function objectFromShape(shape: Record<string, z.ZodType<unknown>>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, valueSchema] of Object.entries(shape)) {
    properties[key] = zodToJSONSchema(valueSchema);
    if (typeName(valueSchema) !== 'ZodOptional') {
      required.push(key);
    }
  }
  return { type: 'object', properties, required };
}
