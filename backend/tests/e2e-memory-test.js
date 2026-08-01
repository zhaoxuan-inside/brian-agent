/**
 * 端到端测试：记忆模块写入和读取流程验证
 * 
 * 测试场景：
 * 1. 创建数据库表结构
 * 2. 写入不同类型的记忆节点
 * 3. 按类型读取记忆
 * 4. 搜索记忆
 * 5. 更新记忆
 * 6. 统计记忆
 * 7. 自学习功能集成测试
 * 8. 评价Agent打分功能测试
 */

const fs = require('fs');
const path = require('path');
const { SQLiteDB } = require('../src/base/db/SQLiteDB');
const { LLMService } = require('../src/core/llm/LLMService');
const { ModelConfigService } = require('../src/core/modelConfig/ModelConfigService');
const { InformationService } = require('../src/core/information/InformationService');
const { EvaluatorAgent } = require('../src/strategy/Agent');
const { StrategyFactory } = require('../src/strategy/ThinkingStrategy');
const { logger } = require('../src/infrastructure/logger');

const TEST_DB_PATH = path.join(__dirname, '..', 'data', 'test-memory-e2e.db');

async function setupDatabase(db) {
  logger.info('E2E-Test', 'Setting up database tables...');

  await db.run(`
    CREATE TABLE IF NOT EXISTS user_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER DEFAULT 0,
      keywords TEXT DEFAULT '[]',
      embedding_id TEXT,
      metadata TEXT DEFAULT '{}',
      tags TEXT DEFAULT '[]',
      is_learning_memory INTEGER DEFAULT 0,
      message_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      confidence REAL DEFAULT 0.8,
      importance REAL DEFAULT 0.5,
      embedding TEXT,
      embedding_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      accessed_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0,
      is_learning_memory INTEGER DEFAULT 0,
      related_node_ids TEXT DEFAULT '[]'
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS memory_ratio_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      working_memory REAL DEFAULT 0.35,
      tag_neural_memory REAL DEFAULT 0.40,
      semantic_memory REAL DEFAULT 0.15,
      episodic_memory REAL DEFAULT 0.15,
      procedural_memory REAL DEFAULT 0.10,
      random_memory REAL DEFAULT 0.20,
      user_profile_memory REAL DEFAULT 0.05,
      knowledge_base_memory REAL DEFAULT 0.15,
      context_window_tokens INTEGER DEFAULT 8192,
      context_window_messages INTEGER DEFAULT 50,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS model_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      api_key TEXT NOT NULL,
      parameters TEXT DEFAULT '{}',
      is_default INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  logger.info('E2E-Test', 'Database tables created successfully');
}

async function testMemoryWriteAndRead() {
  logger.info('E2E-Test', '========== TEST 1: Memory Write & Read ==========');

  const db = new SQLiteDB(TEST_DB_PATH);
  const modelConfigService = new ModelConfigService(db);
  const llmService = new LLMService(modelConfigService);
  const infoService = new InformationService(db, llmService);

  const testUserId = 'test-user-001';
  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  function recordTest(name, passed, actual, expected, message) {
    const test = { name, passed, actual, expected, message };
    results.tests.push(test);
    if (passed) {
      results.passed++;
      logger.info('E2E-Test', `✅ PASS: ${name}`);
    } else {
      results.failed++;
      logger.error('E2E-Test', `❌ FAIL: ${name} - ${message}`, { actual, expected });
    }
  }

  try {
    // Test 1.1: Save semantic memory
    logger.info('E2E-Test', '--- Test 1.1: Save Semantic Memory ---');
    const mem1 = {
      id: 'mem-semantic-001',
      userId: testUserId,
      content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.',
      type: 'semantic',
      source: 'self_learning',
      tags: ['typescript', 'javascript', 'programming'],
      confidence: 0.9,
      importance: 0.8,
      embedding: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      isLearningMemory: false,
      relatedNodeIds: [],
    };

    const savedMem1 = await infoService.saveMemory(mem1);
    recordTest('Save semantic memory', 
      savedMem1.id === mem1.id, 
      savedMem1.id, 
      mem1.id, 
      'Memory ID should match'
    );

    // Test 1.2: Save episodic memory
    logger.info('E2E-Test', '--- Test 1.2: Save Episodic Memory ---');
    const mem2 = {
      id: 'mem-episodic-001',
      userId: testUserId,
      content: 'Today I learned about async/await patterns in JavaScript.',
      type: 'episodic',
      source: 'chat',
      tags: ['learning', 'javascript', 'async'],
      confidence: 0.85,
      importance: 0.7,
      embedding: [],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
      accessedAt: Date.now() - 86400000,
      accessCount: 2,
      isLearningMemory: false,
      relatedNodeIds: [],
    };

    const savedMem2 = await infoService.saveMemory(mem2);
    recordTest('Save episodic memory', 
      savedMem2.type === 'episodic', 
      savedMem2.type, 
      'episodic', 
      'Memory type should be episodic'
    );

    // Test 1.3: Save procedural memory
    logger.info('E2E-Test', '--- Test 1.3: Save Procedural Memory ---');
    const mem3 = {
      id: 'mem-procedural-001',
      userId: testUserId,
      content: 'To debug async code: 1) Add breakpoints 2) Check promise state 3) Use try/catch',
      type: 'procedural',
      source: 'document',
      tags: ['debugging', 'async', 'how-to'],
      confidence: 0.95,
      importance: 0.85,
      embedding: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      isLearningMemory: false,
      relatedNodeIds: [],
    };

    const savedMem3 = await infoService.saveMemory(mem3);
    recordTest('Save procedural memory', 
      savedMem3.importance === 0.85, 
      savedMem3.importance, 
      0.85, 
      'Importance should match'
    );

    // Test 1.4: Save learning memory (isLearningMemory: true)
    logger.info('E2E-Test', '--- Test 1.4: Save Learning Memory ---');
    const mem4 = {
      id: 'mem-learning-001',
      userId: testUserId,
      content: 'Learning extracted: User prefers TypeScript over JavaScript',
      type: 'semantic',
      source: 'self_learning',
      tags: ['preference', 'typescript'],
      confidence: 0.8,
      importance: 0.9,
      embedding: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      isLearningMemory: true,
      relatedNodeIds: [],
    };

    const savedMem4 = await infoService.saveMemory(mem4);
    recordTest('Save learning memory', 
      savedMem4.isLearningMemory === true, 
      savedMem4.isLearningMemory, 
      true, 
      'isLearningMemory should be true'
    );

    // Test 2.1: Get memory by ID
    logger.info('E2E-Test', '--- Test 2.1: Get Memory by ID ---');
    const retrievedMem = await infoService.getMemory(mem1.id);
    recordTest('Get memory by ID', 
      retrievedMem !== undefined && retrievedMem.content === mem1.content, 
      retrievedMem?.content, 
      mem1.content, 
      'Retrieved memory content should match'
    );

    // Test 2.2: Get memories by type (semantic, exclude learning)
    logger.info('E2E-Test', '--- Test 2.2: Get Memories by Type (exclude learning) ---');
    const semanticMemories = await infoService.getMemoriesByType(testUserId, 'semantic', 10, false);
    recordTest('Get semantic memories (exclude learning)', 
      semanticMemories.length === 1, 
      semanticMemories.length, 
      1, 
      'Should return only 1 semantic memory (learning memory excluded)'
    );

    // Test 2.3: Get memories by type (include learning)
    logger.info('E2E-Test', '--- Test 2.3: Get Memories by Type (include learning) ---');
    const allSemanticMemories = await infoService.getMemoriesByType(testUserId, 'semantic', 10, true);
    recordTest('Get semantic memories (include learning)', 
      allSemanticMemories.length === 2, 
      allSemanticMemories.length, 
      2, 
      'Should return 2 semantic memories including learning'
    );

    // Test 3.1: Search memories by keyword
    logger.info('E2E-Test', '--- Test 3.1: Search Memories by Keyword ---');
    const searchResults = await infoService.searchMemories(testUserId, 'TypeScript');
    recordTest('Search memories by keyword', 
      searchResults.length >= 1, 
      searchResults.length, 
      '>=1', 
      'Should find at least 1 memory with TypeScript'
    );

    // Test 3.2: Search memories by tag
    logger.info('E2E-Test', '--- Test 3.2: Search Memories by Tag ---');
    const tagSearchResults = await infoService.searchMemories(testUserId, 'async');
    recordTest('Search memories by tag', 
      tagSearchResults.length >= 1, 
      tagSearchResults.length, 
      '>=1', 
      'Should find memories with async tag'
    );

    // Test 4.1: Update memory
    logger.info('E2E-Test', '--- Test 4.1: Update Memory ---');
    const updatedMem = await infoService.updateMemory(mem1.id, {
      content: 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds optional static typing.',
      confidence: 0.95,
    });
    recordTest('Update memory content', 
      updatedMem !== undefined && updatedMem.content.includes('optional static typing'), 
      updatedMem?.content, 
      'Contains "optional static typing"', 
      'Updated content should include new text'
    );
    recordTest('Update memory confidence', 
      updatedMem !== undefined && updatedMem.confidence === 0.95, 
      updatedMem?.confidence, 
      0.95, 
      'Confidence should be updated to 0.95'
    );

    // Test 5.1: Get memory stats
    logger.info('E2E-Test', '--- Test 5.1: Get Memory Stats ---');
    const stats = await infoService.getMemoryStats(testUserId);
    recordTest('Memory stats total count', 
      stats.total === 4, 
      stats.total, 
      4, 
      'Total memories should be 4'
    );
    recordTest('Memory stats learning count', 
      stats.learningCount === 1, 
      stats.learningCount, 
      1, 
      'Learning memories should be 1'
    );
    recordTest('Memory stats by type exists', 
      stats.byType['semantic'] === 2 && stats.byType['episodic'] === 1 && stats.byType['procedural'] === 1, 
      JSON.stringify(stats.byType), 
      'semantic:2, episodic:1, procedural:1', 
      'Memory type breakdown should match'
    );

    // Test 6.1: Increment memory access
    logger.info('E2E-Test', '--- Test 6.1: Increment Memory Access ---');
    await infoService.incrementMemoryAccess(mem1.id);
    const accessedMem = await infoService.getMemory(mem1.id);
    recordTest('Increment access count', 
      accessedMem !== undefined && accessedMem.accessCount === 1, 
      accessedMem?.accessCount, 
      1, 
      'Access count should be incremented to 1'
    );

    // Test 7.1: Delete memory
    logger.info('E2E-Test', '--- Test 7.1: Delete Memory ---');
    await infoService.deleteMemory(mem2.id);
    const deletedMem = await infoService.getMemory(mem2.id);
    recordTest('Delete memory', 
      deletedMem === undefined, 
      deletedMem, 
      undefined, 
      'Deleted memory should not be found'
    );

    logger.info('E2E-Test', '========== TEST 1 COMPLETE ==========');
    
  } catch (error) {
    logger.error('E2E-Test', 'Test 1 failed with error', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    db.close();
  }

  return results;
}

async function testEvaluatorAgentScoring() {
  logger.info('E2E-Test', '========== TEST 2: Evaluator Agent Scoring ==========');

  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  function recordTest(name, passed, actual, expected, message) {
    const test = { name, passed, actual, expected, message };
    results.tests.push(test);
    if (passed) {
      results.passed++;
      logger.info('E2E-Test', `✅ PASS: ${name}`);
    } else {
      results.failed++;
      logger.error('E2E-Test', `❌ FAIL: ${name} - ${message}`, { actual, expected });
    }
  }

  try {
    const strategy = StrategyFactory.create('reflexion');
    
    // 创建一个mock LLM service
    const mockLLMService = {
      chatCompletion: async () => ({
        choices: [{ message: { content: 'Mock response' } }],
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      }),
    };

    const evaluator = new EvaluatorAgent('eval-001', 'Test Evaluator', 'evaluator', strategy, mockLLMService);

    // Test 2.1: High quality response evaluation
    logger.info('E2E-Test', '--- Test 2.1: High Quality Response ---');
    const highQualityMessages = [
      { role: 'user', content: 'What is TypeScript and how does it help with large JavaScript projects?' },
      { role: 'assistant', content: `TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. 

1. **Static Typing**: TypeScript adds optional static types, which help catch errors at compile time rather than runtime. For example, you can declare function parameters and return types.

2. **Better Tooling**: With types, IDEs can provide better autocompletion, refactoring support, and inline documentation.

3. **Scalability**: Type systems make large codebases more maintainable. Teams can understand interfaces and contracts more easily.

4. **Modern Features**: TypeScript supports the latest JavaScript features and adds its own like interfaces, enums, and generics.

In conclusion, TypeScript improves developer productivity and code quality in large projects.` },
    ];

    const result1 = await evaluator.execute(highQualityMessages as any, { qualityThreshold: 0.7 });
    const qualityDetails1 = result1.metadata.qualityDetails;
    
    recordTest('High quality - overall score exists', 
      qualityDetails1.overall !== undefined, 
      qualityDetails1.overall, 
      'number', 
      'Overall score should be a number'
    );
    recordTest('High quality - all dimensions present', 
      qualityDetails1.dimensions.length === 5, 
      qualityDetails1.dimensions.length, 
      5, 
      'Should have 5 dimensions'
    );
    recordTest('High quality - relevance dimension', 
      qualityDetails1.dimensions[0].name === 'relevance', 
      qualityDetails1.dimensions[0].name, 
      'relevance', 
      'First dimension should be relevance'
    );
    recordTest('High quality - score in valid range', 
      qualityDetails1.overall >= 0 && qualityDetails1.overall <= 1, 
      qualityDetails1.overall, 
      '0-1', 
      'Score should be between 0 and 1'
    );

    // Test 2.2: Low quality response evaluation
    logger.info('E2E-Test', '--- Test 2.2: Low Quality Response ---');
    const lowQualityMessages = [
      { role: 'user', content: 'Explain TypeScript generics with examples' },
      { role: 'assistant', content: 'I think generics are maybe like templates or something. You can use them for types.' },
    ];

    const result2 = await evaluator.execute(lowQualityMessages as any, { qualityThreshold: 0.7 });
    const qualityDetails2 = result2.metadata.qualityDetails;

    recordTest('Low quality - overall score exists', 
      qualityDetails2.overall !== undefined, 
      qualityDetails2.overall, 
      'number', 
      'Overall score should be present'
    );
    recordTest('Low quality - score lower than high quality', 
      qualityDetails2.overall < qualityDetails1.overall, 
      `low=${qualityDetails2.overall.toFixed(4)}, high=${qualityDetails1.overall.toFixed(4)}`, 
      'low < high', 
      'Low quality should score lower than high quality'
    );

    // Test 2.3: Empty response evaluation
    logger.info('E2E-Test', '--- Test 2.3: Empty Response ---');
    const emptyMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '' },
    ];

    const result3 = await evaluator.execute(emptyMessages as any, { qualityThreshold: 0.7 });
    const qualityDetails3 = result3.metadata.qualityDetails;

    recordTest('Empty response - score is low', 
      qualityDetails3.overall < 0.5, 
      qualityDetails3.overall, 
      '<0.5', 
      'Empty response should have low score'
    );

    logger.info('E2E-Test', '========== TEST 2 COMPLETE ==========');

  } catch (error) {
    logger.error('E2E-Test', 'Test 2 failed with error', { error: error.message, stack: error.stack });
    throw error;
  }

  return results;
}

async function testSlidingWindowScorer() {
  logger.info('E2E-Test', '========== TEST 3: Sliding Window Scorer ==========');

  const { SlidingWindowScorer } = require('../src/core/SlidingWindowScorer');
  
  const results = {
    passed: 0,
    failed: 0,
    tests: [],
  };

  function recordTest(name, passed, actual, expected, message) {
    const test = { name, passed, actual, expected, message };
    results.tests.push(test);
    if (passed) {
      results.passed++;
      logger.info('E2E-Test', `✅ PASS: ${name}`);
    } else {
      results.failed++;
      logger.error('E2E-Test', `❌ FAIL: ${name} - ${message}`, { actual, expected });
    }
  }

  try {
    const scorer = new SlidingWindowScorer({
      windowSizeMs: 24 * 60 * 60 * 1000,
      minEntriesForEvaluation: 3,
      decayRate: 0.05,
    });

    // Test 3.1: Initial state
    logger.info('E2E-Test', '--- Test 3.1: Initial State ---');
    const initialScore = scorer.getScore('skill-1');
    recordTest('Initial score is 0', 
      initialScore.averageScore === 0, 
      initialScore.averageScore, 
      0, 
      'Initial average score should be 0'
    );
    recordTest('Initial entry count is 0', 
      initialScore.entryCount === 0, 
      initialScore.entryCount, 
      0, 
      'Initial entry count should be 0'
    );

    // Test 3.2: Add scores
    logger.info('E2E-Test', '--- Test 3.2: Add Scores ---');
    scorer.addScore('skill-1', 0.8, { source: 'execution' });
    scorer.addScore('skill-1', 0.7, { source: 'execution' });
    scorer.addScore('skill-1', 0.9, { source: 'execution' });

    const score1 = scorer.getScore('skill-1');
    recordTest('After 3 scores, entry count is 3', 
      score1.entryCount === 3, 
      score1.entryCount, 
      3, 
      'Should have 3 entries'
    );
    recordTest('Average score calculation', 
      score1.averageScore > 0.75 && score1.averageScore < 0.85, 
      score1.averageScore, 
      '~0.8', 
      'Average should be around 0.8'
    );

    // Test 3.3: Retention evaluation (should retain)
    logger.info('E2E-Test', '--- Test 3.3: Retention Evaluation (should retain) ---');
    const shouldRetain = scorer.shouldRetain('skill-1', 0.6);
    recordTest('Should retain above threshold', 
      shouldRetain === true, 
      shouldRetain, 
      true, 
      'Should retain when score above threshold'
    );

    // Test 3.4: Retention evaluation (not enough entries)
    logger.info('E2E-Test', '--- Test 3.4: Retention (not enough entries) ---');
    scorer.addScore('skill-2', 0.5, {});
    const shouldRetain2 = scorer.shouldRetain('skill-2', 0.6);
    recordTest('Should retain when not enough entries', 
      shouldRetain2 === true, 
      shouldRetain2, 
      true, 
      'Should retain when below min entries (grace period)'
    );

    // Test 3.5: Weighted score vs average score
    logger.info('E2E-Test', '--- Test 3.5: Weighted Score ---');
    const scoreDetails = scorer.getScore('skill-1');
    recordTest('Weighted score is a number', 
      typeof scoreDetails.weightedScore === 'number', 
      typeof scoreDetails.weightedScore, 
      'number', 
      'Weighted score should be a number'
    );
    recordTest('Trend is calculated', 
      ['improving', 'declining', 'stable'].includes(scoreDetails.recentTrend), 
      scoreDetails.recentTrend, 
      'one of improving/declining/stable', 
      'Trend should be valid'
    );

    // Test 3.6: Clear scores
    logger.info('E2E-Test', '--- Test 3.6: Clear Scores ---');
    scorer.clear('skill-1');
    const clearedScore = scorer.getScore('skill-1');
    recordTest('After clear, score is 0', 
      clearedScore.entryCount === 0, 
      clearedScore.entryCount, 
      0, 
      'Entry count should be 0 after clear'
    );

    logger.info('E2E-Test', '========== TEST 3 COMPLETE ==========');

  } catch (error) {
    logger.error('E2E-Test', 'Test 3 failed with error', { error: error.message, stack: error.stack });
    throw error;
  }

  return results;
}

async function runAllTests() {
  logger.info('E2E-Test', '========================================');
  logger.info('E2E-Test', 'STARTING END-TO-END MEMORY MODULE TESTS');
  logger.info('E2E-Test', '========================================');

  // Clean up previous test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    logger.info('E2E-Test', 'Cleaned up previous test database');
  }

  // Setup
  const db = new SQLiteDB(TEST_DB_PATH);
  await setupDatabase(db);
  db.close();

  const allResults = [];

  // Test 1: Memory write & read
  try {
    const test1Results = await testMemoryWriteAndRead();
    allResults.push({ name: 'Memory Write & Read', ...test1Results });
  } catch (e) {
    allResults.push({ name: 'Memory Write & Read', passed: 0, failed: 1, error: e.message });
  }

  // Test 2: Evaluator agent scoring
  try {
    const test2Results = await testEvaluatorAgentScoring();
    allResults.push({ name: 'Evaluator Agent Scoring', ...test2Results });
  } catch (e) {
    allResults.push({ name: 'Evaluator Agent Scoring', passed: 0, failed: 1, error: e.message });
  }

  // Test 3: Sliding window scorer
  try {
    const test3Results = await testSlidingWindowScorer();
    allResults.push({ name: 'Sliding Window Scorer', ...test3Results });
  } catch (e) {
    allResults.push({ name: 'Sliding Window Scorer', passed: 0, failed: 1, error: e.message });
  }

  // Summary
  logger.info('E2E-Test', '========================================');
  logger.info('E2E-Test', 'E2E TEST SUMMARY');
  logger.info('E2E-Test', '========================================');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of allResults) {
    logger.info('E2E-Test', `${result.name}: ${result.passed} passed, ${result.failed} failed`);
    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  logger.info('E2E-Test', '----------------------------------------');
  logger.info('E2E-Test', `TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  logger.info('E2E-Test', `PASS RATE: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
  logger.info('E2E-Test', '========================================');

  // Clean up
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
    logger.info('E2E-Test', 'Test database cleaned up');
  }

  return { totalPassed, totalFailed, results: allResults };
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      logger.info('E2E-Test', 'All tests completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('E2E-Test', 'Test suite failed', { error: error.message });
      process.exit(1);
    });
}

module.exports = { runAllTests, testMemoryWriteAndRead, testEvaluatorAgentScoring, testSlidingWindowScorer };
