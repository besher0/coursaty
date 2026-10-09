import { handleRequest, rewritePlaylist, SESSION_HEADER } from "./handler";

/**
 * Edge gateway behaviour. Runs with the backend Jest suite (`npm test`).
 * The backend authorize endpoint and the Bunny origin are faked.
 */
const guid = "11111111-1111-4111-8111-111111111111";
const gateway = "https://video-gw.coursaty.example";
const config = { backendBaseUrl: "https://api.example/", edgeSecret: "edge-secret" };
const signedOrigin = `https://vz-abc.b-cdn.net/bcdn_token=HS256-x&expires=9&token_path=%2F${guid}%2F/${guid}`;

function fakeNetwork(options: {
  authStatus?: number;
  allowed?: boolean;
  originBody?: string;
  originType?: string;
} = {}) {
  const calls: Request[] = [];
  const fetchImpl = async (input: Request) => {
    calls.push(input);
    if (input.url.startsWith("https://api.example/internal/video-edge/authorize")) {
      return new Response(
        JSON.stringify({
          allowed: options.allowed ?? true,
          sourceUrl: `${signedOrigin}${new URL((await input.clone().json()).path, gateway).pathname.replace(`/${guid}`, "")}`,
        }),
        { status: options.authStatus ?? 201, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(options.originBody ?? "segment-bytes", {
      status: 200,
      headers: {
        "Content-Type": options.originType ?? "video/mp2t",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  };
  return { calls, fetchImpl };
}

function mediaRequest(path: string, headers: Record<string, string> = {}) {
  return new Request(`${gateway}${path}`, { headers });
}

describe("video edge gateway", () => {
  it("rejects a copied URL opened without the session header (403)", async () => {
    const net = fakeNetwork();
    const response = await handleRequest(
      mediaRequest(`/${guid}/playlist.m3u8`),
      config,
      net.fetchImpl,
    );

    expect(response.status).toBe(403);
    expect(net.calls).toHaveLength(0);
  });

  it("rejects tokens passed in the query string", async () => {
    const net = fakeNetwork();
    const response = await handleRequest(
      mediaRequest(`/${guid}/playlist.m3u8?token=abc`, { [SESSION_HEADER]: "abc" }),
      config,
      net.fetchImpl,
    );

    expect(response.status).toBe(403);
    expect(net.calls).toHaveLength(0);
  });

  it("returns 403 when the backend denies the token (wrong, expired, other video)", async () => {
    const net = fakeNetwork({ authStatus: 403 });
    const response = await handleRequest(
      mediaRequest(`/${guid}/playlist.m3u8`, { [SESSION_HEADER]: "wrong" }),
      config,
      net.fetchImpl,
    );

    expect(response.status).toBe(403);
    expect(net.calls).toHaveLength(1); // authorize only, never the origin
  });

  it("rejects paths that are not inside a video directory", async () => {
    const net = fakeNetwork();
    for (const path of [`/${guid}`, "/"]) {
      const response = await handleRequest(
        mediaRequest(path, { [SESSION_HEADER]: "t" }),
        config,
        net.fetchImpl,
      );
      expect(response.status).toBe(403);
    }
    expect(net.calls).toHaveLength(0);
  });

  it("authorizes a traversal attempt against the other video, which the backend denies", async () => {
    // URL parsing normalizes `/<guid>/../other/...` to `/other/...`, so the
    // edge asks about video "other"; a session for <guid> does not match it.
    const net = fakeNetwork({ authStatus: 403 });
    const response = await handleRequest(
      mediaRequest(`/${guid}/../other/playlist.m3u8`, { [SESSION_HEADER]: "t" }),
      config,
      net.fetchImpl,
    );

    expect(response.status).toBe(403);
    expect((await net.calls[0].json()).bunnyVideoId).toBe("other");
    expect(net.calls).toHaveLength(1);
  });

  it("asks the backend with the shared secret, then serves the signed origin", async () => {
    const net = fakeNetwork();
    const response = await handleRequest(
      mediaRequest(`/${guid}/720p/video0.ts`, {
        [SESSION_HEADER]: "good-token",
        Range: "bytes=0-99",
      }),
      config,
      net.fetchImpl,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("segment-bytes");
    const [authorize, origin] = net.calls;
    expect(authorize.headers.get("X-Edge-Auth")).toBe("edge-secret");
    expect(await authorize.json()).toEqual({
      sessionToken: "good-token",
      method: "GET",
      bunnyVideoId: guid,
      path: `/${guid}/720p/video0.ts`,
    });
    expect(origin.url).toContain("b-cdn.net"); // only the edge ever sees Bunny
    expect(origin.headers.get("Range")).toBe("bytes=0-99");
    expect(origin.headers.get(SESSION_HEADER)).toBeNull(); // token not forwarded
  });

  it("never lets a shared cache keep authorized media", async () => {
    const net = fakeNetwork();
    const response = await handleRequest(
      mediaRequest(`/${guid}/720p/video0.ts`, { [SESSION_HEADER]: "good-token" }),
      config,
      net.fetchImpl,
    );

    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rewrites absolute Bunny URLs inside playlists to the gateway", async () => {
    const net = fakeNetwork({
      originType: "application/vnd.apple.mpegurl",
      originBody: [
        "#EXTM3U",
        "#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720",
        `https://vz-abc.b-cdn.net/bcdn_token=HS256-x&expires=9&token_path=%2F${guid}%2F/${guid}/720p/video.m3u8`,
        "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360",
        "360p/video.m3u8",
      ].join("\n"),
    });
    const response = await handleRequest(
      mediaRequest(`/${guid}/playlist.m3u8`, { [SESSION_HEADER]: "good-token" }),
      config,
      net.fetchImpl,
    );

    const body = await response.text();
    expect(body).not.toContain("b-cdn.net");
    expect(body).toContain(`${gateway}/${guid}/720p/video.m3u8`);
    expect(body).toContain("\n360p/video.m3u8"); // relative stays relative
    expect(response.headers.get("Content-Length")).toBeNull();
  });

  it("denies non-GET methods", async () => {
    const response = await handleRequest(
      new Request(`${gateway}/${guid}/playlist.m3u8`, {
        method: "POST",
        headers: { [SESSION_HEADER]: "t" },
      }),
      config,
      fakeNetwork().fetchImpl,
    );
    expect(response.status).toBe(405);
  });
});

describe("rewritePlaylist", () => {
  it("rewrites URI attributes of keys and init segments", () => {
    const out = rewritePlaylist(
      [
        `#EXT-X-KEY:METHOD=AES-128,URI="https://vz-abc.b-cdn.net/${guid}/720p/key.key?token=t&expires=1"`,
        `#EXT-X-MAP:URI="init.mp4"`,
        "#EXTINF:6.0,",
        `https://cdn.other.example/${guid}/720p/video0.ts`,
      ].join("\n"),
      gateway,
    );

    expect(out).toContain(`URI="${gateway}/${guid}/720p/key.key"`);
    expect(out).toContain(`#EXT-X-MAP:URI="init.mp4"`);
    expect(out).toContain(`${gateway}/${guid}/720p/video0.ts`);
    expect(out).not.toMatch(/b-cdn\.net|cdn\.other\.example|token=/);
  });

  it("leaves relative and root-relative references unchanged", () => {
    const input = ["#EXTM3U", "video0.ts", `/${guid}/720p/video1.ts`].join("\n");
    expect(rewritePlaylist(input, gateway)).toBe(input);
  });
});
