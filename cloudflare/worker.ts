import { RoomDurableObject } from "./room";
import { handleLiveToken } from "./live";
import { handleHealth, handleTts } from "./tts";
import { sanitizeRoomId } from "../src/game/multiplayer";

export interface Env {
  ROOM: DurableObjectNamespace<RoomDurableObject>;
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  TTS_RATE_LIMIT_PER_IP?: string;
  TTS_MAX_CONCURRENCY?: string;
  LIVE_RATE_LIMIT_PER_IP?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return handleHealth(env);
    }

    if (url.pathname === "/api/tts" && request.method === "POST") {
      return handleTts(request, env);
    }

    if (url.pathname === "/multiplayer" && request.method === "GET") {
      const roomId = sanitizeRoomId(url.searchParams.get("room") || undefined);
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      return stub.fetch(request);
    }

    if (url.pathname === "/api/live-token" && request.method === "GET") {
      return handleLiveToken(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export { RoomDurableObject };
