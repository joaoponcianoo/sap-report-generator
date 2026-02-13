(function (global) {
  "use strict";

  function notifyParent(preview, status, errorMessage) {
    if (!global.parent) {
      return;
    }

    global.parent.postMessage(
      {
        channel: "fiori-preview",
        previewId: preview && preview.previewId ? preview.previewId : null,
        status: status,
        error: errorMessage || null,
      },
      "*",
    );
  }

  function startPreview(preview) {
    var columns = Array.isArray(
      preview && preview.modelData && preview.modelData.__previewColumns,
    )
      ? preview.modelData.__previewColumns
      : [];
    var filterColumns = Array.isArray(
      preview && preview.modelData && preview.modelData.__previewFilters,
    )
      ? preview.modelData.__previewFilters
      : columns;

    if (columns.length > 0) {
      sap.ui.require(
        [
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
          "sap/ui/model/Filter",
          "sap/ui/model/Sorter",
        ],
        function (
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
          Filter,
          Sorter,
        ) {
          try {
            var items = Array.isArray(
              preview && preview.modelData && preview.modelData.items,
            )
              ? preview.modelData.items
              : [];
            var filterState = {};
            var filterControlsByKey = {};
            var controllerConfig = preview ? preview.controller : null;

            var table = new Table();
            table.setModel(new JSONModel((preview && preview.modelData) || {}));

            columns.forEach(function (columnMeta) {
              table.addColumn(
                new Column({
                  header: new Label({
                    text: String((columnMeta && columnMeta.label) || ""),
                  }),
                }),
              );
            });

            var template = new ColumnListItem({
              cells: columns.map(function (columnMeta) {
                return new Text({
                  text:
                    "{" + String((columnMeta && columnMeta.key) || "") + "}",
                });
              }),
            });

            table.bindItems("/items", template);

            function getFilterOptions(columnMeta) {
              var values = new Set();
              items.forEach(function (row) {
                var value = row && columnMeta ? row[columnMeta.key] : undefined;
                if (
                  value !== undefined &&
                  value !== null &&
                  String(value).trim() !== ""
                ) {
                  values.add(String(value));
                }
              });

              return Array.from(values).sort();
            }

            function resolveColumnMeta(fieldRef, sourceColumns) {
              if (typeof fieldRef !== "string") {
                return null;
              }

              var normalizedFieldRef = fieldRef.trim().toLowerCase();
              if (!normalizedFieldRef) {
                return null;
              }

              return (
                sourceColumns.find(function (columnMeta) {
                  return (
                    String(
                      (columnMeta && columnMeta.key) || "",
                    ).toLowerCase() === normalizedFieldRef ||
                    String(
                      (columnMeta && columnMeta.label) || "",
                    ).toLowerCase() === normalizedFieldRef
                  );
                }) || null
              );
            }

            function applyFilters() {
              var binding = table.getBinding("items");
              if (!binding) {
                return;
              }

              var activeFilters = filterColumns
                .map(function (columnMeta) {
                  var rawFilter = filterState[columnMeta.key];
                  if (
                    rawFilter === undefined ||
                    rawFilter === null ||
                    String(rawFilter).trim() === ""
                  ) {
                    return null;
                  }

                  var normalizedFilter = String(rawFilter).trim().toLowerCase();
                  return new Filter({
                    path: String(columnMeta.key),
                    test: function (candidateValue) {
                      if (
                        candidateValue === undefined ||
                        candidateValue === null
                      ) {
                        return false;
                      }

                      var normalizedCandidate =
                        String(candidateValue).toLowerCase();
                      if (columnMeta.type === "boolean") {
                        return normalizedCandidate === normalizedFilter;
                      }

                      return (
                        normalizedCandidate.indexOf(normalizedFilter) !== -1
                      );
                    },
                  });
                })
                .filter(Boolean);

              binding.filter(activeFilters);
            }

            function refreshTableBinding() {
              var binding = table.getBinding("items");
              if (!binding) {
                return;
              }

              if (typeof binding.refresh === "function") {
                binding.refresh(true);
              }
            }

            function applyControllerConfig() {
              if (!controllerConfig || controllerConfig.version !== 1) {
                return;
              }

              if (Array.isArray(controllerConfig.initialFilters)) {
                controllerConfig.initialFilters.forEach(
                  function (presetFilter) {
                    var columnMeta = resolveColumnMeta(
                      presetFilter.field,
                      filterColumns,
                    );
                    if (!columnMeta || typeof presetFilter.value !== "string") {
                      return;
                    }

                    var normalizedValue = presetFilter.value.trim();
                    if (!normalizedValue) {
                      return;
                    }

                    filterState[columnMeta.key] = normalizedValue;
                    var filterControl = filterControlsByKey[columnMeta.key];
                    if (!filterControl) {
                      return;
                    }

                    if (typeof filterControl.setSelectedKey === "function") {
                      filterControl.setSelectedKey(normalizedValue);
                    } else if (typeof filterControl.setValue === "function") {
                      filterControl.setValue(normalizedValue);
                    }
                  },
                );
              }

              if (controllerConfig.defaultSort) {
                var sortColumn = resolveColumnMeta(
                  controllerConfig.defaultSort.field,
                  columns,
                );
                var binding = table.getBinding("items");
                if (!sortColumn || !binding) {
                  return;
                }

                var descending =
                  controllerConfig.defaultSort.direction === "desc";
                binding.sort(new Sorter(String(sortColumn.key), descending));
              }
            }

            var filtersContainer = new FlexBox({
              wrap: "Wrap",
              renderType: "Div",
            });
            filtersContainer.addStyleClass(
              "sapUiSmallMarginTop sapUiSmallMarginBottom",
            );

            filterColumns.forEach(function (columnMeta) {
              var filterLabel = new Label({
                text: String(
                  (columnMeta && (columnMeta.label || columnMeta.key)) || "",
                ),
              });

              var filterControl;
              if (columnMeta.type === "boolean") {
                filterControl = new Select({
                  width: "13rem",
                  items: [new Item({ key: "", text: "All" })],
                });

                var options =
                  getFilterOptions(columnMeta).length > 0
                    ? getFilterOptions(columnMeta)
                    : ["true", "false"];

                options.forEach(function (option) {
                  filterControl.addItem(
                    new Item({
                      key: String(option),
                      text: String(option),
                    }),
                  );
                });

                filterControl.attachChange(function (event) {
                  filterState[columnMeta.key] = event
                    .getSource()
                    .getSelectedKey();
                });
              } else {
                filterControl = new SearchField({
                  width: "13rem",
                  placeholder:
                    "Filter " +
                    String(
                      (columnMeta && (columnMeta.label || columnMeta.key)) ||
                        "",
                    ),
                  liveChange: function (event) {
                    filterState[columnMeta.key] =
                      event.getParameter("newValue") || "";
                  },
                  search: function (event) {
                    filterState[columnMeta.key] =
                      event.getParameter("query") || "";
                  },
                });
              }

              var filterBox = new VBox({
                width: "13rem",
                items: [filterLabel, filterControl],
              });
              filterBox.addStyleClass(
                "sapUiSmallMarginEnd sapUiSmallMarginBottom",
              );
              filtersContainer.addItem(filterBox);
              filterControlsByKey[columnMeta.key] = filterControl;
            });

            var goButton = new Button({
              text: "Go",
              type: "Emphasized",
              press: function () {
                applyFilters();
              },
            });

            var refreshButton = new Button({
              text: "Refresh",
              press: function () {
                refreshTableBinding();
                applyFilters();
              },
            });

            var filtersToolbar = new Toolbar({
              content: [
                new Text({ text: "Filters" }),
                new ToolbarSpacer(),
                goButton,
                refreshButton,
              ],
            });
            table.setHeaderToolbar(filtersToolbar);

            var content = new VBox({
              items: [filtersContainer, table],
            });
            content.addStyleClass("sapUiSmallMargin");

            var page = new Page({
              title: (preview && preview.name) || "AI Report Preview",
              content: [content],
            });
            page.placeAt("content");
            applyControllerConfig();
            applyFilters();
            notifyParent(preview, "ready");
          } catch (generatedError) {
            notifyParent(
              preview,
              "error",
              "Generated table rendering failed: " + String(generatedError),
            );
          }
        },
        function (sapError) {
          notifyParent(
            preview,
            "error",
            "UI5 module loading failed: " + String(sapError),
          );
        },
      );
      return;
    }

    sap.ui.require(
      ["sap/ui/core/mvc/XMLView", "sap/ui/model/json/JSONModel"],
      function (XMLView, JSONModel) {
        var viewXml =
          typeof preview.viewXml === "string" ? preview.viewXml.trim() : "";
        if (!viewXml) {
          notifyParent(preview, "error", "Preview XML is empty");
          return;
        }

        XMLView.create({
          definition: viewXml,
          viewContent: viewXml,
        })
          .then(function (view) {
            var model = new JSONModel((preview && preview.modelData) || {});
            view.setModel(model);
            view.placeAt("content");
            notifyParent(preview, "ready");
          })
          .catch(function (viewError) {
            notifyParent(
              preview,
              "error",
              "XMLView rendering failed: " + String(viewError),
            );
          });
      },
      function (sapError) {
        notifyParent(
          preview,
          "error",
          "UI5 module loading failed: " + String(sapError),
        );
      },
    );
  }

  function bindUi5AndStart(preview) {
    function bindUi5Init() {
      if (global.sap && sap.ui && sap.ui.getCore) {
        sap.ui.getCore().attachInit(function () {
          startPreview(preview);
        });
      } else {
        notifyParent(preview, "error", "UI5 bootstrap not available");
      }
    }

    var bootstrapScript = document.getElementById("sap-ui-bootstrap");
    if (global.sap && sap.ui && sap.ui.getCore) {
      bindUi5Init();
    } else if (bootstrapScript) {
      bootstrapScript.addEventListener("load", bindUi5Init, { once: true });
      bootstrapScript.addEventListener(
        "error",
        function () {
          notifyParent(preview, "error", "Failed to load UI5 bootstrap script");
        },
        { once: true },
      );
    } else {
      notifyParent(preview, "error", "UI5 bootstrap tag not found");
    }
  }

  function start(preview) {
    if (!preview || typeof preview !== "object") {
      notifyParent({}, "error", "Invalid preview payload");
      return;
    }

    bindUi5AndStart(preview);
  }

  global.FioriPreviewRuntime = {
    start: start,
  };
})(window);
