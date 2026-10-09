import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { handleRequest } from "./handler";

BunnySDK.net.http.serve((request: Request): Promise<Response> =>
  handleRequest(request, {
    backendBaseUrl: readRequiredEnv("BACKEND_BASE_URL"),
    edgeSecret: readRequiredEnv("VIDEO_EDGE_SHARED_SECRET"),
  }),
);

function readRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
