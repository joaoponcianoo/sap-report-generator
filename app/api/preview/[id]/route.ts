import { NextResponse } from "next/server";
import { getPreviewEntry } from "@/lib/previewStore";
import { parsePreviewToken } from "@/lib/previewToken";
import { buildPreviewHtml } from "@/lib/preview/buildPreviewHtml";

export async function GET(
  req: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  const params = await context.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const fromStore = getPreviewEntry(params.id);
  const fromToken = token ? parsePreviewToken(token) : null;
  const preview = fromStore ?? fromToken;

  if (!preview) {
    return new NextResponse("Preview not found or expired", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const html = buildPreviewHtml(params.id, {
    name: preview.name,
    viewXml: preview.viewXml,
    controller: preview.controller,
    modelData: preview.modelData,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
