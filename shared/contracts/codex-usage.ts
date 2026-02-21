export interface CodexUsageModelSummary {
  allowed: boolean;
  fiveHourResetAt: string;
  fiveHourUsedPercent: number;
  model: string;
  modelLabel?: string;
  planType?: string;
  weeklyResetAt: string;
  weeklyUsedPercent: number | null;
}

export interface CodexUsageResultUsage {
  accountId?: string;
  allowed: boolean;
  fiveHourResetAt: string;
  fiveHourUsedPercent: number;
  planType?: string;
  weeklyResetAt: string;
  weeklyUsedPercent: number | null;
  models?: CodexUsageModelSummary[];
}

export interface CodexUsageApiResult {
  authFile: string;
  endpoint?: string;
  error?: string;
  ok: boolean;
  refreshedToken?: boolean;
  usage?: CodexUsageResultUsage;
}

export interface CodexUsageApiResponse {
  results: CodexUsageApiResult[];
}
