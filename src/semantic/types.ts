export interface MetricDef {
  description: string;
  formula: string;
  sources: string[];
  filters_default?: string[];
  cents_to_brl?: boolean;
  unit?: 'currency_brl' | 'count' | 'percent' | 'ratio';
}

export interface SegmentDef {
  rule: string;
  description?: string;
}

export interface SemanticConventions {
  timezone: string;
  money_storage: 'cents';
  paid_statuses: string[];
  test_orders_excluded: boolean;
}

export interface SemanticLayer {
  metrics: Record<string, MetricDef>;
  segments: Record<string, SegmentDef>;
  conventions: SemanticConventions;
}
