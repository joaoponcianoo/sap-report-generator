import { NextRequest, NextResponse } from "next/server";
import type { FieldMapping } from "@/lib/types";
import { createPreviewEntry } from "@/lib/previewStore";
import { createPreviewToken } from "@/lib/previewToken";

interface CreatePreviewRequest {
  name?: string;
  fields?: FieldMapping[];
  mockData?: Record<string, unknown>[];
  viewXml?: string;
  controllerJs?: string;
  modelData?: Record<string, unknown>;
}

interface PreviewColumnMeta {
  key: string;
  label: string;
  type: FieldMapping["type"];
  enumValues?: string[];
}

const DEFAULT_FALLBACK_FIELDS: FieldMapping[] = [
  {
    displayName: "Order",
    cdsField: "OrderID",
    cdsView: "I_SalesOrder",
    type: "string",
  },
  {
    displayName: "Item",
    cdsField: "SalesOrderItem",
    cdsView: "I_SalesOrderItem",
    type: "string",
  },
  {
    displayName: "Status",
    cdsField: "Status",
    cdsView: "I_SalesOrder",
    type: "enum",
    enumValues: ["Open", "In Progress", "Completed", "Cancelled"],
  },
];

function sanitizeBindingKey(raw: string): string {
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
    value === "boolean" ||
    value === "enum"
  );
}

function resolveFields(
  fieldsInput: CreatePreviewRequest["fields"],
  mockData: CreatePreviewRequest["mockData"],
): FieldMapping[] {
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
          const enumValues = Array.isArray(field.enumValues)
            ? field.enumValues.filter(
                (value): value is string => typeof value === "string",
              )
            : undefined;

          return {
            displayName,
            cdsField: cdsFieldRaw || sanitizeBindingKey(displayName),
            cdsView: cdsViewRaw || "I_AdhocPreview",
            type,
            enumValues,
          } satisfies FieldMapping;
        })
    : [];

  if (fieldsFromInput.length > 0) {
    return fieldsFromInput;
  }

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
    case "enum":
      return field.enumValues?.[index % (field.enumValues.length || 1)] ?? "N/A";
    default:
      return `${field.displayName} ${index + 1}`;
  }
}

function findValueInRow(
  sourceRow: Record<string, unknown>,
  field: FieldMapping,
): unknown {
  const bindingKey = sanitizeBindingKey(field.cdsField || field.displayName);
  const directValue =
    sourceRow[field.displayName] ?? sourceRow[field.cdsField] ?? sourceRow[bindingKey];

  if (directValue !== undefined && directValue !== null) {
    return directValue;
  }

  const targets = new Set([
    normalizeText(field.displayName),
    normalizeText(field.cdsField),
    normalizeText(bindingKey),
  ]);

  for (const [key, value] of Object.entries(sourceRow)) {
    if (targets.has(normalizeText(key)) && value !== undefined && value !== null) {
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
  return fields.map((field) => ({
    key: sanitizeBindingKey(field.cdsField || field.displayName),
    label: field.displayName,
    type: field.type,
    enumValues: field.enumValues,
  }));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePreviewRequest;

    const hasDirectUi5Content = Boolean(body.viewXml);
    const hasFieldConfig = Array.isArray(body.fields) && body.fields.length > 0;

    if (!hasDirectUi5Content && !hasFieldConfig) {
      return NextResponse.json(
        {
          error:
            "Provide either (viewXml/controllerJs) or a non-empty fields array",
        },
        { status: 400 },
      );
    }

    const fields = resolveFields(body.fields, body.mockData);
    const generatedViewXml = hasDirectUi5Content
      ? (body.viewXml ?? "")
      : buildDefaultViewXml(fields);
    const generatedControllerJs = body.controllerJs ?? "";
    const generatedModelData =
      body.modelData ??
      ({
        items: normalizeRows(fields, body.mockData),
      } as Record<string, unknown>);
    if (!hasDirectUi5Content) {
      const previewColumns = buildPreviewColumns(fields);
      generatedModelData.__previewColumns = previewColumns;
    }

    const preview = createPreviewEntry({
      name: body.name?.trim() || "Generated Report Preview",
      viewXml: generatedViewXml,
      controllerJs: generatedControllerJs,
      modelData: generatedModelData,
    });

    const previewToken = createPreviewToken({
      name: preview.name,
      viewXml: preview.viewXml,
      controllerJs: preview.controllerJs,
      modelData: preview.modelData,
      createdAt: preview.createdAt,
    });

    return NextResponse.json({
      previewId: preview.id,
      previewUrl: `/api/preview/${preview.id}?token=${encodeURIComponent(previewToken)}`,
      previewToken,
      createdAt: preview.createdAt,
    });
  } catch (error) {
    console.error("Error creating preview:", error);
    return NextResponse.json(
      { error: "Failed to create preview" },
      { status: 500 },
    );
  }
}
