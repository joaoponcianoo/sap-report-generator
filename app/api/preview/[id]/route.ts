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
            "sap/m/SearchField",
            "sap/m/Select",
            "sap/ui/core/Item",
            "sap/m/Button",
            "sap/m/FlexBox",
            "sap/m/VBox",
            "sap/m/Toolbar",
            "sap/m/ToolbarSpacer",
            "sap/ui/model/json/JSONModel",
            "sap/ui/model/Filter"
          ], function (
            Page,
            Table,
            Column,
            Label,
            ColumnListItem,
            Text,
            SearchField,
            Select,
            Item,
            Button,
            FlexBox,
            VBox,
            Toolbar,
            ToolbarSpacer,
            JSONModel,
            Filter
          ) {
            try {
              const items = Array.isArray(PREVIEW?.modelData?.items)
                ? PREVIEW.modelData.items
                : [];
              const totalCount = items.length;
              const filterState = {};

              const table = new Table();
              table.setModel(new JSONModel(PREVIEW.modelData || {}));

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

              function getFilterOptions(columnMeta) {
                if (Array.isArray(columnMeta.enumValues) && columnMeta.enumValues.length > 0) {
                  return columnMeta.enumValues.map(function (value) {
                    return String(value);
                  });
                }

                const values = new Set();
                items.forEach(function (row) {
                  const value = row?.[columnMeta.key];
                  if (value !== undefined && value !== null && String(value).trim() !== "") {
                    values.add(String(value));
                  }
                });

                return Array.from(values).sort();
              }

              const resultText = new Text({
                text: "Showing " + totalCount + " of " + totalCount
              });

              function applyFilters() {
                const binding = table.getBinding("items");
                if (!binding) {
                  return;
                }

                const activeFilters = columns
                  .map(function (columnMeta) {
                    const rawFilter = filterState[columnMeta.key];
                    if (rawFilter === undefined || rawFilter === null || String(rawFilter).trim() === "") {
                      return null;
                    }

                    const normalizedFilter = String(rawFilter).trim().toLowerCase();
                    return new Filter({
                      path: String(columnMeta.key),
                      test: function (candidateValue) {
                        if (candidateValue === undefined || candidateValue === null) {
                          return false;
                        }

                        const normalizedCandidate = String(candidateValue).toLowerCase();
                        if (columnMeta.type === "enum" || columnMeta.type === "boolean") {
                          return normalizedCandidate === normalizedFilter;
                        }

                        return normalizedCandidate.indexOf(normalizedFilter) !== -1;
                      }
                    });
                  })
                  .filter(Boolean);

                binding.filter(activeFilters);
                resultText.setText("Showing " + binding.getLength() + " of " + totalCount);
              }

              const filtersContainer = new FlexBox({
                wrap: "Wrap",
                renderType: "Div"
              });
              filtersContainer.addStyleClass("sapUiSmallMarginTop sapUiSmallMarginBottom");

              columns.forEach(function (columnMeta) {
                const filterLabel = new Label({
                  text: String(columnMeta.label || columnMeta.key)
                });

                let filterControl;
                if (columnMeta.type === "enum" || columnMeta.type === "boolean") {
                  filterControl = new Select({
                    width: "13rem",
                    items: [new Item({ key: "", text: "All" })]
                  });

                  const options = columnMeta.type === "boolean"
                    ? ["true", "false"]
                    : getFilterOptions(columnMeta);

                  options.forEach(function (option) {
                    filterControl.addItem(
                      new Item({
                        key: String(option),
                        text: String(option)
                      })
                    );
                  });

                  filterControl.attachChange(function (event) {
                    filterState[columnMeta.key] = event.getSource().getSelectedKey();
                    applyFilters();
                  });
                } else {
                  filterControl = new SearchField({
                    width: "13rem",
                    placeholder: "Filter " + String(columnMeta.label || columnMeta.key),
                    liveChange: function (event) {
                      filterState[columnMeta.key] = event.getParameter("newValue") || "";
                      applyFilters();
                    },
                    search: function (event) {
                      filterState[columnMeta.key] = event.getParameter("query") || "";
                      applyFilters();
                    }
                  });
                }

                const filterBox = new VBox({
                  width: "13rem",
                  items: [filterLabel, filterControl]
                });
                filterBox.addStyleClass("sapUiSmallMarginEnd sapUiSmallMarginBottom");
                filtersContainer.addItem(filterBox);
              });

              const clearButton = new Button({
                text: "Clear Filters",
                press: function () {
                  Object.keys(filterState).forEach(function (key) {
                    filterState[key] = "";
                  });

                  filtersContainer.getItems().forEach(function (item) {
                    const controls = item.getItems();
                    const control = controls[1];
                    if (control && typeof control.setValue === "function") {
                      control.setValue("");
                    }
                    if (control && typeof control.setSelectedKey === "function") {
                      control.setSelectedKey("");
                    }
                  });

                  applyFilters();
                }
              });

              const filtersToolbar = new Toolbar({
                content: [
                  new Text({ text: "Filters" }),
                  new ToolbarSpacer(),
                  resultText,
                  clearButton
                ]
              });

              const content = new VBox({
                items: [filtersToolbar, filtersContainer, table]
              });
              content.addStyleClass("sapUiSmallMargin");

              const page = new Page({
                title: PREVIEW.name || "AI Report Preview",
                content: [content]
              });
              page.placeAt("content");
              applyFilters();
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
