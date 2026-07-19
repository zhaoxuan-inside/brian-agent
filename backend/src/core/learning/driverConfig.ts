export interface DriverWeights {
  [key: string]: number;
}

export interface DriverHitRate {
  [key: string]: { hits: number; total: number };
}

export interface LearningItem {
  content: string;
  priority: number;
  source: string;
}

export interface DriverConfig {
  name: string;
  key: string;
  defaultWeight: number;
  minWeight: number;
  maxWeight: number;
  adjustmentRange: number;
  userAdjustmentRange: number;
  description: string;
  generator?: () => Promise<LearningItem[]>;
}

export interface LearningDriverConfig {
  drivers: DriverConfig[];
}

export const DEFAULT_DRIVERS: DriverConfig[] = [
  {
    name: '图连通驱动',
    key: 'graphConnectivity',
    defaultWeight: 30,
    minWeight: 10,
    maxWeight: 40,
    adjustmentRange: 10,
    userAdjustmentRange: 5,
    description: '基于知识图谱中标签之间的连通性生成学习项，推动相关概念建立联系',
  },
  {
    name: '节点激活驱动',
    key: 'activationDriven',
    defaultWeight: 30,
    minWeight: 10,
    maxWeight: 40,
    adjustmentRange: 10,
    userAdjustmentRange: 5,
    description: '基于知识图谱中节点被激活的频率生成学习项，强化频繁访问的知识',
  },
  {
    name: '近期输入驱动',
    key: 'recentInput',
    defaultWeight: 30,
    minWeight: 10,
    maxWeight: 40,
    adjustmentRange: 10,
    userAdjustmentRange: 5,
    description: '基于用户近期输入的内容生成学习项，跟踪用户当前兴趣',
  },
  {
    name: '热点消息驱动',
    key: 'hotTopic',
    defaultWeight: 10,
    minWeight: 5,
    maxWeight: 20,
    adjustmentRange: 5,
    userAdjustmentRange: 3,
    description: '基于外部热点信息生成学习项，保持对前沿技术的关注',
  },
];

export class DriverConfiguration {
  private drivers: DriverConfig[];
  private userConfiguredWeights: DriverWeights | null = null;
  private hitRates: DriverHitRate = {};

  constructor(drivers: DriverConfig[] = DEFAULT_DRIVERS) {
    this.drivers = drivers;
    this.initializeHitRates();
  }

  private initializeHitRates(): void {
    for (const driver of this.drivers) {
      this.hitRates[driver.key] = { hits: 0, total: 0 };
    }
  }

  getDrivers(): DriverConfig[] {
    return [...this.drivers];
  }

  getDriver(key: string): DriverConfig | undefined {
    return this.drivers.find(d => d.key === key);
  }

  getDefaultWeights(): DriverWeights {
    const weights: DriverWeights = {};
    for (const driver of this.drivers) {
      weights[driver.key] = driver.defaultWeight;
    }
    return weights;
  }

  getCurrentWeights(): DriverWeights {
    if (this.userConfiguredWeights) {
      return { ...this.userConfiguredWeights };
    }
    return this.getDefaultWeights();
  }

  setWeights(weights: Partial<DriverWeights>): DriverWeights {
    const current = this.getCurrentWeights();
    const newWeights = { ...current };
    for (const [key, value] of Object.entries(weights)) {
      if (value !== undefined) {
        (newWeights as any)[key] = value;
      }
    }
    
    this.validateWeights(newWeights);
    this.normalizeWeights(newWeights);
    
    this.userConfiguredWeights = { ...newWeights };
    return { ...this.userConfiguredWeights };
  }

  resetWeights(): DriverWeights {
    this.userConfiguredWeights = null;
    return this.getDefaultWeights();
  }

  isUserConfigured(): boolean {
    return this.userConfiguredWeights !== null;
  }

  getUserConfiguredWeights(): DriverWeights | null {
    return this.userConfiguredWeights ? { ...this.userConfiguredWeights } : null;
  }

  private validateWeights(weights: DriverWeights): void {
    for (const driver of this.drivers) {
      const weight = weights[driver.key];
      if (weight !== undefined) {
        if (weight < driver.minWeight || weight > driver.maxWeight) {
          throw new Error(
            `Weight for ${driver.key} (${weight}) is out of range [${driver.minWeight}, ${driver.maxWeight}]`
          );
        }
      }
    }
  }

  normalizeWeights(weights: DriverWeights): void {
    let total = 0;
    for (const driver of this.drivers) {
      total += weights[driver.key] || driver.defaultWeight;
    }

    if (total !== 100) {
      const scale = 100 / total;
      for (const driver of this.drivers) {
        weights[driver.key] = Math.round((weights[driver.key] || driver.defaultWeight) * scale);
      }
    }
  }

  recordHit(driverKey: string): void {
    if (this.hitRates[driverKey]) {
      this.hitRates[driverKey].hits++;
      this.hitRates[driverKey].total++;
    }
  }

  recordMiss(driverKey: string): void {
    if (this.hitRates[driverKey]) {
      this.hitRates[driverKey].total++;
    }
  }

  getHitRates(): DriverHitRate {
    return { ...this.hitRates };
  }

  resetHitRates(): void {
    this.initializeHitRates();
  }

