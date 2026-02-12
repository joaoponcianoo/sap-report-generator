import { NextResponse } from "next/server";
import { getPreviewEntry } from "@/lib/previewStore";
import { parsePreviewToken } from "@/lib/previewToken";

function serializeForInlineScript(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPreviewHtml(previewId: string, preview: {
  name: string;
  viewXml: string;
  controllerJs: string;
  modelData: Record<string, unknown>;
}) {
  const payload = serializeForInlineScript({
    previewId,
    ...preview,
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(preview.name)}</title>
    <script
      id="sap-ui-bootstrap"
      src="https://ui5.sap.com/resources/sap-ui-core.js"
      data-sap-ui-libs="sap.m"
      data-sap-ui-theme="sap_horizon"
      data-sap-ui-async="false"
      data-sap-ui-compatVersion="edge">
    </script>
    <style>
      html, body, #content {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: "72", Arial, sans-serif;
        background: #fff;
      }
    </style>
  </head>
  <body>
    <div id="content"></div>
    <script>
      const PREVIEW = ${payload};

      function notifyParent(status, errorMessage) {
        if (!window.parent) {
          return;
        }
        window.parent.postMessage(
          {
            channel: "fiori-preview",
            previewId: PREVIEW.previewId,
            status,
            error: errorMessage || null
          },
          "*"
        );
      }

      function startPreview() {
        try {
          if (PREVIEW.controllerJs) {
            (0, eval)(PREVIEW.controllerJs);
          }
        } catch (controllerError) {
          notifyParent("error", "Controller JS failed: " + String(controllerError));
          return;
        }

        const columns = Array.isArray(PREVIEW?.modelData?.__previewColumns)
          ? PREVIEW.modelData.__previewColumns
          : [];

        if (columns.length > 0) {
          sap.ui.require([
            "sap/m/Page",
            "sap/m/Table",
            "sap/m/Column",
            "sap/m/Label",
            "sap/m/ColumnListItem",
            "sap/m/Text",
            "sap/ui/model/json/JSONModel"
          ], function (Page, Table, Column, Label, ColumnListItem, Text, JSONModel) {
            try {
              const table = new Table();

              columns.forEach(function (columnMeta) {
                table.addColumn(
                  new Column({
                    header: new Label({ text: String(columnMeta.label || "") })
                  })
                );
              });

              const template = new ColumnListItem({
                cells: columns.map(function (columnMeta) {
                  return new Text({ text: "{" + String(columnMeta.key || "") + "}" });
                })
              });

              table.bindItems("/items", template);

              const page = new Page({
                title: PREVIEW.name || "AI Report Preview",
                content: [table]
              });
              page.setModel(new JSONModel(PREVIEW.modelData || {}));
              page.placeAt("content");
              notifyParent("ready");
            } catch (generatedError) {
              notifyParent("error", "Generated table rendering failed: " + String(generatedError));
            }
          }, function (sapError) {
            notifyParent("error", "UI5 module loading failed: " + String(sapError));
          });
          return;
        }

        sap.ui.require([
          "sap/ui/core/mvc/XMLView",
          "sap/ui/model/json/JSONModel"
        ], function (XMLView, JSONModel) {
          const viewXml = typeof PREVIEW.viewXml === "string" ? PREVIEW.viewXml.trim() : "";
          if (!viewXml) {
            notifyParent("error", "Preview XML is empty");
            return;
          }

          XMLView.create({
            // UI5 current API expects "definition" for inline XML.
            definition: viewXml,
            // Keep backward compatibility for older runtimes.
            viewContent: viewXml
          })
            .then(function (view) {
              const model = new JSONModel(PREVIEW.modelData || {});
              view.setModel(model);
              view.placeAt("content");
              notifyParent("ready");
            })
            .catch(function (viewError) {
              notifyParent("error", "XMLView rendering failed: " + String(viewError));
            });
        }, function (sapError) {
          notifyParent("error", "UI5 module loading failed: " + String(sapError));
        });
      }

      function bindUi5Init() {
        if (window.sap && sap.ui && sap.ui.getCore) {
          sap.ui.getCore().attachInit(startPreview);
        } else {
          notifyParent("error", "UI5 bootstrap not available");
        }
      }

      const bootstrapScript = document.getElementById("sap-ui-bootstrap");
      if (window.sap && sap.ui && sap.ui.getCore) {
        bindUi5Init();
      } else if (bootstrapScript) {
        bootstrapScript.addEventListener("load", bindUi5Init, { once: true });
        bootstrapScript.addEventListener(
          "error",
          function () {
            notifyParent("error", "Failed to load UI5 bootstrap script");
          },
          { once: true }
        );
      } else {
        notifyParent("error", "UI5 bootstrap tag not found");
      }
    </script>
  </body>
</html>`;
}

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
    controllerJs: preview.controllerJs,
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
