import express from "express";
import path from "path";
import { createServer as createHttpServer } from "http";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import {
  GenerateVideosOperation,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Type,
} from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

/**
 * Foreign-script detector ported from tharlaimar/recap-en-to-mm/app/recap_planner.py
 * Detects characters that are neither Myanmar (0x1000..0x109F, 0xA9E0..0xA9FF, 0xAA60..0xAA7F)
 * nor Latin (0x0000..0x024F, 0x1E00..0x1EFF) outside parentheses.
 */
function detectForeignLetters(text: string): string[] {
  const bare = String(text || "").replace(/\([^()]*\)/g, "");
  const seen = new Set<string>();
  for (const ch of bare) {
    const code = ch.codePointAt(0) || 0;
    const isLetter = /\p{L}/u.test(ch);
    if (!isLetter) continue;
    const isMyanmar =
      (code >= 0x1000 && code <= 0x109f) ||
      (code >= 0xa9e0 && code <= 0xa9ff) ||
      (code >= 0xaa60 && code <= 0xaa7f);
    const isLatin =
      code <= 0x024f || (code >= 0x1e00 && code <= 0x1eff);
    if (!isMyanmar && !isLatin) {
      seen.add(ch);
    }
  }
  return Array.from(seen);
}

function sanitizeTranslationText(value: string): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const match = text.match(
    /^\[\s*Unused filler adjustment skipped\s*[-–—:]\s*translated faithfully\s*:\s*(.*?)\s*\]$/i
  );
  if (match && match[1]) {
    return match[1].trim();
  }
  return text;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "35mb" }));

  // 1. Build Story Context Memory (ported & upgraded from recap_planner.py build_story_context)
  app.post("/api/recap/story-context", async (req, res) => {
    try {
      const { units, existingMemory, movieTitle } = req.body;
      if (!Array.isArray(units) || units.length === 0) {
        return res.status(400).json({ error: "Transcript units are required." });
      }

      const ai = getGenAIClient();
      const sourceLines = units
        .map(
          (u: { id: number; timestamp?: string; source_text: string }) =>
            `[${String(u.id).padStart(5, "0")}] (${u.timestamp || "00:00"}) ${u.source_text}`
        )
        .join("\n");

      const prompt = `You are building CONTEXT MEMORY for an English-to-Myanmar Movie Recap narrator translation pipeline.
Do not translate the transcript now. Do not write narration. Do not summarize away named facts.
Read this chronological source transcript for "${movieTitle || "Movie Recap"}" and UPDATE the compact context memory.
The memory exists to keep character names, Burmese kinship/pronoun relationships, terminology, locations, identities, and the current story state consistent when translation requests are sent.

RULES:
- Preserve exact character/place/object names as they appear in the source when known, and suggest appropriate Burmese transliteration or kinship role in name_consistency.
- Keep important relationships, aliases, roles, reveals, and terminology.
- Keep plot_state chronological and compact. Do not invent anything.
- Return JSON only with keys: characters, relationships, places, terms, plot_state, name_consistency, unresolved.

EXISTING MEMORY:
${JSON.stringify(
  existingMemory || {
    characters: [],
    relationships: [],
    places: [],
    terms: [],
    plot_state: [],
    name_consistency: [],
    unresolved: [],
  }
)}

SOURCE CHUNK:
${sourceLines}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              characters: { type: Type.ARRAY, items: { type: Type.STRING } },
              relationships: { type: Type.ARRAY, items: { type: Type.STRING } },
              places: { type: Type.ARRAY, items: { type: Type.STRING } },
              terms: { type: Type.ARRAY, items: { type: Type.STRING } },
              plot_state: { type: Type.ARRAY, items: { type: Type.STRING } },
              name_consistency: { type: Type.ARRAY, items: { type: Type.STRING } },
              unresolved: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              "characters",
              "relationships",
              "places",
              "terms",
              "plot_state",
              "name_consistency",
              "unresolved",
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text || "{}").trim());
      return res.json({ memory: parsed });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to build story context memory";
      return res.status(500).json({ error: msg });
    }
  });

  // 2. Context-Aware Burmese Narration Translator (ported from recap_planner.py translate_batch)
  app.post("/api/recap/translate-batch", async (req, res) => {
    try {
      const { current, storyContext, previousContext, nextContext } = req.body;
      if (!Array.isArray(current) || current.length === 0) {
        return res.status(400).json({ error: "Current batch items are required." });
      }

      const ai = getGenAIClient();
      const systemInstruction = `You are a CONTEXT-AWARE BURMESE NARRATION TRANSLATOR.
Translate ONLY the CURRENT English items into smooth, natural spoken Burmese that sounds as if it was originally written by a fluent Burmese movie/story narrator.

CORE PRINCIPLE:
Preserve the SOURCE MEANING and VISUAL EVENTS 100%, NOT the original wording or sentence structure.

NATIVE BURMESE NARRATOR STYLE:
- Use natural spoken Burmese narrator phrasing, rhythm, and connectors (e.g., ဒီလိုနဲ့ပဲ, အဲ့ဒီအချိန်မှာပဲ, သူမကတော့, တကယ်တော့).
- Avoid stiff word-for-word translation; restructure wording and clause order INSIDE THE SAME ID when needed.
- Keep Burmese pronouns, kinship terms, honorifics, gendered self-reference, names, and relationships contextually correct.
- Keep dialogue intent and social register natural without turning ordinary speech into formal literary Burmese (avoid stiff စာ어 مثل ၎င်း၊ ဖြစ်လေသည်; use spoken ဖြစ်ပါတယ်၊ လုပ်ခဲ့တယ်၊ ဆိုပြီး).

HARD RULES:
1. Do NOT remove, condense away, or omit meaningful source information. Every action, event, object, person, relationship, cause/effect, dialogue, and important visual detail must remain in the same ID.
2. Do NOT translate word-for-word when it sounds stiff or machine-like. You MAY restructure wording and clause order INSIDE THE SAME ID.
3. Small expansion is allowed only for clarity/natural flow; never exaggerate or add unrelated filler.
4. Do not invent plot events, opinions, hooks, intros, outros, or facts.
5. Keep every CURRENT ID exactly once, in order. Do not merge or split IDs.
6. Context is READ-ONLY. Never copy events from previous/next context into a current ID.
7. Maintain consistent names, relationships, places, objects, and terminology.
8. Return JSON only with top-level key "items". Each item must contain integer "id" and non-empty string "translation".
9. NEVER include Georgian, Cyrillic, Devanagari, or stray foreign script characters inside Burmese words.`;

      const prompt = `STORY CONTEXT MEMORY (READ-ONLY):
${JSON.stringify(storyContext || {}, null, 2)}

PREVIOUS CONTEXT (READ-ONLY):
${JSON.stringify(previousContext || [])}

CURRENT ITEMS TO TRANSLATE (Translate every ID below into natural spoken Burmese movie narrator style):
${JSON.stringify(
  current.map((item: { id: number; source_text: string }) => ({
    id: item.id,
    source_text: item.source_text,
  })),
  null,
  2
)}

NEXT CONTEXT (READ-ONLY):
${JSON.stringify(nextContext || [])}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    translation: { type: Type.STRING },
                  },
                  required: ["id", "translation"],
                },
              },
            },
            required: ["items"],
          },
        },
      });

      const payload = JSON.parse((response.text || '{"items":[]}').trim());
      const warnings: string[] = [];
      const cleanedItems = (payload.items || []).map(
        (item: { id: number; translation: string }) => {
          let tr = sanitizeTranslationText(item.translation);
          const foreign = detectForeignLetters(tr);
          if (foreign.length > 0) {
            for (const fch of foreign) {
              tr = tr.split(fch).join("");
            }
            warnings.push(
              `ID ${String(item.id).padStart(5, "0")}: removed letters of another script (${foreign.join(" ")})`
            );
          }
          return {
            id: item.id,
            translation: tr,
            foreignScriptCleaned: foreign.length > 0,
          };
        }
      );

      return res.json({ items: cleanedItems, warnings });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to translate batch";
      return res.status(500).json({ error: msg });
    }
  });

  // 3. Per-ID Alignment Audit Pass (ported from recap_planner.py audit_batch)
  app.post("/api/recap/audit-batch", async (req, res) => {
    try {
      const { items, storyContext } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items to audit are required." });
      }

      const ai = getGenAIClient();
      const prompt = `You are a BURMESE MOVIE RECAP ALIGNMENT AUDITOR.
Inspect each ID's English source_text and current Burmese translation against the Story Context Memory.
Check for:
1. Omitted visual events, names, or numbers.
2. Content shifted into a neighboring ID.
3. Stiff literary Burmese phrasing that should be natural spoken Burmese narrator phrasing.
4. Any stray non-Myanmar characters.

If an item is already accurate and natural, keep the translation and mark status="VERIFIED".
If you improve or repair it, return the repaired Burmese translation and mark status="REPAIRED" with a short note.

STORY CONTEXT MEMORY:
${JSON.stringify(storyContext || {})}

ITEMS TO AUDIT:
${JSON.stringify(
  items.map((x: { id: number; source_text: string; translation: string }) => ({
    id: x.id,
    source_text: x.source_text,
    translation: x.translation,
  })),
  null,
  2
)}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              auditedItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    translation: { type: Type.STRING },
                    status: { type: Type.STRING },
                    auditNote: { type: Type.STRING },
                  },
                  required: ["id", "translation", "status", "auditNote"],
                },
              },
            },
            required: ["auditedItems"],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{"auditedItems":[]}').trim());
      return res.json(parsed);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to audit translations";
      return res.status(500).json({ error: msg });
    }
  });

  // 4. Audio / Video Speech Transcription (using gemini-3.5-transcribe)
  app.post("/api/recap/transcribe", async (req, res) => {
    try {
      const { base64Audio, mimeType } = req.body;
      if (!base64Audio || !mimeType) {
        return res.status(400).json({ error: "base64Audio and mimeType are required." });
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Audio,
              },
            },
            {
              text: "Transcribe this English movie recap narration clearly and accurately into sentences.",
            },
          ],
        },
      });

      return res.json({ transcriptText: (response.text || "").trim() });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Audio transcription failed";
      return res.status(500).json({ error: msg });
    }
  });

  // 5. Burmese Narrator TTS Voice Synthesis (using gemini-3.8-flash-lite-tts)
  app.post("/api/recap/tts", async (req, res) => {
    try {
      const { text, voicePersona, shortPauses } = req.body;
      const cleanText = String(text || "").replace(/\s+/g, " ").trim();
      if (!cleanText) {
        return res.status(400).json({ error: "Text is required for TTS synthesis." });
      }

      const ai = getGenAIClient();
      // Map my-MM-ThihaNeural (Male Narrator) -> Charon/Fenrir, my-MM-NilarNeural (Female Narrator) -> Kore
      const isFemale = String(voicePersona || "").toLowerCase().includes("nilar");
      const prebuiltVoice = isFemale ? "Kore" : "Charon";
      const narratorStyle = isFemale
        ? "Fluent, expressive Burmese female movie recap narrator with crisp articulation and engaging storytelling rhythm"
        : "Deep, engaging Burmese male movie recap narrator with steady cinematic pacing and clear articulation";

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: narratorStyle,
                },
              } as Record<string, unknown>,
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: prebuiltVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(500).json({ error: "TTS returned no audio data." });
      }

      // Unary response from gemini-3.8-flash-lite-tts is a 24kHz mono 16-bit WAV file (44-byte RIFF header)
      const wavBuffer = Buffer.from(base64Audio, "base64");
      const pcmBytes = Math.max(0, wavBuffer.length - 44);
      const rawDurationSec = pcmBytes / (24000 * 2);
      const effectiveDurationSec = shortPauses
        ? Math.max(1.2, Number((rawDurationSec - 0.18).toFixed(2)))
        : Number(rawDurationSec.toFixed(2));

      return res.json({
        audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
        durationSeconds: effectiveDurationSec,
        voiceUsed: voicePersona || "my-MM-ThihaNeural",
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to synthesize Burmese TTS";
      return res.status(500).json({ error: msg });
    }
  });

  // 6. Veo 3 Video Generation from Text — Step 1: Start Operation (veo-3.1-fast-generate-preview)
  app.post("/api/recap/veo-start", async (req, res) => {
    try {
      const { prompt, aspectRatio, resolution } = req.body;
      const cleanPrompt = String(prompt || "").trim();
      if (!cleanPrompt) {
        return res.status(400).json({ error: "A text prompt is required to generate video." });
      }

      // Enforce aspect ratio of '16:9' (landscape) or '9:16' (portrait)
      const validAspectRatio: "16:9" | "9:16" =
        aspectRatio === "9:16" ? "9:16" : "16:9";
      const validResolution: "720p" | "1080p" =
        resolution === "1080p" ? "1080p" : "720p";

      const ai = getGenAIClient();
      const operation = await ai.models.generateVideos({
        model: "veo-3.1-fast-generate-preview",
        prompt: cleanPrompt,
        config: {
          numberOfVideos: 1,
          resolution: validResolution,
          aspectRatio: validAspectRatio,
        },
      });

      return res.json({
        operationName: operation.name,
        model: "veo-3.1-fast-generate-preview",
        aspectRatio: validAspectRatio,
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to start Veo 3 video generation";
      return res.status(500).json({ error: msg });
    }
  });

  // 7. Veo 3 Video Generation — Step 2: Poll Operation Status
  app.post("/api/recap/veo-status", async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: "operationName is required." });
      }

      const ai = getGenAIClient();
      const op = new GenerateVideosOperation();
      op.name = String(operationName);
      const updated = await ai.operations.getVideosOperation({ operation: op });

      return res.json({
        done: Boolean(updated.done),
        error: updated.error ? String(updated.error.message || updated.error) : null,
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to poll Veo video operation status";
      return res.status(500).json({ error: msg });
    }
  });

  // 8. Veo 3 Video Generation — Step 3: Download Completed Video Stream
  app.post("/api/recap/veo-download", async (req, res) => {
    try {
      const { operationName } = req.body;
      if (!operationName) {
        return res.status(400).json({ error: "operationName is required." });
      }

      const apiKey = process.env.GEMINI_API_KEY || "";
      const ai = getGenAIClient();
      const op = new GenerateVideosOperation();
      op.name = String(operationName);
      const updated = await ai.operations.getVideosOperation({ operation: op });

      const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) {
        return res.status(404).json({ error: "Generated video URI not found in completed operation." });
      }

      const videoRes = await fetch(uri, {
        headers: {
          "x-goog-api-key": apiKey,
        },
      });

      if (!videoRes.ok || !videoRes.body) {
        return res
          .status(videoRes.status || 502)
          .json({ error: `Failed to download generated video (${videoRes.statusText})` });
      }

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="veo_recap_scene.mp4"'
      );

      await videoRes.body.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          },
        })
      );
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to download generated Veo video";
      if (!res.headersSent) {
        return res.status(500).json({ error: msg });
      }
      res.end();
    }
  });

  // 9. Free-Tier Text-to-Scene Storyboard & Burmese Narration Generator (gemini-3.8-flash)
  app.post("/api/recap/free-scene-script", async (req, res) => {
    try {
      const { prompt, movieTitle } = req.body;
      const cleanPrompt = String(prompt || "").trim();
      if (!cleanPrompt) {
        return res.status(400).json({ error: "Prompt is required." });
      }

      const ai = getGenAIClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `Create a 3-shot cinematic movie recap scene sequence from this prompt for "${movieTitle || "Movie Recap"}":
Prompt: "${cleanPrompt}"

For each shot, provide:
- shotTitle: Short English camera direction (e.g. "WIDE ANAMORPHIC PUSH-IN")
- englishNarration: 1 vivid sentence of English movie recap narration
- burmeseNarration: Natural spoken Burmese movie narrator translation (မြန်မာနောက်ခံစကားပြော)
- accentHex: Hex color matching the shot mood (e.g. "#3B82F6", "#F59E0B", "#10B981")`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              shots: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    shotTitle: { type: Type.STRING },
                    englishNarration: { type: Type.STRING },
                    burmeseNarration: { type: Type.STRING },
                    accentHex: { type: Type.STRING },
                  },
                  required: [
                    "shotTitle",
                    "englishNarration",
                    "burmeseNarration",
                    "accentHex",
                  ],
                },
              },
            },
            required: ["shots"],
          },
        },
      });

      const parsed = JSON.parse((response.text || '{"shots":[]}').trim());
      return res.json(parsed);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to generate scene script";
      return res.status(500).json({ error: msg });
    }
  });

  // 10. GitHub Repository Status & Direct Push (https://github.com/thetkomaung9/myanmarmovierecap.git)
  app.get("/api/github/status", async (_req, res) => {
    try {
      const { stdout: branchOut } = await execFileAsync("git", [
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
      ]);
      const { stdout: commitOut } = await execFileAsync("git", [
        "log",
        "-1",
        "--oneline",
      ]);
      const { stdout: remoteOut } = await execFileAsync("git", [
        "remote",
        "get-url",
        "origin",
      ]);
      const { stdout: filesOut } = await execFileAsync("git", ["ls-files"]);
      const trackedFiles = filesOut
        .trim()
        .split("\n")
        .filter(Boolean);

      return res.json({
        branch: branchOut.trim(),
        latestCommit: commitOut.trim(),
        remoteUrl: remoteOut.trim(),
        trackedFileCount: trackedFiles.length,
        trackedFiles,
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to inspect git status";
      return res.status(500).json({ error: msg });
    }
  });

  app.post("/api/github/push", async (req, res) => {
    try {
      const { githubToken, repoUrl, branch, commitMessage } = req.body;
      const targetRepo = String(
        repoUrl || "https://github.com/thetkomaung9/myanmarmovierecap.git"
      ).trim();
      const targetBranch = String(branch || "main").trim();
      const token = String(githubToken || "").trim();

      if (!token) {
        return res.status(400).json({
          error:
            "Please provide a GitHub Personal Access Token (PAT) with repo/contents write permission to push directly.",
        });
      }

      // Stage and commit any latest changes before pushing
      await execFileAsync("git", ["add", "."]);
      try {
        await execFileAsync("git", [
          "commit",
          "-m",
          String(
            commitMessage ||
              "feat: update RecapMM Studio (English to Myanmar Movie Recap & Smart Sync)"
          ),
        ]);
      } catch {
        // Working tree already clean
      }

      await execFileAsync("git", ["remote", "set-url", "origin", targetRepo]);

      // Use ephemeral HTTP extraheader so the token is never saved in .git/config
      const basicAuth = Buffer.from(`x-access-token:${token}`).toString("base64");
      const { stdout, stderr } = await execFileAsync("git", [
        "-c",
        `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basicAuth}`,
        "push",
        "-u",
        "origin",
        `HEAD:refs/heads/${targetBranch}`,
        "--force",
      ]);

      return res.json({
        success: true,
        repoUrl: targetRepo,
        branch: targetBranch,
        output: `${stdout}\n${stderr}`.trim() || "Pushed successfully to origin/main.",
      });
    } catch (error: unknown) {
      const rawMsg =
        error instanceof Error ? error.message : "Git push failed";
      // Redact any base64 header from error output
      const safeMsg = rawMsg.replace(/basic\s+[A-Za-z0-9+/=]+/gi, "basic [REDACTED]");
      return res.status(500).json({ error: safeMsg });
    }
  });

  app.get("/api/github/archive", async (_req, res) => {
    try {
      const archivePath = "/tmp/myanmarmovierecap-source.tar.gz";
      await execFileAsync("git", [
        "archive",
        "--format=tar.gz",
        "-o",
        archivePath,
        "HEAD",
      ]);
      return res.download(archivePath, "myanmarmovierecap-source.tar.gz");
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to create git archive";
      return res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const reqUrl = req.url || "";
    if (reqUrl.startsWith("/live")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  // 11. Gemini 3.8 Live API Real-Time Voice Conversation Bridge (/live)
  wss.on("connection", (clientWs, req) => {
    const parsedUrl = new URL(req.url || "/live", "http://localhost:3000");
    const requestedVoice = parsedUrl.searchParams.get("voice") || "Zephyr";
    const allowedVoices = new Set(["Puck", "Charon", "Kore", "Fenrir", "Zephyr"]);
    const voiceName = allowedVoices.has(requestedVoice)
      ? requestedVoice
      : "Zephyr";
    const mode = parsedUrl.searchParams.get("mode") || "narrator_coach";
    const projectTitle =
      parsedUrl.searchParams.get("projectTitle") || "Movie Recap Project";
    const myanmarTitle =
      parsedUrl.searchParams.get("myanmarTitle") || "";

    const modeInstructions: Record<string, string> = {
      narrator_coach:
        "Focus on helping the creator craft natural, dramatic spoken Burmese movie recap narration (မြန်မာနောက်ခံစကားပြော), improving pacing for 30fps Smart Sync windows, and refining cliffhangers.",
      story_analyst:
        "Focus on character consistency, plot state continuity, and resolving timeline questions for the movie recap.",
      live_interpreter:
        "Act as a real-time bilingual English-to-Myanmar movie recap interpreter. When the user speaks an English movie recap line, respond with the natural spoken Burmese narrator translation and brief delivery tips.",
    };

    const systemInstruction = `You are the RecapMM Studio Live Voice Director powered by Gemini Live.
Active Movie Recap Project: "${projectTitle}" (${myanmarTitle}).
Director Mode: ${modeInstructions[mode] || modeInstructions.narrator_coach}
Speak naturally, concisely, and warmly in English and Burmese (မြန်မာဘာသာ) as requested by the user.`;

    const ai = getGenAIClient();
    let isClosed = false;

    const sessionPromise = ai.live.connect({
      model: "gemini-3.8-live",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction,
      },
      callbacks: {
        onopen: () => {
          if (clientWs.readyState === clientWs.OPEN) {
            clientWs.send(
              JSON.stringify({
                status: "connected",
                model: "gemini-3.8-live",
                voiceName,
              })
            );
          }
        },
        onmessage: (message: LiveServerMessage) => {
          if (clientWs.readyState !== clientWs.OPEN) return;

          const parts = message.serverContent?.modelTurn?.parts || [];
          for (const part of parts) {
            const audioBase64 = part.inlineData?.data;
            if (audioBase64) {
              clientWs.send(JSON.stringify({ audio: audioBase64 }));
            }
            if (part.text) {
              clientWs.send(JSON.stringify({ modelText: part.text }));
            }
          }

          const outTranscript =
            message.serverContent?.outputTranscription?.text;
          if (outTranscript) {
            clientWs.send(
              JSON.stringify({ outputTranscript: outTranscript })
            );
          }

          const inTranscript =
            message.serverContent?.inputTranscription?.text;
          if (inTranscript) {
            clientWs.send(
              JSON.stringify({ inputTranscript: inTranscript })
            );
          }

          if (message.serverContent?.turnComplete) {
            clientWs.send(JSON.stringify({ turnComplete: true }));
          }

          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onerror: (err: unknown) => {
          if (clientWs.readyState === clientWs.OPEN) {
            const msg =
              err instanceof Error
                ? err.message
                : "Gemini Live session error occurred.";
            clientWs.send(JSON.stringify({ error: msg }));
          }
        },
        onclose: () => {
          if (!isClosed && clientWs.readyState === clientWs.OPEN) {
            clientWs.send(JSON.stringify({ status: "disconnected" }));
          }
        },
      },
    });

    sessionPromise.catch((err: unknown) => {
      if (clientWs.readyState === clientWs.OPEN) {
        const msg =
          err instanceof Error
            ? err.message
            : "Failed to initialize gemini-3.8-live session.";
        clientWs.send(JSON.stringify({ error: msg }));
      }
    });

    clientWs.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        sessionPromise
          .then((session) => {
            if (isClosed) return;
            if (payload.audio) {
              session.sendRealtimeInput({
                audio: {
                  data: String(payload.audio),
                  mimeType: "audio/pcm;rate=16000",
                },
              });
            } else if (payload.text) {
              session.sendRealtimeInput({
                text: String(payload.text),
              });
            }
          })
          .catch(() => {});
      } catch {
        // Ignore malformed JSON frames
      }
    });

    clientWs.on("close", () => {
      isClosed = true;
      sessionPromise
        .then((session) => {
          session.close();
        })
        .catch(() => {});
    });
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`RecapMM Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
