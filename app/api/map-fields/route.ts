import { NextRequest, NextResponse } from "next/server";
import type { AgentResponse, FieldMapping, FieldType } from "@/lib/types";

const SYSTEM_PROMPT = `You are an SAP CDS field mapping expert. Your task is to analyze user prompts describing report fields and map them to appropriate SAP CDS view fields.

For each field mentioned by the user, you should:
1. Identify the field type (string, number, date, boolean, enum)
2. Suggest an appropriate SAP CDS view (e.g., I_SalesOrder, I_Product, I_Customer, etc.)
3. Suggest the specific CDS field name (e.g., OrderID, ProductID, Quantity, etc.)
4. For enum fields, suggest possible values

Common SAP CDS views:
- I_SalesOrder: Sales orders (OrderID, SalesOrderType, CustomerID, CreationDate, TotalAmount, Status, etc.)
- I_SalesOrderItem: Sales order items (SalesOrderItem, ProductID, Quantity, UnitPrice, NetAmount, etc.)
- I_Product: Products (ProductID, ProductName, ProductCategory, BaseUnit, etc.)
- I_Customer: Customers (CustomerID, CustomerName, Country, City, etc.)
- I_Material: Materials (Material, MaterialName, MaterialType, MaterialGroup, etc.)

Respond ONLY with valid JSON in this exact format:
{
  "fields": [
    {
      "displayName": "Order",
      "cdsField": "OrderID",
      "cdsView": "I_SalesOrder",
      "type": "string"
    },
    {
      "displayName": "Quantity",
      "cdsField": "Quantity",
      "cdsView": "I_SalesOrderItem",
      "type": "number"
    },
    {
      "displayName": "Status",
      "cdsField": "Status",
      "cdsView": "I_SalesOrder",
      "type": "enum",
      "enumValues": ["Open", "In Progress", "Completed", "Cancelled"]
    }
  ]
}

Do not include any explanation or markdown formatting. Only return the JSON object.`;

const FIELD_TYPES: FieldType[] = ["string", "number", "date", "boolean", "enum"];

