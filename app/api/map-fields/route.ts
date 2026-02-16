import { NextRequest, NextResponse } from "next/server";
import { generateFieldMappings } from "@/lib/map-fields/service";

interface MapFieldsRequestBody {
  prompt?: unknown;
  forceMock?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    // A rota recebe um prompt simples e devolve apenas o mapping de campos.
    // O frontend usa esse mapping para montar tabela/filtros no preview.
    const body = (await req.json()) as MapFieldsRequestBody;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json(
        { error: "Invalid prompt provided" },
        { status: 400 },
      );
    }

    // A escolha entre OpenAI e mock fica centralizada no service.
    // Assim a rota continua enxuta e sem logica de prompt/mapping.
    const result = await generateFieldMappings({
      prompt: prompt,
      forceMock: body.forceMock === true || process.env.MOCK_AI === "true",
      apiKey: process.env.OPENAI_API_KEY?.trim(),
      model: process.env.OPENAI_MODEL?.trim(),
    });

    return NextResponse.json(
      {
        ...result.payload,
        _meta: {
          source: result.source,
          reason: result.reason ?? null,
        },
      },
      {
        headers: {
          "x-mapping-source": result.source,
        },
      },
    );
  } catch (error) {
    // Erro inesperado da rota (parse, rede, runtime etc).
    console.error("Error in map-fields API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
