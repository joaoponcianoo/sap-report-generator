import type { FieldMapping } from "@/lib/types";
import {
  type PreviewControllerConfig,
  normalizePreviewControllerConfig,
} from "@/lib/preview/controllerConfig";

// Payload recebido da UI para construir um preview renderizavel.
export interface CreatePreviewRequest {
  name?: string;
  fields?: FieldMapping[];
  filterFields?: FieldMapping[];
  mockData?: Record<string, unknown>[];
  viewXml?: string;
  controller?: unknown;
  controllerJs?: string;
  modelData?: Record<string, unknown>;
}

interface PreviewColumnMeta {
  key: string;
  label: string;
  type: FieldMapping["type"];
}

interface GeneratedPreviewPayload {
  name: string;
  viewXml: string;
  controller: PreviewControllerConfig;
  modelData: Record<string, unknown>;
}

export type BuildPreviewPayloadResult =
  | { ok: true; payload: GeneratedPreviewPayload }
  | { ok: false; error: string };

const DEFAULT_FALLBACK_FIELDS: FieldMapping[] = [
  {
    displayName: "Field 1",
    cdsField: "Field1",
    cdsView: "I_AdhocPreview",
    type: "string",
  },
  {
    displayName: "Field 2",
    cdsField: "Field2",
    cdsView: "I_AdhocPreview",
    type: "string",
  },
  {
    displayName: "Field 3",
    cdsField: "Field3",
    cdsView: "I_AdhocPreview",
    type: "string",
  },
];

function sanitizeBindingKey(raw: string): string {
  // Converte nomes livres para chaves seguras de binding UI5/OData.
  const cleaned = String(raw ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  if (!cleaned) {
    return "field";
  }

  if (/^[0-9]/.test(cleaned)) {
    return `field_${cleaned}`;
  }

  return cleaned;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function inferTypeFromValue(value: unknown): FieldMapping["type"] {
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return "date";
    }
    return "string";
  }
  return "string";
}

function isValidFieldType(value: unknown): value is FieldMapping["type"] {
  return (
    value === "string" ||
    value === "number" ||
    value === "date" ||
    value === "boolean"
  );
}

function resolveFields(
  fieldsInput: CreatePreviewRequest["fields"],
  mockData: CreatePreviewRequest["mockData"],
): FieldMapping[] {
  // 1) Prioriza campos vindos da API de mapping.
  const fieldsFromInput = Array.isArray(fieldsInput)
    ? fieldsInput
        .filter(
          (field) =>
            isRecord(field) &&
            typeof field.displayName === "string" &&
            field.displayName.trim().length > 0,
        )
        .map((field) => {
          const displayName = String(field.displayName).trim();
          const cdsFieldRaw = String(field.cdsField ?? "").trim();
          const cdsViewRaw = String(field.cdsView ?? "").trim();
          const type = isValidFieldType(field.type) ? field.type : "string";

          return {
            displayName,
            cdsField: cdsFieldRaw || sanitizeBindingKey(displayName),
            cdsView: cdsViewRaw || "I_AdhocPreview",
            type,
          } satisfies FieldMapping;
        })
    : [];

  if (fieldsFromInput.length > 0) {
    return fieldsFromInput;
  }

  // 2) Se nao houver mapping, tenta inferir pelo primeiro registro mock.
  const firstRow = Array.isArray(mockData) ? mockData.find(isRecord) : null;
  if (firstRow) {
    const inferredFields = Object.keys(firstRow)
      .filter((key) => key.trim().length > 0)
      .map((key) => {
        const sampleValue = firstRow[key];
        return {
          displayName: key,
          cdsField: sanitizeBindingKey(key),
          cdsView: "I_AdhocPreview",
          type: inferTypeFromValue(sampleValue),
        } satisfies FieldMapping;
      });

    if (inferredFields.length > 0) {
      return inferredFields;
    }
  }

  // 3) Fallback final para manter preview funcional.
  return DEFAULT_FALLBACK_FIELDS;
}

function fallbackValue(field: FieldMapping, index: number): unknown {
  switch (field.type) {
    case "number":
      return (index + 1) * 10;
    case "date":
      return new Date(Date.now() - index * 86400000).toISOString().slice(0, 10);
    case "boolean":
      return index % 2 === 0;
    default:
      return `${field.displayName} ${index + 1}`;
  }
}

