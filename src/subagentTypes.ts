export type SubagentStatus = "queued" | "running" | "completed" | "failed" | "interrupted";

export type SubagentOutputEntry = {
  isError: boolean;
  preview: string;
  tool: string;
};

export type SubagentProgress = {
  id: string;
  goal: string;
  index: number;
  depth: number;
  parentId: string | null;
  status: SubagentStatus;
  model?: string;
  thinking: string[];
  tools: string[];
  notes: string[];
  summary?: string;
  toolCount: number;
  taskCount: number;
  durationSeconds?: number;
  startedAt?: number;
  toolsets?: string[];
  outputTail?: SubagentOutputEntry[];
  apiCalls?: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  filesRead?: string[];
  filesWritten?: string[];
};

export type SubagentAggregate = {
  activeCount: number;
  costUsd: number;
  descendantCount: number;
  filesTouched: number;
  hotness: number;
  inputTokens: number;
  maxDepthFromHere: number;
  outputTokens: number;
  totalDuration: number;
  totalTools: number;
};

export type SubagentNode = {
  item: SubagentProgress;
  children: SubagentNode[];
  aggregate: SubagentAggregate;
};

export type SubagentEventPayload = {
  api_calls?: number;
  cost_usd?: number;
  depth?: number;
  duration_seconds?: number;
  files_read?: string[];
  files_written?: string[];
  goal: string;
  input_tokens?: number;
  iteration?: number;
  model?: string;
  output_tail?: { is_error?: boolean; preview?: string; tool?: string }[];
  output_tokens?: number;
  parent_id?: string | null;
  reasoning_tokens?: number;
  status?: SubagentStatus;
  subagent_id?: string;
  summary?: string;
  task_count?: number;
  task_index: number;
  text?: string;
  tool_count?: number;
  tool_name?: string;
  tool_preview?: string;
  toolsets?: string[];
};
