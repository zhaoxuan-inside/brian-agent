import * as fs from 'fs';
import * as path from 'path';

const dbPath = process.env.BRIAN_GRAPH_DB_PATH || './data/graph';
const filePath = `${dbPath}.json`;

console.log(`Reading graph database from: ${filePath}`);

const rawData = fs.readFileSync(filePath, 'utf-8');
console.log(`File size: ${rawData.length} bytes`);

let fixedData = rawData;

// Fix double-escaped newlines
const doubleEscapeCount = (fixedData.match(/\\\\n/g) || []).length;
console.log(`Found ${doubleEscapeCount} double-escaped newlines (\\\\n)`);
if (doubleEscapeCount > 0) {
  fixedData = fixedData.replace(/\\\\n/g, '\\n');
  console.log(`Fixed: replaced ${doubleEscapeCount} occurrences`);
}

// Parse the JSON
let parsed: any;
try {
  parsed = JSON.parse(fixedData);
  console.log('JSON parsed successfully');
} catch (err) {
  console.error(`JSON parse error: ${(err as Error).message}`);
  process.exit(1);
}

// Fix TEMP_ID in node contents
let fixedTempIds = 0;
if (parsed.nodes && Array.isArray(parsed.nodes)) {
  for (const node of parsed.nodes) {
    try {
      const contentStr = node.name || '';
      if (contentStr) {
        const content = JSON.parse(contentStr);
        if (content.id === 'TEMP_ID') {
          content.id = node.id;
          node.name = JSON.stringify(content);
          fixedTempIds++;
        }
      }
    } catch {
      // Skip malformed nodes
    }
  }
}

console.log(`Fixed ${fixedTempIds} TEMP_ID nodes`);

// Write fixed data
const outputData = JSON.stringify(parsed, null, 2);
fs.writeFileSync(filePath, outputData, 'utf-8');
console.log(`\nFile saved successfully`);
console.log(`New file size: ${outputData.length} bytes`);