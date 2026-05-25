export type RpcEventType =
  | "gateway.ready"
  | "session.info"
  | "message.start"
  | "message.delta"
  | "message.complete"
  | "tool.start"
  | "tool.progress"
  | "tool.complete"
  | "status.update"
  | "approval.request"
  | "clarify.request"
  | "sudo.request"
  | "secret.request"
  | "error";

export type ApprovalChoice = "once" | "session" | "always" | "deny";

export interface ApprovalReq {
  command: string;
  description: string;
}

export interface ClarifyReq {
  question: string;
  choices: string[] | null;
  requestId: string;
}

export interface SudoReq {
  requestId: string;
}

export interface SecretReq {
  envVar: string;
  prompt: string;
  requestId: string;
}

export interface OverlayState {
  approval: ApprovalReq | null;
  clarify: ClarifyReq | null;
  sudo: SudoReq | null;
  secret: SecretReq | null;
}

export const EMPTY_OVERLAY: OverlayState = {
  approval: null,
  clarify: null,
  sudo: null,
  secret: null,
};

export type RpcFrame = {
  jsonrpc?: "2.0";
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
  method?: "event" | string;
  params?: {
    type?: RpcEventType | string;
    session_id?: string;
    payload?: any;
  };
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  status?: "streaming" | "complete" | "error" | "interrupted";
  reasoning?: string;
  createdAt: number;
};

export type SlashCompletionItem = {
  text: string;
  display?: string;
  meta?: string;
};

export type SlashCompletionResult = {
  items: SlashCompletionItem[];
  replace_from?: number;
};

export type ToolActivity = {
  id: string;
  name: string;
  status: "running" | "complete" | "error";
  preview?: string;
  result?: string;
  summary?: string;
  inlineDiff?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  rawPayload?: unknown;
};

export type SessionRuntimeState = {
  running: boolean;
  blocked: boolean;
  activity: string;
  updatedAt: number;
};

export type SessionSummary = {
  id: string;
  title: string;
  preview: string;
  started_at: number;
  message_count: number;
  source: string;
};
