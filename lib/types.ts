export type FieldType = "string" | "number" | "date" | "boolean" | "enum";

export interface FieldMapping {
  displayName: string;
  cdsField: string;
  cdsView: string;
  type: FieldType;
  enumValues?: string[];
}

export interface ReportConfig {
  fields: FieldMapping[];
  mockData: Record<string, unknown>[];
}

export interface AgentResponse {
  fields: FieldMapping[];
  reasoning?: string;
}

export interface PreviewCreateResponse {
  previewId: string;
  previewUrl: string;
  previewToken?: string;
  createdAt: string;
}
