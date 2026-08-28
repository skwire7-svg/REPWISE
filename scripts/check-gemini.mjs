/**
 * Smoke-tests the Gemini key without going through the app.
 *
 * Run it right after pasting your key:
 *
 *   npm run check:ai
 *
 * It exercises the two call shapes the app actually uses — JSON mode with a
 * response schema (workout and diet generators) and streaming (the coach) — so
 * a pass here means all three features have what they need. Going through the
 * UI instead would require a Supabase account and a finished onboarding first.
 */

import { GoogleGenAI, Type } from "@google/genai";

// Must match MODEL in lib/ai/client.ts — this script exists to prove that
// exact model works before the app depends on it.
const MODEL = "gemini-3.6-flash";
const key = process.env.GEMINI_API_KEY;

if (!key) {
  console.error(
    "GEMINI_API_KEY is not set.\n" +
      "Paste your key into .env.local, then run: npm run check:ai",
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: key });
let failed = false;

// 1. JSON mode — what the workout and diet generators rely on.
try {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: "Name one compound leg exercise." }] }],
    config: {
      systemInstruction: "You are a strength coach. Answer in JSON.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          exercise: { type: Type.STRING },
          primary_muscle: { type: Type.STRING },
        },
        required: ["exercise", "primary_muscle"],
        propertyOrdering: ["exercise", "primary_muscle"],
      },
      maxOutputTokens: 2048,
    },
  });

  const parsed = JSON.parse(response.text);
  console.log(
    `PASS  JSON mode      -> ${parsed.exercise} (${parsed.primary_muscle})`,
  );
} catch (error) {
  failed = true;
  console.error(`FAIL  JSON mode      -> ${error.message}`);
}

// 2. Streaming — what the coach relies on.
try {
  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: "Say 'streaming works' and nothing else." }] }],
    config: { maxOutputTokens: 2048 },
  });

  let text = "";
  for await (const chunk of stream) {
    if (chunk.text) text += chunk.text;
  }
  console.log(`PASS  streaming      -> ${text.trim()}`);
} catch (error) {
  failed = true;
  console.error(`FAIL  streaming      -> ${error.message}`);
}

if (failed) {
  console.error(
    "\nOne or more checks failed. Common causes:\n" +
      "  - API key not valid        -> regenerate at aistudio.google.com/apikey\n" +
      "  - RESOURCE_EXHAUSTED / 429 -> free-tier quota; wait a minute\n" +
      "  - model not found          -> the key has no access to " + MODEL,
  );
  process.exit(1);
}

console.log("\nAll checks passed. The workout, diet and coach features are ready.");
