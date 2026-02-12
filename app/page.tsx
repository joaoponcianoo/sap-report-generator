"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UI5Table } from "@/components/ui5-table";
import { FioriPreviewFrame } from "@/components/fiori-preview-frame";
import { AppLayout } from "@/components/app-layout";
import { generateMockData } from "@/lib/mockDataGenerator";
import { PreviewCreateResponse, ReportConfig } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportConfig, setReportConfig] = useState<ReportConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt describing your report fields");
      return;
    }

    setLoading(true);
    setError(null);
    setReportConfig(null);
    setPreviewId(null);
    setPreviewUrl(null);
    setPreviewError(null);

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
        throw new Error(errorData.error || "Failed to generate report");
      }

      const data = await response.json();

      if (
        !data.fields ||
        !Array.isArray(data.fields) ||
        data.fields.length === 0
      ) {
        throw new Error("No fields were generated from your prompt");
      }

      const mockData = generateMockData(data.fields, 10);

      const config = {
        fields: data.fields,
        mockData,
      };

      setReportConfig(config);

      try {
        const previewResponse = await fetch("/api/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Generated Report Preview",
            fields: config.fields,
            mockData: config.mockData,
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
      }
    } catch (err) {
      console.error("Error generating report:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while generating the report",
      );
    } finally {
      setLoading(false);
    }
  };

  const examplePrompts = [
    "I need a report with Order, Item, Quantity, Status, and Delivery Date",
    "Create a report showing Customer, Product, Amount, and Order Date",
    "Show me Sales Order, Material, Quantity, Price, and Total Amount",
  ];

  return (
    <AppLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="grid gap-8">
          {/* Page Title */}
          <div>
            <h2 className="text-3xl font-bold text-sap-shell mb-2">
              Generate Report
            </h2>
            <p className="text-muted-foreground">
              Use AI to map your field requirements to SAP CDS views
            </p>
          </div>

          {/* Input Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sap-blue" />
                Describe Your Report
              </CardTitle>
              <CardDescription>
                Tell us what fields you need in your report, and our AI agent
                will map them to SAP CDS fields
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
                  placeholder="Example: I need a report with Order, Item, Quantity, Status, and Text fields"
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

              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Report Preview
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Field Mapping Display */}
          {reportConfig && (
            <Card>
              <CardHeader>
                <CardTitle>Field Mappings</CardTitle>
                <CardDescription>
                  AI-generated CDS field mappings based on your requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                      </tr>
                    </thead>
                    <tbody>
                      {reportConfig.fields.map((field, index) => (
                        <tr
                          key={index}
                          className="border-b border-sap-border hover:bg-sap-gray"
                        >
                          <td className="py-2 px-4 text-sm font-medium">
                            {field.displayName}
                          </td>
                          <td className="py-2 px-4 text-sm text-sap-blue">
                            {field.cdsView}
                          </td>
                          <td className="py-2 px-4 text-sm font-mono text-gray-600">
                            {field.cdsField}
                          </td>
                          <td className="py-2 px-4 text-sm">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                              {field.type}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Report Preview */}
          {reportConfig && (
            <Card>
              <CardHeader>
                <CardTitle>UI5 Report Preview</CardTitle>
                <CardDescription>
                  Preview of your report with generated mock data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UI5Table
                  fields={reportConfig.fields}
                  data={reportConfig.mockData}
                />
              </CardContent>
            </Card>
          )}

          {reportConfig && (
            <Card ref={previewCardRef}>
              <CardHeader>
                <CardTitle>Fiori App Sandbox Preview</CardTitle>
                <CardDescription>
                  Isolated iframe preview rendered by UI5 runtime
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
                  <div className="flex h-[520px] items-center justify-center rounded-lg border border-sap-border bg-sap-gray text-sm text-muted-foreground">
                    Unable to start sandbox preview for this report.
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
