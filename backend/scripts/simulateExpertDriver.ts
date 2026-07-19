import fs from 'fs';
import path from 'path';
import os from 'os';
import { InformationService } from '../src/core/information';
import { StorageService } from '../src/core/storage';
import { ModelConfigService } from '../src/core/llm/modelConfig';
import { LLMService } from '../src/core/llm';
import { initDatabase, closeDatabase } from '../src/infrastructure/database';
import { LearningService } from '../src/core/learning';
import { DriverConfig } from '../src/core/learning/driverConfig';

async function simulateExpertDriver() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-expert-simulation-'));
  
  process.env.BRIAN_DATA_DIR = tempDir;
  process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
  process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
  process.env.BRIAN_LOG_LEVEL = 'info';
  process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
  process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
  process.env.BRIAN_CONFIG_FILE_PATH = path.join(tempDir, 'model-config.json');

  console.log('='.repeat(80));
  console.log('Expert Recommendation Driver Simulation');
  console.log('='.repeat(80));

  initDatabase();
  const storage = new StorageService();
  const config = new ModelConfigService();
  const llm = new LLMService(config);
  const info = new InformationService(storage, llm);
  const learning = new LearningService(info, llm, storage);

  console.log('\n--- Step 1: Default Drivers ---');
  const defaultDrivers = learning.getDrivers();
  console.log('Default drivers:', defaultDrivers.map(d => d.key));

  console.log('\n--- Step 2: Add Expert Recommendation Driver ---');
  const expertRecommendations = [
    { content: '系统架构设计模式：微服务与单体架构的选择', priority: 45 },
    { content: 'LLM 应用最佳实践：提示词工程与微调策略', priority: 42 },
    { content: '数据工程基础：ETL 流程与数据仓库设计', priority: 38 },
    { content: '安全编码指南：常见漏洞与防护措施', priority: 40 },
    { content: '性能优化技巧：从代码到基础设施的全链路优化', priority: 35 },
  ];

  const expertDriver: DriverConfig = {
    name: '专家推荐驱动',
    key: 'expertRecommendation',
    defaultWeight: 15,
    minWeight: 5,
    maxWeight: 25,
    adjustmentRange: 5,
    userAdjustmentRange: 3,
    description: '基于专家推荐的学习内容，引入领域专家的知识建议',
    generator: async () => {
      console.log('  Expert recommendation generator called');
      return expertRecommendations.map(item => ({
        content: item.content,
        priority: item.priority,
        source: 'expert_recommendation',
      }));
    },
  };

  learning.addDriver(expertDriver);
  console.log('Added expert recommendation driver:', expertDriver.key);

  console.log('\n--- Step 3: Verify Driver Added ---');
  const allDrivers = learning.getDrivers();
  console.log('All drivers:', allDrivers.map(d => d.key));
  console.log('Driver count:', allDrivers.length);

  console.log('\n--- Step 4: Check Weights After Adding Driver ---');
  const weights = learning.getDriverWeights();
  console.log('Current weights:', JSON.stringify(weights, null, 2));
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  console.log('Total weight:', totalWeight);

  console.log('\n--- Step 5: Store Test Memories ---');
  const testMessages = [
    { content: 'React is a frontend library developed by Meta', tags: ['frontend', 'framework'] },
    { content: 'TypeScript adds type safety to JavaScript', tags: ['frontend', 'language'] },
    { content: 'LLM fine-tuning improves model performance', tags: ['ai', 'llm'] },
    { content: 'RAG combines retrieval with LLM', tags: ['ai', 'rag'] },
    { content: 'Docker containers run applications in isolation', tags: ['devops', 'containers'] },
  ];

  for (let i = 0; i < testMessages.length; i++) {
    await info.storeEpisodic(testMessages[i].content, 'user');
    console.log(`  [${i + 1}] ${testMessages[i].content.substring(0, 50)}...`);
  }

  console.log('\n--- Step 6: Perform Active Learning with Expert Driver ---');
  const learningService = learning as any;
  await learningService.performActiveLearning();

  const queue = learning.getQueue();
  console.log(`\nGenerated ${queue.length} learning items:`);
  
  const sourceDistribution: Record<string, number> = {};
  queue.slice(0, 10).forEach((item, index) => {
    sourceDistribution[item.knowledgeItem.source] = 
      (sourceDistribution[item.knowledgeItem.source] || 0) + 1;
    console.log(`  ${index + 1}. [${item.knowledgeItem.source}] P=${item.priority} ${item.knowledgeItem.content}`);
  });

  console.log('\n--- Step 7: Source Distribution ---');
  console.log('Source distribution in queue:', JSON.stringify(sourceDistribution, null, 2));

  console.log('\n--- Step 8: Driver Stats ---');
  const stats = learning.getDriverStats();
  for (const [key, stat] of Object.entries(stats)) {
    console.log(`  ${key}: weight=${stat.weight}, default=${stat.defaultWeight}, hitRate=${stat.hitRate}`);
  }

  console.log('\n--- Step 9: Simulate Feedback for Expert Driver ---');
  console.log('Recording hits for expertRecommendation driver...');
  for (let i = 0; i < 5; i++) {
    learning.recordHit('expertRecommendation');
  }
  
  const adjustedWeights = learning.getDriverWeights();
  console.log('\nAdjusted weights after hits:', JSON.stringify(adjustedWeights, null, 2));
  console.log('Expert recommendation weight:', adjustedWeights.expertRecommendation);

  console.log('\n--- Step 10: Remove Expert Driver ---');
  learning.removeDriver('expertRecommendation');
  
  const remainingDrivers = learning.getDrivers();
  console.log('Remaining drivers:', remainingDrivers.map(d => d.key));
  console.log('Driver count:', remainingDrivers.length);

  const finalWeights = learning.getDriverWeights();
  console.log('Final weights:', JSON.stringify(finalWeights, null, 2));

  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('\n' + '='.repeat(80));
  console.log('Expert Driver Simulation completed!');
  console.log('='.repeat(80));
}

simulateExpertDriver().catch(console.error);
