import { NextRequest, NextResponse } from "next/server";
import { createPreviewEntry } from "@/lib/previewStore";
import { createPreviewToken } from "@/lib/previewToken";
import {
  buildPreviewPayload,
  type CreatePreviewRequest,
} from "@/lib/preview/createPreviewPayload";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePreviewRequest;
    const buildResult = buildPreviewPayload(body);

    if (!buildResult.ok) {
      return NextResponse.json({ error: buildResult.error }, { status: 400 });
    }

    const preview = createPreviewEntry({
      name: buildResult.payload.name,
      viewXml: buildResult.payload.viewXml,
      controller: buildResult.payload.controller,
      modelData: buildResult.payload.modelData,
    });

    const previewToken = createPreviewToken({
      name: preview.name,
      viewXml: preview.viewXml,
      controller: preview.controller,
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