  calculateAdjustedWeights(): DriverWeights {
    const baseWeights = this.userConfiguredWeights || this.getDefaultWeights();
    const adjustmentRange = this.isUserConfigured() ? 'userAdjustmentRange' : 'adjustmentRange';
    const driverKeys = this.drivers.map(d => d.key);

    const avgHitRate = this.calculateAverageHitRate(driverKeys);
    const adjustments = this.calculateAdjustments(driverKeys, avgHitRate, adjustmentRange);
    this.normalizeAdjustments(driverKeys, adjustments);

    const newWeights = this.applyAdjustments(baseWeights, adjustments, adjustmentRange);
    this.finalizeWeights(newWeights);

    return newWeights;
  }

  private calculateAverageHitRate(driverKeys: string[]): number {
    let totalHitRate = 0;
    let validDrivers = 0;
    for (const key of driverKeys) {
      if (this.hitRates[key] && this.hitRates[key].total > 0) {
        totalHitRate += this.hitRates[key].hits / this.hitRates[key].total;
        validDrivers++;
      }
    }
    return validDrivers > 0 ? totalHitRate / validDrivers : 0.5;
  }

  private calculateAdjustments(
    driverKeys: string[],
    avgHitRate: number,
    rangeKey: 'adjustmentRange' | 'userAdjustmentRange'
  ): Record<string, number> {
    const adjustments: Record<string, number> = {};

    for (const key of driverKeys) {
      adjustments[key] = 0;
      const driver = this.getDriver(key);
      if (driver && this.hitRates[key] && this.hitRates[key].total >= 5) {
        const hitRate = this.hitRates[key].hits / this.hitRates[key].total;
        const deviation = hitRate - avgHitRate;
        adjustments[key] = Math.round(deviation * driver[rangeKey] * 2);
      }
    }

    return adjustments;
  }

  private normalizeAdjustments(driverKeys: string[], adjustments: Record<string, number>): void {
    let totalAdjustment = 0;
    for (const key of driverKeys) {
      totalAdjustment += adjustments[key];
    }

    if (totalAdjustment !== 0) {
      const perDriverAdjustment = -totalAdjustment / driverKeys.length;
      for (const key of driverKeys) {
        adjustments[key] += perDriverAdjustment;
      }
    }
  }

  private applyAdjustments(
    baseWeights: DriverWeights,
    adjustments: Record<string, number>,
    rangeKey: 'adjustmentRange' | 'userAdjustmentRange'
  ): DriverWeights {
    const newWeights: DriverWeights = { ...baseWeights };

    for (const driver of this.drivers) {
      const adjusted = newWeights[driver.key] + adjustments[driver.key];
      const adjustmentRange = driver[rangeKey];
      const min = Math.max(driver.minWeight, baseWeights[driver.key] - adjustmentRange);
      const max = Math.min(driver.maxWeight, baseWeights[driver.key] + adjustmentRange);
      newWeights[driver.key] = Math.round(Math.max(min, Math.min(max, adjusted)));
    }

    return newWeights;
  }

  private finalizeWeights(newWeights: DriverWeights): void {
    let finalTotal = 0;
    for (const driver of this.drivers) {
      finalTotal += newWeights[driver.key];
    }

    if (finalTotal !== 100) {
      const diff = 100 - finalTotal;
      const driverKeys = this.drivers.map(d => d.key);
      const maxDriver = driverKeys.reduce((a, b) => newWeights[a] > newWeights[b] ? a : b);
      newWeights[maxDriver] += diff;
    }
  }

  addDriver(config: DriverConfig): void {
    if (this.drivers.find(d => d.key === config.key)) {
      throw new Error(`Driver with key "${config.key}" already exists`);
    }
    this.drivers.push(config);
    this.hitRates[config.key] = { hits: 0, total: 0 };
    
    if (this.userConfiguredWeights) {
      this.userConfiguredWeights[config.key] = config.defaultWeight;
      this.normalizeWeights(this.userConfiguredWeights);
    }
  }

  removeDriver(key: string): void {
    const index = this.drivers.findIndex(d => d.key === key);
    if (index === -1) {
      throw new Error(`Driver with key "${key}" not found`);
    }
    this.drivers.splice(index, 1);
    delete this.hitRates[key];
  }

  getDriverStats(): Record<string, {
    name: string;
    weight: number;
    defaultWeight: number;
    minWeight: number;
    maxWeight: number;
    hitRate: string;
    hits: number;
    total: number;
    adjustmentRange: number;
  }> {
    const stats: Record<string, {
      name: string;
      weight: number;
      defaultWeight: number;
      minWeight: number;
      maxWeight: number;
      hitRate: string;
      hits: number;
      total: number;
      adjustmentRange: number;
    }> = {};

    const currentWeights = this.getCurrentWeights();

    for (const driver of this.drivers) {
      const rate = this.hitRates[driver.key];
      const hitRate = rate && rate.total > 0
        ? ((rate.hits / rate.total) * 100).toFixed(1) + '%'
        : 'N/A';

      stats[driver.key] = {
        name: driver.name,
        weight: currentWeights[driver.key],
        defaultWeight: driver.defaultWeight,
        minWeight: driver.minWeight,
        maxWeight: driver.maxWeight,
        hitRate,
        hits: rate?.hits || 0,
        total: rate?.total || 0,
        adjustmentRange: this.isUserConfigured() ? driver.userAdjustmentRange : driver.adjustmentRange,
      };
    }

    return stats;
  }
}