function findValueInRow(
  sourceRow: Record<string, unknown>,
  field: FieldMapping,
): unknown {
  // Busca tolerante por nome de exibicao, nome tecnico e variacao normalizada.
  const bindingKey = sanitizeBindingKey(field.cdsField || field.displayName);
  const directValue =
    sourceRow[field.displayName] ??
    sourceRow[field.cdsField] ??
    sourceRow[bindingKey];

  if (directValue !== undefined && directValue !== null) {
    return directValue;
  }

  const targets = new Set([
    normalizeText(field.displayName),
    normalizeText(field.cdsField),
    normalizeText(bindingKey),
  ]);

  for (const [key, value] of Object.entries(sourceRow)) {
    if (
      targets.has(normalizeText(key)) &&
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeRows(
  fields: FieldMapping[],
  mockData: Record<string, unknown>[] | undefined,
) {
  // Sem mockData: gera linhas sinteticas para o preview nao ficar vazio.
  if (!mockData || mockData.length === 0) {
    return Array.from({ length: 8 }, (_, index) => {
      const row: Record<string, unknown> = {};
      for (const field of fields) {
        const key = sanitizeBindingKey(field.cdsField || field.displayName);
        row[key] = fallbackValue(field, index);
      }
      return row;
    });
  }

  return mockData.map((sourceRow, rowIndex) => {
    const row: Record<string, unknown> = {};
    for (const field of fields) {
      const key = sanitizeBindingKey(field.cdsField || field.displayName);
      const value = findValueInRow(sourceRow, field);
      row[key] = value ?? fallbackValue(field, rowIndex);
    }
    return row;
  });
}

function buildDefaultViewXml(fields: FieldMapping[]) {
  // XML minimo para fallback quando nao houver view XML custom.
  const columns = fields
    .map(
      (field) =>
        `            <Column><header><Label text="${escapeXml(field.displayName)}" /></header></Column>`,
    )
    .join("\n");

  const cells = fields
    .map((field) => {
      const binding = sanitizeBindingKey(field.cdsField || field.displayName);
      return `                <Text text="{${binding}}" />`;
    })
    .join("\n");

  return `<mvc:View
  xmlns:mvc="sap.ui.core.mvc"
  xmlns="sap.m">
  <Page title="AI Report Preview">
    <content>
      <Table items="{/items}" width="auto" sticky="ColumnHeaders">
        <columns>
${columns}
        </columns>
        <items>
          <ColumnListItem>
            <cells>
${cells}
            </cells>
          </ColumnListItem>
        </items>
      </Table>
    </content>
  </Page>
</mvc:View>`;
}

function buildPreviewColumns(fields: FieldMapping[]): PreviewColumnMeta[] {
  // Metadado usado pelo runtime para SmartTable e OData mock.
  return fields.map((field) => ({
    key: sanitizeBindingKey(field.cdsField || field.displayName),
    label: field.displayName,
    type: field.type,
  }));
}

function mergeUniqueFields(...groups: FieldMapping[][]): FieldMapping[] {
  // Garante uniao de campos de tabela + filtros sem duplicidade.
  const map = new Map<string, FieldMapping>();

  groups.flat().forEach((field) => {
    const key = sanitizeBindingKey(field.cdsField || field.displayName);
    if (!map.has(key)) {
      map.set(key, field);
    }
  });

  return Array.from(map.values());
}

export function buildPreviewPayload(
  body: CreatePreviewRequest,
): BuildPreviewPayloadResult {
  const hasDirectUi5Content = Boolean(body.viewXml);
  const hasFieldConfig = Array.isArray(body.fields) && body.fields.length > 0;

  if (!hasDirectUi5Content && !hasFieldConfig) {
    return {
      ok: false,
      error:
        "Provide either (viewXml) or a non-empty fields array",
    };
  }

  if (typeof body.controllerJs === "string" && body.controllerJs.trim().length > 0) {
    // Bloqueio explicito: nada de JS arbitrario vindo do payload.
    return {
      ok: false,
      error:
        "controllerJs is disabled for security reasons. Use the declarative controller object instead.",
    };
  }

  const fields = resolveFields(body.fields, body.mockData);
  const filterFields =
    Array.isArray(body.filterFields) && body.filterFields.length > 0
      ? resolveFields(body.filterFields, body.mockData)
      : fields;
  const dataFields = mergeUniqueFields(fields, filterFields);
  const generatedViewXml = hasDirectUi5Content
    ? (body.viewXml ?? "")
    : buildDefaultViewXml(fields);
  const generatedController = normalizePreviewControllerConfig(body.controller);
  const generatedModelData =
    body.modelData ??
    ({
      items: normalizeRows(dataFields, body.mockData),
    } as Record<string, unknown>);

  if (!hasDirectUi5Content) {
    // Metadados extras usados pelo runtime para montar SmartFilter/SmartTable.
    generatedModelData.__previewColumns = buildPreviewColumns(fields);
    generatedModelData.__previewFilters = buildPreviewColumns(filterFields);
  }

  return {
    ok: true,
    payload: {
      name: body.name?.trim() || "Generated Report Preview",
      viewXml: generatedViewXml,
      controller: generatedController,
      modelData: generatedModelData,
    },
  };
}
