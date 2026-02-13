"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FioriPreviewFrame } from "@/components/fiori-preview-frame";
import { AppLayout } from "@/components/app-layout";
import { generateMockData } from "@/lib/mockDataGenerator";
import { FieldMapping, PreviewCreateResponse } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";

interface FieldSelection {
  field: FieldMapping;
  includeInTable: boolean;
  includeInFilter: boolean;
}

function shouldDefaultAsFilter(field: FieldMapping, index: number): boolean {
  const name = `${field.displayName} ${field.cdsField}`.toLowerCase();
  if (field.type === "date" || field.type === "boolean") {
    return true;
  }

  return (
    /status|date|customer|order|pedido|cliente|data/.test(name) || index < 2
  );
}

function uniqueFields(fields: FieldMapping[]): FieldMapping[] {
  const map = new Map<string, FieldMapping>();
  fields.forEach((field) => {
    const key = `${field.cdsView}|${field.cdsField}|${field.displayName}`;
    if (!map.has(key)) {
      map.set(key, field);
    }
  });

  return Array.from(map.values());
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [selections, setSelections] = useState<FieldSelection[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mappingNotice, setMappingNotice] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!previewId) {
      return;
    }

    previewCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [previewId]);

  const hasMappings = selections.length > 0;
  const tableFields = useMemo(
    () =>
      selections
        .filter((item) => item.includeInTable)
        .map((item) => item.field),
    [selections],
  );
  const filterFields = useMemo(
    () =>
      selections
        .filter((item) => item.includeInFilter)
        .map((item) => item.field),
    [selections],
  );

  const updateSelection = (
    index: number,
    patch: Partial<Pick<FieldSelection, "includeInTable" | "includeInFilter">>,
  ) => {
    setSelections((current) =>
      current.map((item, idx) =>
        idx === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const handleAnalyze = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt describing your report fields");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setMappingNotice(null);
    setPreviewId(null);
    setPreviewUrl(null);
    setPreviewError(null);
    setSelections([]);

    try {
      const response = await fetch("/api/map-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to map fields");
      }

      const data = await response.json();

      if (data?._meta?.source && data._meta.source !== "openai") {
        const reason = data?._meta?.reason ? ` (${data._meta.reason})` : "";
        setMappingNotice(
          `Mapping generated via fallback: ${data._meta.source}${reason}.`,
        );
      }
      if (!Array.isArray(data.fields) || data.fields.length === 0) {
        throw new Error("No fields were generated from your prompt");
      }
      setSelections(
        (data.fields as FieldMapping[]).map((field, index) => ({
          field,
          includeInTable: true,
          includeInFilter: shouldDefaultAsFilter(field, index),
        })),
      );
    } catch (err) {
      console.error("Error mapping fields:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while mapping report fields",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!hasMappings) {
      setError("Run field mapping first.");
      return;
    }

    if (tableFields.length === 0) {
      setError("Select at least one field to display in the table.");
      return;
    }

    const dataFields = uniqueFields([...tableFields, ...filterFields]);
    const mockData = generateMockData(dataFields, 12);

    setGeneratingPreview(true);
    setError(null);
    setPreviewId(null);
    setPreviewUrl(null);
    setPreviewError(null);

    try {
      const previewResponse = await fetch("/api/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: reportTitle.trim() || "Generated Report",
          fields: tableFields,
          filterFields,
          mockData,
        }),
      });

      if (!previewResponse.ok) {
        const previewErrorData = await previewResponse
          .json()
          .catch(() => ({ error: null }));
        throw new Error(
          previewErrorData.error || "Failed to create Fiori preview",
        );
      }

      const previewData =
        (await previewResponse.json()) as PreviewCreateResponse;
      if (!previewData.previewId) {
        throw new Error("Preview API did not return a preview ID");
      }

      setPreviewId(previewData.previewId);
      setPreviewUrl(previewData.previewUrl || null);
    } catch (previewErr) {
      console.error("Error creating preview:", previewErr);
      setPreviewError(
        previewErr instanceof Error
          ? previewErr.message
          : "Failed to create Fiori preview",
      );
    } finally {
      setGeneratingPreview(false);
    }
  };

  const examplePrompts = [
    "Quero um relatório de vendas com Pedido, Item, Quantidade, Status e Data de Entrega",
    "Show me Sales Order, Material, Quantity, Price and Total Amount",
  ];

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="grid gap-8">
          <div>
            <h2 className="text-3xl font-bold text-sap-shell mb-2">
              Generate Report
            </h2>
            <p className="text-muted-foreground">
              Step 1: describe the report. Step 2: choose title, table fields,
              and filter fields.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sap-blue" />
                Prompt
              </CardTitle>
              <CardDescription>
                Describe your report, then review field mappings before
                generating the Fiori preview.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label
                  htmlFor="prompt"
                  className="text-sm font-medium text-gray-700 mb-2 block"
                >
                  Report Requirements
                </label>
                <Textarea
                  id="prompt"
                  placeholder="Example: I need a report with Order, Item, Quantity, Status, and Delivery Date"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Try these examples:
                </p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((example, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => setPrompt(example)}
                      className="text-xs"
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}
              {mappingNotice && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-md text-sm">
                  {mappingNotice}
                </div>
              )}

              <Button
                onClick={handleAnalyze}
                disabled={analyzing || generatingPreview || !prompt.trim()}
                className="w-full"
                size="lg"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Mapping Fields...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analyze Prompt
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {hasMappings && (
            <Card>
              <CardHeader>
                <CardTitle>Field Mappings</CardTitle>
                <CardDescription>
                  Confirm report title, table columns, and which fields should
                  be available as filters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <label
                    htmlFor="report-title"
                    className="text-sm font-medium text-gray-700 mb-2 block"
                  >
                    Report Title
                  </label>
                  <Input
                    id="report-title"
                    value={reportTitle}
                    onChange={(event) => setReportTitle(event.target.value)}
                    placeholder="Enter report title"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-sap-border">
                        <th className="text-left py-2 px-4 text-sm font-semibold text-sap-shell">
                          Display Name
                        </th>
                        <th className="text-left py-2 px-4 text-sm font-semibold text-sap-shell">
                          CDS View
                        </th>
                        <th className="text-left py-2 px-4 text-sm font-semibold text-sap-shell">
                          CDS Field
                        </th>
                        <th className="text-left py-2 px-4 text-sm font-semibold text-sap-shell">
                          Type
                        </th>
                        <th className="text-center py-2 px-4 text-sm font-semibold text-sap-shell">
                          Show in Table
                        </th>
                        <th className="text-center py-2 px-4 text-sm font-semibold text-sap-shell">
                          Use as Filter
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selections.map((selection, index) => (
                        <tr
                          key={`${selection.field.cdsView}.${selection.field.cdsField}.${selection.field.displayName}`}
                          className="border-b border-sap-border hover:bg-sap-gray"
                        >
                          <td className="py-2 px-4 text-sm font-medium">
                            {selection.field.displayName}
                          </td>
                          <td className="py-2 px-4 text-sm text-sap-blue">
                            {selection.field.cdsView}
                          </td>
                          <td className="py-2 px-4 text-sm font-mono text-gray-600">
                            {selection.field.cdsField}
                          </td>
                          <td className="py-2 px-4 text-sm">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              {selection.field.type}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={selection.includeInTable}
                              onChange={(event) =>
                                updateSelection(index, {
                                  includeInTable: event.target.checked,
                                })
                              }
                              className="h-4 w-4 accent-blue-600"
                            />
                          </td>
                          <td className="py-2 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={selection.includeInFilter}
                              onChange={(event) =>
                                updateSelection(index, {
                                  includeInFilter: event.target.checked,
                                })
                              }
                              className="h-4 w-4 accent-blue-600"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Button
                  onClick={handleGeneratePreview}
                  disabled={generatingPreview || analyzing}
                  className="w-full"
                  size="lg"
                >
                  {generatingPreview ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Fiori Preview...
                    </>
                  ) : (
                    "Generate Fiori App Sandbox Preview"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {hasMappings && (
            <Card ref={previewCardRef}>
              <CardHeader>
                <CardTitle>Fiori App Sandbox Preview</CardTitle>
                <CardDescription>
                  Preview with filter controls based on the fields marked as
                  filters.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {previewError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm">
                    {previewError}
                  </div>
                )}

                {previewId ? (
                  <FioriPreviewFrame
                    previewId={previewId}
                    previewUrl={previewUrl ?? undefined}
                  />
                ) : (
                  <div className="flex h-130 items-center justify-center rounded-lg border border-sap-border bg-sap-gray text-sm text-muted-foreground">
                    Configure the title and fields, then click &quot;Generate
                    Fiori App Sandbox Preview&quot;.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
