"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";

type PreviewStatus = "loading" | "ready" | "error";

interface PreviewMessage {
  channel?: string;
  previewId?: string;
  status?: PreviewStatus;
  error?: string | null;
}

interface FioriPreviewFrameProps {
  previewId: string;
  previewUrl?: string;
  className?: string;
}

export function FioriPreviewFrame({
  previewId,
  previewUrl,
  className,
}: FioriPreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewState, setPreviewState] = useState<{
    previewId: string;
    status: PreviewStatus;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data;
      if (!data || data.channel !== "fiori-preview") {
        return;
      }

      if (data.previewId !== previewId) {
        return;
      }

      if (data.status === "ready") {
        setPreviewState({
          previewId,
          status: "ready",
          error: null,
        });
        return;
      }

      if (data.status === "error") {
        setPreviewState({
          previewId,
          status: "error",
          error: data.error || "Failed to render preview",
        });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [previewId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreviewState((current) => {
        if (current?.previewId === previewId) {
          return current;
        }

        return {
          previewId,
          status: "error",
          error:
            "Timeout while loading UI5 preview. Check network access to ui5.sap.com.",
        };
      });
    }, 12000);

    return () => window.clearTimeout(timer);
  }, [previewId]);

  const src = useMemo(
    () => previewUrl || `/api/preview/${previewId}`,
    [previewId, previewUrl],
  );
  const status: PreviewStatus =
    previewState?.previewId === previewId ? previewState.status : "loading";
  const error =
    previewState?.previewId === previewId ? previewState.error : null;

  return (
    <div className={className}>
      <div className="relative min-h-130 rounded-lg border border-sap-border bg-white">
        {status !== "ready" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
            {status === "loading" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Fiori sandbox...
              </div>
            ) : (
              <div className="max-w-105 p-4 text-center">
                <div className="mb-2 flex items-center justify-center gap-2 text-red-600">
                  <TriangleAlert className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Failed to load preview
                  </span>
                </div>
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}
          </div>
        )}
        <iframe
          ref={iframeRef}
          title="Fiori App Preview"
          src={src}
          className="h-130 w-full rounded-lg"
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          loading="lazy"
        />
      </div>
    </div>
  );
}
