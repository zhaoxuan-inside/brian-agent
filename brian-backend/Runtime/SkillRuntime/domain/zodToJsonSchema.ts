import type { z } from 'zod';
import { ProcessingError } from '@brian-agent/base';

function zodDef(schema: z.ZodType<unknown>): { typeName?: string; checks?: Array<{ kind?: string; value?: unknown }>; value?: unknown; values?: unknown[]; type?: z.ZodType<unknown>; valueType?: z.ZodType<unknown>; innerType?: z.ZodType<unknown>; options?: z.ZodType<unknown>[] } {
  return (schema as unknown as { _def?: Record<string, unknown> })._def ?? {};
}

function zodShape(schema: z.ZodType<unknown>): Record<string, z.ZodType<unknown>> {
  return (schema as unknown as { shape?: Record<string, z.ZodType<unknown>> }).shape ?? {};
}

function typeName(schema: z.ZodType<unknown>): string {
  return zodDef(schema).typeName ?? '';
}

export function zodToJSONSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const name = typeName(schema);
  const converter = PICKERS[name];
  if (!converter) {
    throw new ProcessingError(`zodToJSONSchema 暂不支持类型: ${name || 'unknown'}`);
  }
  return converter(schema);
}

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

function stringSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'string' };
  for (const check of zodDef(schema).checks ?? []) {
    if (check.kind === 'min') {
      out.minLength = check.value ?? 0;
    }
    if (check.kind === 'max') {
      out.maxLength = check.value ?? 0;
    }
  }
  return out;
}

function numberSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'number' };
  for (const check of zodDef(schema).checks ?? []) {
    if (check.kind === 'min') {
      out.minimum = check.value ?? 0;
    }
    if (check.kind === 'max') {
      out.maximum = check.value ?? 0;
    }
  }
  return out;
}

function enumSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  return { type: 'string', enum: zodDef(schema).values ?? [] };
}

function literalSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const value = zodDef(schema).value;
  return typeof value === 'number'
    ? { type: 'number', enum: [value] }
    : { type: 'string', enum: [String(value)] };
}

function arraySchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const element = zodDef(schema).type;
  return { type: 'array', items: element ? zodToJSONSchema(element) : {} };
}

function objectSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  return objectFromShape(zodShape(schema));
}

function recordSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const valueType = zodDef(schema).valueType;
  return { type: 'object', additionalProperties: valueType ? zodToJSONSchema(valueType) : {} };
}

function optionalSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const inner = zodDef(schema).innerType;
  return inner ? zodToJSONSchema(inner) : {};
}

function nullableSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const inner = zodDef(schema).innerType;
  return inner
    ? { anyOf: [zodToJSONSchema(inner), { type: 'null' }] }
    : {};
}

function defaultSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const inner = zodDef(schema).innerType;
  return inner ? zodToJSONSchema(inner) : {};
}

function unionSchema(
  schema: z.ZodType<unknown>,
  keyword: 'anyOf' | 'oneOf',
): Record<string, unknown> {
  return { [keyword]: (zodDef(schema).options ?? []).map((option) => zodToJSONSchema(option)) };
}

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
