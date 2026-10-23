export interface CrmSyncOpts {
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete" | "status_change";
  payload?: Record<string, unknown>;
}

export interface CrmSyncResult {
  sync_status: "synced" | "failed" | "skipped" | "queued";
  result: Record<string, unknown>;
}
