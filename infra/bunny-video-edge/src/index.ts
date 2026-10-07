import * as BunnySDK from "@bunny.net/edgescript-sdk";

const SESSION_HEADER = "X-Coursaty-Playback-Session";

BunnySDK.net.http.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const backendBaseUrl = readRequiredEnv("BACKEND_BASE_URL").replace(/\/+$/, "");
  const edgeSecret = readRequiredEnv("VIDEO_EDGE_SHARED_SECRET");
  const url = new URL(request.url);
  const sessionToken = request.headers.get(SESSION_HEADER);

  if (!sessionToken || url.searchParams.has("token") || url.searchParams.has("sessionToken")) {
    return new Response("Forbidden", { status: 403 });
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const bunnyVideoId = segments[0] ?? "";
  if (!isSafeMediaPath(url.pathname, bunnyVideoId)) {
    return new Response("Forbidden", { status: 403 });
  }

  const authResponse = await fetch(`${backendBaseUrl}/internal/video-edge/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Edge-Auth": edgeSecret,
    },
    body: JSON.stringify({
      sessionToken,
      method: request.method,
      bunnyVideoId,
      path: url.pathname,
    }),
  });

  if (!authResponse.ok) {
    return new Response("Forbidden", { status: 403 });
  }

  const decision = (await authResponse.json()) as { allowed?: boolean; sourceUrl?: string };
  if (!decision.allowed || !decision.sourceUrl) {
    return new Response("Forbidden", { status: 403 });
  }

  const originRequest = new Request(decision.sourceUrl, {
    method: request.method,
    headers: filterOriginHeaders(request.headers),
  });
  return fetch(originRequest);
});

function readRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function isSafeMediaPath(pathname: string, bunnyVideoId: string): boolean {
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
