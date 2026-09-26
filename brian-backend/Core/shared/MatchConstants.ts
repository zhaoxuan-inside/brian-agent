export enum ScoreThreshold {
  
  Default = 90,
  
  Max = 100,
  
  Min = 0,
}

export enum AgentScoreThreshold {
  Default = 70,
}

export enum MatchCache {
  
  Capacity = 500,
  
  TtlMs = 10 * 60_000,
  
  KeyTaskChars = 128,
  
  EmbedTaskChars = 256,
}

export enum VectorSimilarity {
  Default = 0.8,
}

export enum CreatedBy {
  User = 'user',
  System = 'system',
}

export enum DisbandThreshold {
  Critical = 30,
}

export enum SortDirection {
  Desc = 'desc',
}
