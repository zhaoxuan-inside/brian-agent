import { Input, Context, Output } from '../../shared/base';
import type {
  Condition,
  DataObject,
  Operation,
  QueryParam,
} from '../../shared/query';
import { VisualScope } from '../../shared/query';

export class DBContext extends Context {}

export class InsertDBInput extends Input {
  
  table!: string;
  
  data!: DataObject[];
}

export class InsertDBOutput extends Output {
  
  affected_rows = 0;
}

export class DeleteDBInput extends Input {
  
  table!: string;
  
  conditions?: Condition[];
}

export class DeleteDBOutput extends Output {
  
  affected_rows = 0;
}

export class UpdateDBInput extends Input {
  
  table!: string;
  
  data!: DataObject[];
  
  conditions?: Condition[];
}

export class UpdateDBOutput extends Output {
  
  affected_rows = 0;
}

export class SelectDBInput extends Input {
  
  query_param!: QueryParam;
}

export class SelectDBOutput extends Output {
  
  rows: Array<Record<string, unknown>> = [];
  
  total = 0;
}

export class SelectOneDBInput extends Input {
  
  query_param!: QueryParam;
}

export class SelectOneDBOutput extends Output {
  
  row: Record<string, unknown> | null = null;
}

export class CountDBInput extends Input {
  
  table!: string;
  
  conditions?: Condition[];
}

export class CountDBOutput extends Output {
  
  count = 0;
}

export class TransactionDBInput extends Input {
  
  operations!: Operation[];
}

export class TransactionDBOutput extends Output {}

export class VisualizedDBInput extends Input {
  
  scope!: VisualScope | string;
}

export class VisualizedDBOutput extends Output {
  
  data: Record<string, unknown> = {};
}

export class EnableDBInput extends Input {
  
  enable!: boolean;
}

export class EnableDBOutput extends Output {}

export class CloseDBInput extends Input {}

export class CloseDBOutput extends Output {}

export const RELATIONDB_CONFIG_TABLE = 'relationdb_config_record';
