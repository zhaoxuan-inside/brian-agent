declare module 'levelgraph' {
  interface Triple {
    subject: string;
    predicate: string;
    object: string;
  }
  
  interface LevelGraphDB {
    put(triple: Triple | Triple[], callback: (err: Error | null) => void): void;
    del(triple: Triple | Triple[], callback: (err: Error | null) => void): void;
    search(pattern: Partial<Triple>, callback: (err: Error | null, results: Triple[]) => void): void;
    close(callback: () => void): void;
  }
  
  function levelgraph(db: any): LevelGraphDB;
  export = levelgraph;
}