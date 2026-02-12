import { createHmac, timingSafeEqual } from "crypto";

export interface PreviewPayload {
  name: string;
  viewXml: string;
  controllerJs: string;
  modelData: Record<string, unknown>;
  createdAt: string;
}

interface SignedPreviewPayload extends PreviewPayload {
  v: 1;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60;
const SECRET_FALLBACK = "local-preview-secret-change-in-production";

function getSecret(): string {
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
  const signedPayload: SignedPreviewPayload = {
    ...payload,
    v: 1,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadBase64Url = toBase64Url(JSON.stringify(signedPayload));
  const signature = signPayload(payloadBase64Url);

  return `${payloadBase64Url}.${signature}`;
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
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payloadBase64Url)) as Partial<SignedPreviewPayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Math.floor(Date.now() / 1000) ||
      typeof parsed.name !== "string" ||
      typeof parsed.viewXml !== "string" ||
      typeof parsed.controllerJs !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.modelData !== "object" ||
      parsed.modelData === null
    ) {
      return null;
    }

    return {
      name: parsed.name,
      viewXml: parsed.viewXml,
      controllerJs: parsed.controllerJs,
      modelData: parsed.modelData as Record<string, unknown>,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}
