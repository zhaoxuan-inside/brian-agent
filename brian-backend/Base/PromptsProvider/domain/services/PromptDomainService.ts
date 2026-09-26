import { stripEmptyConditionalBlocks } from '../../../PromptCatalog/catalog';

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, unknown>,
): string {
  let rendered = stripEmptyConditionalBlocks(template, variables);
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*\\}\\}`, 'g');
    rendered = rendered.replace(pattern, () => String(value));
  }
  return rendered;
}

