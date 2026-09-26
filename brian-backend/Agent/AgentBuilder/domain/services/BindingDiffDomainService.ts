export interface BindingDiff {
  added: string[];
  removed: string[];
}

export function computeBindingDiff(boundIds: string[], matchedIds: string[]): BindingDiff {
  return {
    added: matchedIds.filter((id) => !boundIds.includes(id)),
    removed: boundIds.filter((id) => !matchedIds.includes(id)),
  };
}
