export function formatOutput(
  output: string,
  format: 'text' | 'json' | 'markdown' | 'stream'
): string {
  switch (format) {
    case 'text':
      return formatAsText(output);
    case 'json':
      return JSON.stringify(formatAsJSON(output), null, 2);
    case 'markdown':
      return formatAsMarkdown(output);
    case 'stream':
      return output; // Stream format is just the raw output
    default:
      return formatAsText(output);
  }
}

export function formatAsText(output: string): string {
  if (!output) return '';

  // Strip markdown formatting for plain text
  let text = output;

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    const content = match.replace(/```\w*\n?/, '').replace(/```$/, '');
    return `[CODE]\n${content}\n[/CODE]`;
  });

  // Remove bold/italic markers
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');
  text = text.replace(/_(.+?)_/g, '$1');

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove links, keep text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove headers
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

export function formatAsJSON(output: string): Record<string, unknown> {
  if (!output) return { content: '' };

  // Try to parse as JSON first
  try {
    return JSON.parse(output);
  } catch {
    // Not valid JSON, try to extract JSON block
    const jsonMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Still not valid JSON
      }
    }

    // Try to find JSON object in text
    const jsonObjMatch = output.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      try {
        return JSON.parse(jsonObjMatch[0]);
      } catch {
        // Not valid JSON
      }
    }

    // Fall back to wrapping as content
    return {
      content: output,
      lineCount: output.split('\n').length,
      charCount: output.length,
      wordCount: output.split(/\s+/).filter(w => w.length > 0).length,
    };
  }
}

export function formatAsMarkdown(output: string): string {
  if (!output) return '';

  // If already formatted as markdown, return as-is
  if (output.includes('```') || output.includes('##') || output.includes('**')) {
    return output;
  }

  // Convert plain text to basic markdown
  let markdown = output;

  // Convert URLs to links
  markdown = markdown.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '[$1]($1)'
  );

  // Convert lines that look like headers
  markdown = markdown.replace(
    /^([A-Z][A-Za-z\s]{2,60}):\s*$/gm,
    '## $1'
  );

  // Convert lines that look like sub-headers
  markdown = markdown.replace(
    /^([A-Z][a-z]+(?:\s+[a-z]+){1,5}):\s*$/gm,
    '### $1'
  );

  return markdown;
}

export function applyTemplate(output: string, template: string): string {
  if (!template) return output;

  let result = template;

  // Replace {{output}} placeholder
  result = result.replace(/\{\{output\}\}/g, output);

  // Replace {{output:json}} with formatted JSON
  result = result.replace(/\{\{output:json\}\}/g, () => {
    try {
      const parsed = JSON.parse(output);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return output;
    }
  });

  // Replace {{output:markdown}} with markdown
  result = result.replace(/\{\{output:markdown\}\}/g, () => formatAsMarkdown(output));

  // Replace {{output:text}} with plain text
  result = result.replace(/\{\{output:text\}\}/g, () => formatAsText(output));

  // Replace {{timestamp}} with current timestamp
  result = result.replace(/\{\{timestamp\}\}/g, new Date().toISOString());

  // Replace {{date}} with current date
  result = result.replace(/\{\{date\}\}/g, new Date().toISOString().slice(0, 10));

  return result;
}