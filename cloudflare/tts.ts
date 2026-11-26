interface TtsEnv {
  GEMINI_API_KEY?: string;
  TTS_RATE_LIMIT_PER_IP?: string;
  TTS_MAX_CONCURRENCY?: string;
}

const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"] as const;
const ttsCache = new Map<string, { audio: string; model: string }>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let ttsInFlight = 0;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function safeGeminiError(value: string, apiKey: string): string {
  return value.replaceAll(apiKey, "[redacted]").replace(/([?&]key=)[^&\s]+/gi, "$1[redacted]");
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function handleHealth(env: TtsEnv): Response {
  return json({
    ok: true,
    geminiConfigured: Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
    liveModel: "gemini-3.8-live",
    ttsModel: TTS_MODELS[0],
    ttsFallbackModel: TTS_MODELS[1],
  });
}

export async function handleTts(request: Request, env: TtsEnv): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Origin tidak diizinkan." }, 403);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const limit = positiveInt(env.TTS_RATE_LIMIT_PER_IP, 30);
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    if (rateBuckets.size >= 10_000) {
      const oldest = rateBuckets.keys().next().value;
      if (oldest) rateBuckets.delete(oldest);
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
  } else {
    if (bucket.count >= limit) {
      return json(
        { error: "Terlalu banyak permintaan TTS. Coba lagi nanti." },
        429,
        { "Retry-After": String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))) },
      );
    }
    bucket.count += 1;
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return json({ error: "GEMINI_API_KEY belum tersedia." }, 503);
  }

  let body: { text?: unknown; rate?: unknown };
  try {
    body = (await request.json()) as { text?: unknown; rate?: unknown };
  } catch {
    return json({ error: "Permintaan TTS tidak valid." }, 400);
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const rate = typeof body.rate === "number" && Number.isFinite(body.rate)
    ? Math.max(0.5, Math.min(1.5, body.rate))
    : 0.9;
  if (!rawText || rawText.length > 260) {
    return json({ error: "Teks TTS tidak valid (maksimal 260 karakter)." }, 400);
  }

  const paceStyle = rate < 0.82
    ? "slow, very clear beginner Mandarin pronunciation with distinct tones"
    : rate > 0.98
      ? "natural conversational Mandarin pace with clear tones"
      : "steady, clear Mandarin teacher pace with distinct tones";
  const cacheKey = `${paceStyle}::${rawText}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    return json({ audioBase64: cached.audio, mimeType: "audio/wav", cached: true, model: cached.model });
  }

  const maxConcurrency = positiveInt(env.TTS_MAX_CONCURRENCY, 6);
  if (ttsInFlight >= maxConcurrency) {
    return json({ error: "Layanan TTS sedang penuh. Coba lagi sebentar." }, 503, { "Retry-After": "1" });
  }

  ttsInFlight += 1;
  try {
    let lastError = "Model TTS gagal membuat audio.";
    let lastStatus = 502;
    for (const model of TTS_MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [{
                  text: rawText,
                  ...(model === TTS_MODELS[0] ? {
                    speechMetadata: {
                      style: `Mandarin Chinese language instructor Lǎoshī Lín speaking in ${paceStyle}`,
                    },
                  } : {}),
                }],
              }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
              },
            }),
          },
        );
        if (!response.ok) {
          const message = await response.text();
          lastError = safeGeminiError(message || "Model TTS gagal membuat audio.", apiKey);
          if (response.status === 429) {
            lastStatus = 429;
            continue;
          }
          return json({ error: lastError }, 502);
        }
        const payload = await response.json() as {
          candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
        };
        const audio = payload.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!audio) {
          lastError = "Model TTS tidak mengembalikan data audio.";
          continue;
        }
        if (ttsCache.size >= 80) {
          const oldest = ttsCache.keys().next().value;
          if (oldest) ttsCache.delete(oldest);
        }
        ttsCache.set(cacheKey, { audio, model });
        return json({ audioBase64: audio, mimeType: "audio/wav", cached: false, model });
      } catch (error) {
        lastError = safeGeminiError(error instanceof Error ? error.message : "Gagal membuat audio TTS.", apiKey);
      }
    }
    return json({ error: lastError }, lastStatus);
  } finally {
    ttsInFlight = Math.max(0, ttsInFlight - 1);
  }
}
