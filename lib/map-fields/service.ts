import type { AgentResponse, FieldMapping, FieldType } from "@/lib/types";

// Fonte usada para gerar o mapping.
// - openai: resposta valida do modelo
// - mock: mock intencional (forceMock ou sem API key)
// - mock_fallback: tentativa OpenAI falhou e caiu para mock
export type MappingSource = "openai" | "mock" | "mock_fallback";

export interface MappingResult {
  payload: AgentResponse;
  source: MappingSource;
  reason?: string;
}

interface GenerateFieldMappingsParams {
  prompt: string;
  forceMock: boolean;
  apiKey?: string;
  model?: string;
}

interface OpenAIOutputContent {
  type?: string;
  text?: string;
}

interface OpenAIOutputItem {
  type?: string;
  content?: OpenAIOutputContent[];
}

interface OpenAIResponsesApiResponse {
  output_text?: string;
  output?: OpenAIOutputItem[];
}

// Prompt em ingles padronizado para reduzir ambiguidade.
// A IA deve retornar somente JSON com campos de negocio.
const SYSTEM_PROMPT = `You are an SAP CDS field mapping expert.

Goal:
- Read the user request for a report.
- Extract only the business fields requested by the user.
- Choose the most appropriate SAP CDS view and CDS field for each one.

Hard rules:
- Return only JSON that matches the schema.
- Output fields only. Never output report title.
- Keep displayName in English.
- Keep displayName concise (usually 1 to 4 words), no full sentence.
- When the prompt explicitly lists fields, preserve the same field order.
- Do not include command text as a field (examples: "create report", "show me", "generate report").
- Do not merge different requested fields into one field.
- Do not invent unrelated fields.
- Avoid duplicates.
- Choose type only from: string, number, date, boolean.
- Do not depend on a fixed list of CDS views. Infer the best CDS view for each field.
- If uncertain, still return the best candidate CDS view and CDS field names.`;

const OUTPUT_JSON_SCHEMA = {
  name: "sap_field_mapping",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      fields: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            displayName: { type: "string", minLength: 1 },
            cdsField: { type: "string", minLength: 1 },
            cdsView: { type: "string", minLength: 1 },
            type: {
              type: "string",
              enum: ["string", "number", "date", "boolean"],
            },
          },
          required: ["displayName", "cdsField", "cdsView", "type"],
        },
      },
    },
    required: ["fields"],
  },
} as const;

const FIELD_TYPES: FieldType[] = ["string", "number", "date", "boolean"];

// Fallback minimo para nunca quebrar a tela do usuario.
const DEFAULT_FIELDS: FieldMapping[] = [
  {
    displayName: "Field 1",
    cdsField: "Field1",
    cdsView: "I_AutoMapped",
    type: "string",
  },
  {
    displayName: "Field 2",
    cdsField: "Field2",
    cdsView: "I_AutoMapped",
    type: "string",
  },
  {
    displayName: "Field 3",
    cdsField: "Field3",
    cdsView: "I_AutoMapped",
    type: "string",
  },
];

const COMMON_PROMPT_NOISE = [
  "create report",
  "create a report",
  "generate report",
  "generate a report",
  "show me",
  "i need a report",
  "please create a report",
];

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

function parseRequestedFields(prompt: string): string[] {
  // Se houver "with ...", priorizamos esse trecho porque normalmente
  // ele contem a lista direta de campos.
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
        .replace(/^(a|an|the|please|i|we|need|want|create|generate|show)\s+/i, "")
        .replace(/\s+fields?$/i, "")
        .trim(),
    )
    .filter(Boolean);

  return Array.from(new Set(tokens)).slice(0, 12);
}

function buildMockResponse(prompt: string): AgentResponse {
  // Mock dinamico: tenta transformar o prompt em campos minimamente uteis.
  const names = parseRequestedFields(prompt);
  const fields =
    names.length > 0
      ? names.map((name) => {
          const displayName = toTitleCase(name);
          return {
            displayName,
            cdsField: toCdsFieldName(displayName),
            cdsView: "I_AutoMapped",
            type: "string",
          } satisfies FieldMapping;
        })
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

  return (
    typeof value.displayName === "string" &&
    typeof value.cdsField === "string" &&
    typeof value.cdsView === "string" &&
    typeof value.type === "string" &&
    FIELD_TYPES.includes(value.type as FieldType)
  );
}