const DEFAULT_FIELDS: FieldMapping[] = [
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

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicApiResponse {
  content?: AnthropicContentBlock[];
}

interface MapFieldsRequestBody {
  prompt?: unknown;
  forceMock?: boolean;
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function toCdsFieldName(value: string): string {
  const parts = value
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "FieldValue";
  }

  const [first, ...rest] = parts;
  return (
    first[0].toUpperCase() +
    first.slice(1) +
    rest.map((part) => part[0].toUpperCase() + part.slice(1)).join("")
  );
}

function inferFieldMapping(fieldName: string): FieldMapping {
  const normalized = fieldName.toLowerCase();
  const displayName = toTitleCase(fieldName);

  if (normalized.includes("status")) {
    return {
      displayName,
      cdsField: "Status",
      cdsView: "I_SalesOrder",
      type: "enum",
      enumValues: ["Open", "In Progress", "Completed", "Cancelled"],
    };
  }

  if (normalized.includes("quantity")) {
    return {
      displayName,
      cdsField: "Quantity",
      cdsView: "I_SalesOrderItem",
      type: "number",
    };
  }

  if (
    normalized.includes("amount") ||
    normalized.includes("price") ||
    normalized.includes("value") ||
    normalized.includes("total")
  ) {
    return {
      displayName,
      cdsField: "NetAmount",
      cdsView: "I_SalesOrderItem",
      type: "number",
    };
  }

  if (normalized.includes("date")) {
    return {
      displayName,
      cdsField: "CreationDate",
      cdsView: "I_SalesOrder",
      type: "date",
    };
  }

  if (normalized.includes("customer")) {
    return {
      displayName,
      cdsField: "CustomerName",
      cdsView: "I_Customer",
      type: "string",
    };
  }

  if (normalized.includes("product")) {
    return {
      displayName,
      cdsField: "ProductName",
      cdsView: "I_Product",
      type: "string",
    };
  }

  if (normalized.includes("material")) {
    return {
      displayName,
      cdsField: "MaterialName",
      cdsView: "I_Material",
      type: "string",
    };
  }

  if (normalized.includes("item")) {
    return {
      displayName,
      cdsField: "SalesOrderItem",
      cdsView: "I_SalesOrderItem",
      type: "string",
    };
  }

  if (normalized.includes("order")) {
    return {
      displayName,
      cdsField: "OrderID",
      cdsView: "I_SalesOrder",
      type: "string",
    };
  }

  return {
    displayName,
    cdsField: toCdsFieldName(displayName),
    cdsView: "I_SalesOrder",
    type: "string",
  };
}

function parseRequestedFields(prompt: string): string[] {
  const preferredSegment = prompt.match(/\bwith\b([\s\S]*)/i)?.[1] ?? prompt;
  const normalized = preferredSegment
    .replace(/\band\b/gi, ",")
    .replace(/\./g, ",")
    .replace(/\s+/g, " ");

  const tokens = normalized
    .split(",")
    .map((token) =>
      token
        .trim()
        .replace(/^(a|an|the)\s+/i, "")
        .replace(/\s+fields?$/i, "")
        .trim(),
    )
    .filter(Boolean);

  return Array.from(new Set(tokens)).slice(0, 12);
}

function buildMockResponse(prompt: string): AgentResponse {
  const fieldNames = parseRequestedFields(prompt);
  const fields =
    fieldNames.length > 0
      ? fieldNames.map(inferFieldMapping)
      : [...DEFAULT_FIELDS];

  return { fields };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFieldMapping(value: unknown): value is FieldMapping {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.displayName !== "string" ||
    typeof value.cdsField !== "string" ||
    typeof value.cdsView !== "string" ||
    typeof value.type !== "string" ||
    !FIELD_TYPES.includes(value.type as FieldType)
  ) {
    return false;
  }

  if (value.enumValues !== undefined) {
    if (!Array.isArray(value.enumValues)) {
      return false;
    }

    if (!value.enumValues.every((enumValue) => typeof enumValue === "string")) {
      return false;
    }
  }

  return true;
}

function isAgentResponse(value: unknown): value is AgentResponse {
  if (!isRecord(value) || !Array.isArray(value.fields)) {
    return false;
  }

  return value.fields.every(isFieldMapping);
}

function extractTextFromAnthropicResponse(data: unknown): string | null {
  if (!isRecord(data)) {
    return null;
  }

  const typedData = data as AnthropicApiResponse;
  if (!Array.isArray(typedData.content)) {
    return null;
  }

  const textBlock = typedData.content.find(
    (block) => block.type === "text" && typeof block.text === "string",
  );

  return textBlock?.text ?? null;
}

function cleanJsonResponse(text: string): string {
  return text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MapFieldsRequestBody;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        { error: "Invalid prompt provided" },
        { status: 400 },
      );
    }

    const forceMock = body.forceMock === true || process.env.MOCK_AI === "true";
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (forceMock || !apiKey) {
      return NextResponse.json(buildMockResponse(prompt));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown Anthropic error" }));
      console.error("Claude API error, using mock fallback:", errorData);
      return NextResponse.json(buildMockResponse(prompt));
    }

    const data = await response.json();
    const textContent = extractTextFromAnthropicResponse(data);
    if (!textContent) {
      console.error("No text content from Anthropic, using mock fallback");
      return NextResponse.json(buildMockResponse(prompt));
    }

    try {
      const parsed = JSON.parse(cleanJsonResponse(textContent));
      if (isAgentResponse(parsed)) {
        return NextResponse.json(parsed);
      }

      console.error("Invalid AI payload shape, using mock fallback:", parsed);
      return NextResponse.json(buildMockResponse(prompt));
    } catch (error) {
      console.error(
        "Failed to parse Anthropic response, using mock fallback:",
        error,
      );
      return NextResponse.json(buildMockResponse(prompt));
    }
  } catch (error) {
    console.error("Error in map-fields API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
