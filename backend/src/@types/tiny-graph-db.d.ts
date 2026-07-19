declare module 'tiny-graph-db' {
  interface Node {
    id: string;
    [key: string]: unknown;
  }

  interface Edge {
    id: string;
    source: string;
    target: string;
    [key: string]: unknown;
  }

  class TinyGraphDB {
    constructor(filePath: string);
    addNode(node: Node): void;
    getNode(id: string): Node | undefined;
    getAllNodes(): Node[];
    updateNode(id: string, updates: Partial<Node>): void;
    deleteNode(id: string): void;
    addEdge(edge: Edge): void;
    getEdge(id: string): Edge | undefined;
    getEdgesBySource(source: string): Edge[];
    getEdgesByTarget(target: string): Edge[];
    updateEdge(id: string, updates: Partial<Edge>): void;
    deleteEdge(id: string): void;
    save(): void;
    load(): void;
  }

  export default TinyGraphDB;
}