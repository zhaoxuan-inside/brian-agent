import TinyGraphDB from 'tiny-graph-db';
import * as path from 'path';

const dbPath = process.env.BRIAN_GRAPH_DB_PATH || './data/graph';
const filePath = `${dbPath}.json`;

console.log(`Loading graph database from: ${filePath}`);

const db = new TinyGraphDB(filePath);
const allNodes = db.getAllNodes();

console.log(`Total nodes in database: ${allNodes.length}`);

let fixedCount = 0;
let skippedCount = 0;

for (const node of allNodes) {
  try {
    const contentStr = node.name || (node.metadata?._content || '');
    if (!contentStr) {
      skippedCount++;
      continue;
    }

    const content = JSON.parse(contentStr);
    
    if (content.id === 'TEMP_ID') {
      console.log(`Found TEMP_ID node: dbId=${node.id}, name=${content.name || 'N/A'}`);
      
      content.id = node.id;
      
      node.name = JSON.stringify(content);
      db.updateNode(node.id, { metadata: node.metadata });
      
      fixedCount++;
      console.log(`Fixed: ${content.name || 'N/A'} -> id=${node.id}`);
    } else {
      skippedCount++;
    }
  } catch (err) {
    console.warn(`Skipping node ${node.id}: ${(err as Error).message}`);
    skippedCount++;
  }
}

db.flushToDisk();

console.log(`\nFix completed:`);
console.log(`- Fixed: ${fixedCount} nodes`);
console.log(`- Skipped: ${skippedCount} nodes`);
console.log(`\nDatabase saved to: ${filePath}`);