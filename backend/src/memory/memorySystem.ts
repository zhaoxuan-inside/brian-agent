import { SensoryMemory } from './sensoryMemory';
import { WorkingMemory } from './workingMemory';
import { LongTermMemory } from './longTermMemory';
import { MemoryOrganizer } from './memoryOrganizer';
import { GraphStorage } from '../storage/graphStorage';
import { VectorStorage } from '../storage/vectorStorage';

export class MemorySystem {
  sensoryMemory: SensoryMemory;
  workingMemory: WorkingMemory;
  longTermMemory: LongTermMemory;
  memoryOrganizer: MemoryOrganizer;

  constructor() {
    this.sensoryMemory = new SensoryMemory();
    this.workingMemory = new WorkingMemory(this.sensoryMemory);
    this.longTermMemory = new LongTermMemory(new GraphStorage(), new VectorStorage());
    this.memoryOrganizer = new MemoryOrganizer(new GraphStorage());
    this.startAutoOrganize();
  }

  processInput(content: string, type: 'text' | 'image' | 'audio' | 'video' = 'text'): void {
    const sensoryId = this.sensoryMemory.add({
      type,
      content,
      metadata: {},
    });

    this.workingMemory.add({
      content,
      type: 'fact',
      relevance: 1.0,
      sourceId: sensoryId,
    });

    this.consolidatePeriodically();
  }

  saveToLongTerm(content: string, tags: string[] = [], role: 'user' | 'assistant' | 'system' = 'user'): string {
    const effectiveTags = tags.length > 0 ? tags : this.generateTags(content);
    const summary = this.generateSummary(content);

    return this.longTermMemory.store({
      content,
      type: 'episodic',
      tags: effectiveTags,
      role,
      summary,
      strength: 0.7,
      decayRate: 0.05,
      salienceScore: 0.5,
      retrievalCount: 0,
    });
  }

  generateTags(content: string): string[] {
    const tags: string[] = [];
    const text = content.toLowerCase();

    const tagPatterns: [RegExp, string][] = [
      [/python|pytorch|tensorflow|django|fastapi|flask|numpy|pandas|jupyter/i, 'Python'],
      [/go(lang)?|goroutine|golang/i, 'Go'],
      [/javascript|typescript|node\.?js|react|vue|angular|npm|yarn/i, 'JavaScript/TS'],
      [/rust|cargo|actix/i, 'Rust'],
      [/java|spring|maven|gradle|jvm/i, 'Java'],
      [/c\+\+|cpp|cmake|qt|boost/i, 'C++'],
      [/kubernetes|k8s|docker|container|pod|helm/i, '容器/K8s'],
      [/微服务|microservice|服务网格|service mesh|istio/i, '微服务'],
      [/api|rest|graphql|grpc|openapi|swagger/i, 'API'],
      [/数据库|database|sql|mysql|postgresql|mongodb|redis|sqlite/i, '数据库'],
      [/ai|机器学习|深度学习|ml|llm|gpt|transformer|模型|neural/i, 'AI/ML'],
      [/搜索|查询|搜索引擎|elasticsearch|search/i, '搜索'],
      [/前端|frontend|css|html|ui|ux|界面|组件/i, '前端'],
      [/后端|backend|server|服务端|中间件/i, '后端'],
      [/部署|deploy|ci\/cd|devops|jenkins|github actions|自动化/i, 'DevOps'],
      [/安全|security|auth|认证|授权|加密|oauth|jwt/i, '安全'],
      [/测试|test|unittest|pytest|jest|e2e|单元测试/i, '测试'],
      [/性能|performance|优化|optimize|benchmark|并发/i, '性能'],
      [/架构|architecture|设计模式|design pattern|系统设计/i, '架构'],
      [/文件|file|目录|path|路径|文档|document/i, '文件操作'],
      [/linux|unix|bash|shell|terminal|命令行/i, 'Linux'],
    ];

    for (const [pattern, tag] of tagPatterns) {
      if (pattern.test(text)) {
        tags.push(tag);
      }
    }

    // Always add at least one general tag
    if (tags.length === 0) {
      if (text.length < 20) {
        tags.push('简短对话');
      } else if (/[?？]/.test(text)) {
        tags.push('问题');
      } else {
        tags.push('一般');
      }
    }

    return [...new Set(tags)];
  }

  generateSummary(content: string): string {
    // Linguistic compression: extract key sentences or truncate with intelligence
    const sentences = content.split(/[。！？\n.!?]+/).filter(s => s.trim().length > 0);

    if (sentences.length === 0) {
      return content.slice(0, 60) + (content.length > 60 ? '...' : '');
    }

    // For short content, return first sentence
    if (content.length <= 100) {
      return sentences[0].trim().slice(0, 80);
    }

    // For longer content, extract first sentence + keyword hint
    const firstSentence = sentences[0].trim();
    if (firstSentence.length >= 20) {
      return firstSentence.slice(0, 80) + (firstSentence.length > 80 ? '...' : '');
    }

    // Combine first two sentences
    const combined = sentences.slice(0, 2).map(s => s.trim()).join('；');
    return combined.slice(0, 80) + (combined.length > 80 ? '...' : '');
  }

  private consolidatePeriodically(): void {
    if (this.workingMemory.getSize() >= 1) {
      const consolidated = this.workingMemory.consolidate();
      for (const item of consolidated) {
        const tags = this.generateTags(item.content);
        this.longTermMemory.store({
          content: item.content,
          type: 'episodic',
          tags,
          role: 'user',
          summary: this.generateSummary(item.content),
          strength: item.relevance,
          decayRate: 0.05,
          salienceScore: 0.5,
          retrievalCount: 0,
        });
      }
    }
  }

  retrieve(maxResults: number = 10): unknown[] {
    const workingResults = this.workingMemory.retrieve();
    const longTermResults = this.longTermMemory.retrieve(maxResults - workingResults.length);

    return [...workingResults, ...longTermResults];
  }

  getAllMemories(): ReturnType<LongTermMemory['retrieve']> {
    return this.longTermMemory.retrieve(100);
  }

  getAllTags(): string[] {
    const allNodes = this.longTermMemory['graphStorage'].getAllNodes();
    return allNodes
      .filter((node) => node.type === 'tag')
      .map((node) => node.content);
  }

  getMemoriesByTag(tag: string): ReturnType<LongTermMemory['retrieveByTag']> {
    return this.longTermMemory.retrieveByTag(tag);
  }

  getTagGraph(): ReturnType<LongTermMemory['getTagGraph']> {
    return this.longTermMemory.getTagGraph();
  }

  startAutoOrganize(): void {
    setInterval(() => {
      this.memoryOrganizer.organize();
    }, 60 * 60 * 1000);
  }

  manualOrganize(): void {
    this.memoryOrganizer.organize();
  }
}

export const memorySystem = new MemorySystem();