function isAgentResponse(value: unknown): value is AgentResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.fields) &&
    value.fields.every(isFieldMapping)
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAgentResponse(payload: AgentResponse): AgentResponse | null {
  // Normalizacao defensiva para limpar resposta "quase valida":
  // remove ruido, duplicados e campos vazios.
  const dedupe = new Set<string>();
  const normalizedFields: FieldMapping[] = [];

  for (const rawField of payload.fields) {
    const displayName = normalizeWhitespace(rawField.displayName);
    const cdsField = normalizeWhitespace(rawField.cdsField);
    const cdsView = normalizeWhitespace(rawField.cdsView);
    const displayNameKey = displayName.toLowerCase();

    if (!displayName || !cdsField || !cdsView) {
      continue;
    }
    if (displayName.length > 70) {
      continue;
    }
    if (COMMON_PROMPT_NOISE.some((noise) => displayNameKey.includes(noise))) {
      continue;
    }

    const uniqueKey = `${displayNameKey}|${cdsView.toLowerCase()}|${cdsField.toLowerCase()}`;
    if (dedupe.has(uniqueKey)) {
      continue;
    }

    dedupe.add(uniqueKey);
    normalizedFields.push({
      displayName,
      cdsField,
      cdsView,
      type: rawField.type,
    });
  }

  if (normalizedFields.length === 0) {
    return null;
  }

  return { fields: normalizedFields };
}

function cleanJsonResponse(text: string): string {
  // Modelos podem devolver JSON dentro de markdown.
  return text
    .trim()
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "");
}

function extractTextFromOpenAIResponse(data: unknown): string | null {
  // A API de Responses pode retornar texto em output_text
  // ou em output[].content[].text.
  if (!isRecord(data)) {
    return null;
  }

  const typedData = data as OpenAIResponsesApiResponse;
  if (
    typeof typedData.output_text === "string" &&
    typedData.output_text.trim().length > 0
  ) {
    return typedData.output_text;
  }

  if (!Array.isArray(typedData.output)) {
    return null;
  }

  for (const item of typedData.output) {
    if (!item || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        content &&
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string" &&
        content.text.trim().length > 0
      ) {
        return content.text;
      }
    }
  }

  return null;
}

export async function generateFieldMappings({
  prompt,
  forceMock,
  apiKey,
  model,
}: GenerateFieldMappingsParams): Promise<MappingResult> {
  const fallbackPayload = buildMockResponse(prompt);

  // Falha "esperada": sem chave ou modo mock ativo.
  if (forceMock || !apiKey) {
    return {
      payload: fallbackPayload,
      source: "mock",
      reason: forceMock ? "forceMock enabled" : "OPENAI_API_KEY missing",
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model?.trim() || "gpt-4o-mini",
      temperature: 0,
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `User request:\n${prompt}\n\nReturn only the JSON object defined by the schema.`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...OUTPUT_JSON_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    // Em erro HTTP, mantemos UX funcional com fallback.
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown OpenAI error" }));
    console.error("OpenAI API error, using mock fallback:", errorData);
    return {
      payload: fallbackPayload,
      source: "mock_fallback",
      reason: `openai_http_${response.status}`,
    };
  }

  const data = await response.json();
  const textContent = extractTextFromOpenAIResponse(data);
  if (!textContent) {
    console.error("No text content from OpenAI, using mock fallback");
    return {
      payload: fallbackPayload,
      source: "mock_fallback",
      reason: "openai_empty_output",
    };
  }

  try {
    const parsed = JSON.parse(cleanJsonResponse(textContent));
    if (isAgentResponse(parsed)) {
      const normalized = normalizeAgentResponse(parsed);
      if (normalized) {
        return {
          payload: normalized,
          source: "openai",
        };
      }

      console.error("AI payload normalized to empty fields, using mock fallback");
      return {
        payload: fallbackPayload,
        source: "mock_fallback",
        reason: "openai_empty_after_normalization",
      };
    }

    console.error("Invalid AI payload shape, using mock fallback:", parsed);
    return {
      payload: fallbackPayload,
      source: "mock_fallback",
      reason: "openai_invalid_schema",
    };
  } catch (error) {
    console.error("Failed to parse OpenAI response, using mock fallback:", error);
    return {
      payload: fallbackPayload,
      source: "mock_fallback",
      reason: "openai_parse_error",
    };
  }
}
