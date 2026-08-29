import { NextResponse, type NextRequest } from "next/server";

const development = process.env.NODE_ENV !== "production";
const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || "";
const devConnect = apiOrigin ? ` ${apiOrigin} ${apiOrigin.replace(/^http/, "ws")}` : "";

const policy = (nonce: string) =>
  [
    "default-src 'self'",
    development
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://cdn.discordapp.com data: blob:",
    `connect-src 'self'${development ? devConnect : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = policy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
