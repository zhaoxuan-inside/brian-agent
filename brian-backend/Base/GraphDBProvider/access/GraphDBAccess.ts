import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { GraphDBComponent } from '../../components/GraphDB/GraphDBComponent';
import type { GraphDBComponentOptions } from '../../components/GraphDB/GraphDBComponent';
import { GraphDBSchemaInitializer } from '../infrastructure/GraphDBSchemaInitializer';
import { GraphDBService } from '../application/GraphDBService';
import {
  GraphContext,
  AddGraphNodeInput,
  AddGraphNodeOutput,
  GetGraphNodeInput,
  GetGraphNodeOutput,
  UpdateGraphNodeInput,
  UpdateGraphNodeOutput,
  DelGraphNodeInput,
  DelGraphNodeOutput,
  AddGraphEdgeInput,
  AddGraphEdgeOutput,
  GetGraphEdgeInput,
  GetGraphEdgeOutput,
  UpdateGraphEdgeInput,
  UpdateGraphEdgeOutput,
  DelGraphEdgeInput,
  DelGraphEdgeOutput,
  SelectGraphInput,
  SelectGraphOutput,
  GetGraphNeighborsInput,
  GetGraphNeighborsOutput,
  ActivateGraphEdgeInput,
  ActivateGraphEdgeOutput,
  AgeGraphEdgeInput,
  AgeGraphEdgeOutput,
  VisualizedGraphInput,
  VisualizedGraphOutput,
  EnableGraphDBInput,
  EnableGraphDBOutput,
  CloseGraphDBInput,
  CloseGraphDBOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

export class GraphDBAccess {
  private readonly service: GraphDBService;
  private readonly graphDb: GraphDBComponent;

  

  constructor(
    relationDb: RelationDBAccess,
    graphDbOptions: GraphDBComponentOptions,
    logger?: Logger,
  ) {
    
    this.graphDb = new GraphDBComponent(graphDbOptions);
    
    new GraphDBSchemaInitializer(relationDb).init();
    
    const rawService = new GraphDBService(this.graphDb, relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async addGraphNode(input: AddGraphNodeInput, output: AddGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addGraphNode(input, output, context, metrics, report);
  }

  
  async soGraphNode(input: GetGraphNodeInput, output: GetGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soGraphNode(input, output, context, metrics, report);
  }

  
  async updateGraphNode(input: UpdateGraphNodeInput, output: UpdateGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateGraphNode(input, output, context, metrics, report);
  }

  
  async delGraphNode(input: DelGraphNodeInput, output: DelGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delGraphNode(input, output, context, metrics, report);
  }

  
  async addGraphEdge(input: AddGraphEdgeInput, output: AddGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addGraphEdge(input, output, context, metrics, report);
  }

  
  async soGraphEdge(input: GetGraphEdgeInput, output: GetGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soGraphEdge(input, output, context, metrics, report);
  }

  
  async updateGraphEdge(input: UpdateGraphEdgeInput, output: UpdateGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateGraphEdge(input, output, context, metrics, report);
  }

  
  async delGraphEdge(input: DelGraphEdgeInput, output: DelGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delGraphEdge(input, output, context, metrics, report);
  }

  
  async selectGraph(input: SelectGraphInput, output: SelectGraphOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.selectGraph(input, output, context, metrics, report);
  }

  
  async soGraphNeighbors(input: GetGraphNeighborsInput, output: GetGraphNeighborsOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soGraphNeighbors(input, output, context, metrics, report);
  }

  
  async computeEdgeWeight(edgeId: string, hopDistance: number = 1): Promise<number> {
    return this.service.computeEdgeCompositeWeight(edgeId, hopDistance);
  }

  
  async activateGraphEdge(input: ActivateGraphEdgeInput, output: ActivateGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.activateGraphEdge(input, output, context, metrics, report);
  }

  
  async ageGraphEdge(input: AgeGraphEdgeInput, output: AgeGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ageGraphEdge(input, output, context, metrics, report);
  }

  
  async visualizedGraph(input: VisualizedGraphInput, output: VisualizedGraphOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.visualizedGraph(input, output, context, metrics, report);
  }

  
  async enableGraphDB(input: EnableGraphDBInput, output: EnableGraphDBOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableGraphDB(input, output, context, metrics, report);
  }

  
  async closeGraphDB(input: CloseGraphDBInput, output: CloseGraphDBOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeGraphDB(input, output, context, metrics, report);
  }
}
