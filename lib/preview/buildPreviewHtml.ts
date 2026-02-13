import type { PreviewControllerConfig } from "@/lib/preview/controllerConfig";

export interface PreviewHtmlPayload {
  name: string;
  viewXml: string;
  controller: PreviewControllerConfig;
  modelData: Record<string, unknown>;
}

function serializeForInlineScript(payload: unknown): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/<\/script/gi, "<\\/script")
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

export function buildPreviewHtml(
  previewId: string,
  preview: PreviewHtmlPayload,
): string {
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
    <script src="/ui5-preview-runtime.js"></script>
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
      const previewPayload = ${payload};

      function notifyPreviewRuntimeMissing(preview) {
        if (!window.parent) {
          return;
        }
        window.parent.postMessage(
          {
            channel: "fiori-preview",
            previewId: preview.previewId,
            status: "error",
            error: "UI5 preview runtime script not loaded"
          },
          "*"
        );
      }

      if (
        window.FioriPreviewRuntime &&
        typeof window.FioriPreviewRuntime.start === "function"
      ) {
        window.FioriPreviewRuntime.start(previewPayload);
      } else {
        notifyPreviewRuntimeMissing(previewPayload);
      }
    </script>
  </body>
</html>`;
}
