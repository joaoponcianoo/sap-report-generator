import { NextRequest, NextResponse } from "next/server";
import { createPreviewEntry } from "@/lib/previewStore";
import { createPreviewToken } from "@/lib/previewToken";
import {
  buildPreviewPayload,
  type CreatePreviewRequest,
} from "@/lib/preview/createPreviewPayload";

export async function POST(req: NextRequest) {
  try {
    // Entrada do frontend com titulo, campos e mockData.
    const body = (await req.json()) as CreatePreviewRequest;
    const buildResult = buildPreviewPayload(body);

    if (!buildResult.ok) {
      return NextResponse.json({ error: buildResult.error }, { status: 400 });
    }

    // Guardamos o preview em memoria (TTL) para acesso rapido no iframe.
    const preview = createPreviewEntry({
      name: buildResult.payload.name,
      viewXml: buildResult.payload.viewXml,
      controller: buildResult.payload.controller,
      modelData: buildResult.payload.modelData,
    });

    // Token assinado permite recuperar preview mesmo sem depender so da store.
    // Isso ajuda em cenarios com refresh/reload do iframe.
    const previewToken = createPreviewToken({
      name: preview.name,
      viewXml: preview.viewXml,
      controller: preview.controller,
      modelData: preview.modelData,
      createdAt: preview.createdAt,
    });

    const previewColumns = Array.isArray(preview.modelData.__previewColumns)
      ? preview.modelData.__previewColumns
      : null;
    if (previewColumns && previewColumns.length > 0) {
      // Quando ha metadados de colunas, habilitamos o modo SmartTable
      // informando para o runtime um serviceUrl OData mock dedicado.
      const encodedToken = encodeURIComponent(previewToken);
      preview.modelData.__smartTableOData = {
        serviceUrl: `/api/preview/${preview.id}/odata/token/${encodedToken}/`,
        entitySet: "PreviewSet",
      };
    }

    return NextResponse.json({
      previewId: preview.id,
      previewUrl: `/api/preview/${preview.id}?token=${encodeURIComponent(previewToken)}`,
      previewToken,
      createdAt: preview.createdAt,
    });
  } catch (error) {
    // Falha inesperada na criacao do preview.
    console.error("Error creating preview:", error);
    return NextResponse.json(
      { error: "Failed to create preview" },
      { status: 500 },
    );
  }
}
