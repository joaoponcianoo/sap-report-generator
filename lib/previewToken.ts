import { createHmac, timingSafeEqual } from "crypto";
import {
  type PreviewControllerConfig,
  normalizePreviewControllerConfig,
} from "@/lib/preview/controllerConfig";

export interface PreviewPayload {
  name: string;
  viewXml: string;
  controller: PreviewControllerConfig;
  modelData: Record<string, unknown>;
  createdAt: string;
}

interface SignedPreviewPayloadV2 extends PreviewPayload {
  v: 2;
  exp: number;
}

interface SignedPreviewPayloadV1 {
  name: string;
  viewXml: string;
  controllerJs: string;
  modelData: Record<string, unknown>;
  createdAt: string;
  v: 1;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60;
const SECRET_FALLBACK = "local-preview-secret-change-in-production";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSecret(): string {
  // Em producao, sempre configure PREVIEW_TOKEN_SECRET.
  return process.env.PREVIEW_TOKEN_SECRET || SECRET_FALLBACK;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function signPayload(payloadBase64Url: string): string {
  return createHmac("sha256", getSecret())
    .update(payloadBase64Url)
    .digest("base64url");
}

export function createPreviewToken(
  payload: PreviewPayload,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  // Formato: base64url(payload_assinado).assinatura_hmac
  const signedPayload: SignedPreviewPayloadV2 = {
    ...payload,
    v: 2,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadBase64Url = toBase64Url(JSON.stringify(signedPayload));
  const signature = signPayload(payloadBase64Url);

  return `${payloadBase64Url}.${signature}`;
}

function isValidCommonFields(
  parsed: Record<string, unknown>,
  nowUnix: number,
): parsed is {
  name: string;
  viewXml: string;
  modelData: Record<string, unknown>;
  createdAt: string;
  exp: number;
  v: number;
} {
  return (
    typeof parsed.v === "number" &&
    typeof parsed.exp === "number" &&
    parsed.exp >= nowUnix &&
    typeof parsed.name === "string" &&
    typeof parsed.viewXml === "string" &&
    typeof parsed.createdAt === "string" &&
    isRecord(parsed.modelData)
  );
}

export function parsePreviewToken(token: string): PreviewPayload | null {
  const [payloadBase64Url, signature] = token.split(".");
  if (!payloadBase64Url || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payloadBase64Url);
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
  const actualBuffer = Buffer.from(signature, "utf-8");

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    // Assinatura invalida.
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payloadBase64Url)) as Record<
      string,
      unknown
    >;
    const nowUnix = Math.floor(Date.now() / 1000);

    if (!isValidCommonFields(parsed, nowUnix)) {
      return null;
    }

    if (parsed.v === 2) {
      return {
        name: parsed.name,
        viewXml: parsed.viewXml,
        controller: normalizePreviewControllerConfig(
          (parsed as Record<string, unknown>).controller,
        ),
        modelData: parsed.modelData,
        createdAt: parsed.createdAt,
      };
    }

    if (
      parsed.v === 1 &&
      typeof (parsed as Record<string, unknown>).controllerJs === "string"
    ) {
      // Compatibilidade legada: payload antigo com controllerJs.
      const legacy = parsed as unknown as SignedPreviewPayloadV1;
      return {
        name: legacy.name,
        viewXml: legacy.viewXml,
        controller: normalizePreviewControllerConfig(null),
        modelData: legacy.modelData,
        createdAt: legacy.createdAt,
      };
    }

    return null;
  } catch {
    return null;
  }
}
