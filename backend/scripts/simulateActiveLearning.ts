import fs from 'fs';
import path from 'path';
import os from 'os';
import { InformationService } from '../src/core/information';
import { StorageService } from '../src/core/storage';
import { ModelConfigService } from '../src/core/llm/modelConfig';
import { LLMService } from '../src/core/llm';
import { initDatabase, closeDatabase } from '../src/infrastructure/database';
import { LearningService } from '../src/core/learning';

async function simulateActiveLearning() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-simulation-'));
  
  process.env.BRIAN_DATA_DIR = tempDir;
  process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
  process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
  process.env.BRIAN_LOG_LEVEL = 'info';
  process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
  process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
  process.env.BRIAN_CONFIG_FILE_PATH = path.join(tempDir, 'model-config.json');

  console.log('='.repeat(80));
  console.log('Active Learning Simulation');
  console.log('='.repeat(80));

  initDatabase();
  const storage = new StorageService();
  const config = new ModelConfigService();
  const llm = new LLMService(config);
  const info = new InformationService(storage, llm);
  const learning = new LearningService(info, llm, storage);

  console.log('\n--- Step 1: Default Driver Weights ---');
  const defaultWeights = learning.getDriverWeights();
  console.log('Initial weights:', JSON.stringify(defaultWeights, null, 2));
  console.log('Total:', defaultWeights.graphConnectivity + defaultWeights.activationDriven + 
    defaultWeights.recentInput + defaultWeights.hotTopic);

  console.log('\n--- Step 2: Store Test Memories ---');
  const testMessages = [
    { content: 'React is a frontend library developed by Meta', tags: ['frontend', 'framework'] },
    { content: 'TypeScript adds type safety to JavaScript', tags: ['frontend', 'language'] },
    { content: 'React and TypeScript are often used together', tags: ['frontend', 'framework', 'language'] },
    { content: 'Docker containers can run applications in isolated environments', tags: ['devops', 'containers'] },
    { content: 'Kubernetes orchestrates containerized applications', tags: ['devops', 'containers'] },
    { content: 'Node.js is a JavaScript runtime for backend development', tags: ['backend', 'runtime'] },
    { content: 'Express is a web framework for Node.js', tags: ['backend', 'framework'] },
    { content: 'LLM fine-tuning improves model performance on specific tasks', tags: ['ai', 'llm'] },
    { content: 'RAG combines retrieval with LLM for better answers', tags: ['ai', 'rag'] },
    { content: 'AI agents can automate complex workflows', tags: ['ai', 'agents'] },
  ];

  for (let i = 0; i < testMessages.length; i++) {
    await info.storeEpisodic(testMessages[i].content, 'user');
    console.log(`  [${i + 1}] ${testMessages[i].content.substring(0, 50)}...`);
  }

  console.log('\n--- Step 3: Perform Initial Active Learning ---');
  const learningService = learning as any;
  await learningService.performActiveLearning();

  const queue = learning.getQueue();
  console.log(`\nGenerated ${queue.length} learning items:`);
  queue.slice(0, 10).forEach((item, index) => {
    console.log(`  ${index + 1}. [${item.knowledgeItem.source}] P=${item.priority} ${item.knowledgeItem.content}`);
  });

  console.log('\n--- Step 4: Simulate User Feedback (Hit/Miss) ---');
  console.log('Simulating 10 feedback cycles...');
  
  const hitPatterns = [
    { driver: 'graphConnectivity', hits: 7, misses: 3 },
    { driver: 'activationDriven', hits: 5, misses: 5 },
    { driver: 'recentInput', hits: 8, misses: 2 },
    { driver: 'hotTopic', hits: 3, misses: 7 },
  ];

  for (const pattern of hitPatterns) {
    for (let i = 0; i < pattern.hits; i++) {
      learning.recordHit(pattern.driver as any);
    }
    for (let i = 0; i < pattern.misses; i++) {
      learning.recordMiss(pattern.driver as any);
    }
    console.log(`  ${pattern.driver}: ${pattern.hits}/${pattern.hits + pattern.misses} hits`);
  }

  console.log('\n--- Step 5: Weights After Adjustment ---');
  const adjustedWeights = learning.getDriverWeights();
  console.log('Adjusted weights:', JSON.stringify(adjustedWeights, null, 2));
  console.log('Total:', adjustedWeights.graphConnectivity + adjustedWeights.activationDriven + 
    adjustedWeights.recentInput + adjustedWeights.hotTopic);

  console.log('\n--- Step 6: Hit Rates ---');
  const hitRates = learning.getDriverHitRates();
  for (const [driver, rate] of Object.entries(hitRates)) {
    const percentage = rate.total > 0 ? ((rate.hits / rate.total) * 100).toFixed(1) : 'N/A';
    console.log(`  ${driver}: ${rate.hits}/${rate.total} (${percentage}%)`);
  }

  console.log('\n--- Step 7: Perform Active Learning with Adjusted Weights ---');
  await learningService.performActiveLearning();

  const updatedQueue = learning.getQueue();
  console.log(`\nGenerated ${updatedQueue.length} learning items (total):`);
  updatedQueue.slice(0, 10).forEach((item, index) => {
    console.log(`  ${index + 1}. [${item.knowledgeItem.source}] P=${item.priority} ${item.knowledgeItem.content}`);
  });

  console.log('\n--- Step 8: User Customized Weights ---');
  const customWeights = learning.setDriverWeights({ 
    graphConnectivity: 40, 
    activationDriven: 25, 
    recentInput: 20, 
    hotTopic: 15 
  });
  console.log('Custom weights:', JSON.stringify(customWeights, null, 2));

  console.log('\n--- Step 9: Simulate More Feedback with Custom Weights ---');
  for (let i = 0; i < 5; i++) {
    learning.recordHit('hotTopic');
    learning.recordMiss('activationDriven');
  }
  console.log('  hotTopic: 5/5 hits');
  console.log('  activationDriven: 0/5 hits');

  console.log('\n--- Step 10: Weights After Dynamic Adjustment (Custom Base) ---');
  const finalWeights = learning.getDriverWeights();
  console.log('Final weights:', JSON.stringify(finalWeights, null, 2));
  console.log('Total:', finalWeights.graphConnectivity + finalWeights.activationDriven + 
    finalWeights.recentInput + finalWeights.hotTopic);

  console.log('\n--- Step 11: Final Active Learning ---');
  await learningService.performActiveLearning();

  const finalQueue = learning.getQueue();
  console.log(`\nFinal learning items (top 10):`);
  const sourceStats: Record<string, number> = {};
  finalQueue.slice(0, 10).forEach((item, index) => {
    sourceStats[item.knowledgeItem.source] = (sourceStats[item.knowledgeItem.source] || 0) + 1;
    console.log(`  ${index + 1}. [${item.knowledgeItem.source}] P=${item.priority} ${item.knowledgeItem.content}`);
  });

  console.log('\n--- Summary ---');
  console.log('Source distribution in top 10 items:', JSON.stringify(sourceStats, null, 2));
  console.log('\nWeight evolution:');
  console.log('  Initial: graph=30, activation=30, recent=30, hot=10');
  console.log('  After feedback: graph=' + adjustedWeights.graphConnectivity + 
    ', activation=' + adjustedWeights.activationDriven + 
    ', recent=' + adjustedWeights.recentInput + 
    ', hot=' + adjustedWeights.hotTopic);
  console.log('  Custom: graph=' + customWeights.graphConnectivity + 
    ', activation=' + customWeights.activationDriven + 
    ', recent=' + customWeights.recentInput + 
    ', hot=' + customWeights.hotTopic);
  console.log('  Final: graph=' + finalWeights.graphConnectivity + 
    ', activation=' + finalWeights.activationDriven + 
    ', recent=' + finalWeights.recentInput + 
    ', hot=' + finalWeights.hotTopic);

  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('\n' + '='.repeat(80));
  console.log('Simulation completed!');
  console.log('='.repeat(80));
}

simulateActiveLearning().catch(console.error);
