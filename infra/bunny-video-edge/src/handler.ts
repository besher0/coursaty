/**
 * Coursaty video gateway (Bunny Edge Script), kept free of the Bunny SDK so it
 * can be unit tested. Every media request (master playlist, quality playlists,
 * segments, keys) must carry the session header; the backend decides and signs
 * the Bunny origin URL, which never leaves the edge.
 */
export const SESSION_HEADER = "X-Coursaty-Playback-Session";

export type EdgeConfig = {
  backendBaseUrl: string;
  edgeSecret: string;
};

export type FetchLike = (input: Request) => Promise<Response>;

type AuthorizeDecision = { allowed?: boolean; sourceUrl?: string };

export async function handleRequest(
  request: Request,
  config: EdgeConfig,
  fetchImpl: FetchLike = (input) => fetch(input),
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const sessionToken = request.headers.get(SESSION_HEADER)?.trim();
  // Tokens are accepted from the header only, so a copied URL is useless.
  if (
    !sessionToken ||
    url.searchParams.has("token") ||
    url.searchParams.has("sessionToken")
  ) {
    return forbidden();
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const bunnyVideoId = segments[0] ?? "";
  if (!isSafeMediaPath(url.pathname, bunnyVideoId)) return forbidden();

  const backendBaseUrl = config.backendBaseUrl.replace(/\/+$/, "");
  let decision: AuthorizeDecision;
  try {
    const authResponse = await fetchImpl(
      new Request(`${backendBaseUrl}/internal/video-edge/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Edge-Auth": config.edgeSecret,
        },
        body: JSON.stringify({
          sessionToken,
          method: request.method,
          bunnyVideoId,
          path: url.pathname,
        }),
      }),
    );
    if (!authResponse.ok) return forbidden();
    decision = (await authResponse.json()) as AuthorizeDecision;
  } catch {
    return forbidden();
  }
  if (!decision.allowed || !decision.sourceUrl) return forbidden();

  const origin = await fetchImpl(
    new Request(decision.sourceUrl, {
      method: request.method,
      headers: filterOriginHeaders(request.headers),
    }),
  );
  return finalizeResponse(origin, url);
}

async function finalizeResponse(origin: Response, requestUrl: URL) {
  const headers = new Headers(origin.headers);
  // Authorized media must never be stored by a shared cache: a cached copy
  // would be served to the next request with no session header at all.
  headers.set("Cache-Control", "private, no-store");
  headers.delete("Set-Cookie");

  if (origin.ok && isPlaylistPath(requestUrl.pathname)) {
    const text = await origin.text();
    headers.delete("Content-Length");
    return new Response(rewritePlaylist(text, requestUrl.origin), {
      status: origin.status,
      headers,
    });
  }
  return new Response(origin.body, {
    status: origin.status,
    statusText: origin.statusText,
    headers,
  });
}

/**
 * Keeps every playlist reference on the gateway. Relative references already
 * resolve against the gateway URL and are left untouched; absolute ones
 * (e.g. a Bunny `https://vz-….b-cdn.net/…` host, possibly with a path token)
 * are rewritten to the same path on the gateway origin.
 */
export function rewritePlaylist(text: string, gatewayOrigin: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(
          /URI="([^"]+)"/g,
          (match, uri: string) =>
            isAbsoluteHttpUrl(uri)
              ? `URI="${toGatewayUrl(uri, gatewayOrigin)}"`
              : match,
        );
      }
      return isAbsoluteHttpUrl(trimmed)
        ? toGatewayUrl(trimmed, gatewayOrigin)
        : line;
    })
    .join("\n");
}

function toGatewayUrl(absolute: string, gatewayOrigin: string): string {
  const parsed = new URL(absolute);
  const path = parsed.pathname
    .split("/")
    .filter((segment) => segment && !segment.startsWith("bcdn_token="))
    .join("/");
  for (const key of ["token", "expires", "token_path", "bcdn_token"]) {
    parsed.searchParams.delete(key);
  }
  const query = parsed.searchParams.toString();
  return `${gatewayOrigin.replace(/\/+$/, "")}/${path}${query ? `?${query}` : ""}`;
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isPlaylistPath(pathname: string): boolean {
  return pathname.toLowerCase().endsWith(".m3u8");
}

export function isSafeMediaPath(pathname: string, bunnyVideoId: string): boolean {
  if (!bunnyVideoId) return false;
  if (pathname.includes("..") || pathname.includes("\\")) return false;
  if (!pathname.startsWith(`/${bunnyVideoId}/`)) return false;
  return true;
}

function filterOriginHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  const range = headers.get("Range");
  const accept = headers.get("Accept");
  const userAgent = headers.get("User-Agent");
  if (range) forwarded.set("Range", range);
  if (accept) forwarded.set("Accept", accept);
  if (userAgent) forwarded.set("User-Agent", userAgent);
  return forwarded;
}

function forbidden() {
  return new Response("Forbidden", {
    status: 403,
    headers: { "Cache-Control": "private, no-store" },
  });
}
