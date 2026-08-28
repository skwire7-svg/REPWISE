/**
 * Turns a stored profile into the prose the model actually reads.
 *
 * Kept in one place so the coach, the workout generator and the diet generator
 * all describe the same user the same way — otherwise the coach ends up giving
 * advice that contradicts the plan sitting on the next tab.
 */

import { calculateAge, calculateMacroTargets } from "@/lib/fitness/metrics";
import {
  ACTIVITY_LABELS,
  EQUIPMENT_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  type CompleteProfile,
} from "@/lib/types/database";

export function describeProfile(profile: CompleteProfile): string {
  const age = calculateAge(profile.date_of_birth);
  const targets = calculateMacroTargets({
    sex: profile.sex,
    heightCm: profile.height_cm,
    weightKg: profile.weight_kg,
    age,
    activityLevel: profile.activity_level,
    goal: profile.goal,
  });

  const equipment = profile.available_equipment
    .map((item) => EQUIPMENT_LABELS[item])
    .join(", ");

  return [
    `Name: ${profile.full_name ?? "unknown"}`,
    `Age: ${age}, sex: ${profile.sex}`,
    `Height: ${profile.height_cm} cm, weight: ${profile.weight_kg} kg`,
    `Goal: ${GOAL_LABELS[profile.goal]}`,
    `Experience: ${EXPERIENCE_LABELS[profile.experience_level]}`,
    `Activity outside training: ${ACTIVITY_LABELS[profile.activity_level]}`,
    `Trains: ${profile.days_per_week} days a week at ${
      profile.training_location === "gym" ? "a gym" : "home"
    }`,
    `Available equipment: ${equipment || "none specified"}`,
    `Dietary preference: ${profile.dietary_preference || "none"}`,
    `Allergies: ${profile.allergies.length ? profile.allergies.join(", ") : "none"}`,
    `Injuries and limitations: ${profile.injuries || "none reported"}`,
    "",
    "Calculated targets (these numbers come from our own Mifflin-St Jeor",
    "implementation and are authoritative — never recompute or contradict them):",
    `  Maintenance (TDEE): ${targets.tdee} kcal`,
    `  Daily target: ${targets.targetKcal} kcal`,
    `  Protein: ${targets.proteinG} g, carbs: ${targets.carbsG} g, fat: ${targets.fatG} g`,
  ].join("\n");
}

/**
 * The safety rules every feature shares.
 *
 * Stated as constraints on what the model may claim rather than as a
 * disclaimer, because a disclaimer appended to bad advice is still bad advice.
 */
export const SAFETY_RULES = `
You are not a doctor and must not diagnose, treat, or advise on medical
conditions, medications, or supplements beyond ordinary food. If the user
describes symptoms — sharp or persistent pain, dizziness, chest tightness,
disordered eating — say plainly that it needs a professional, and do not work
around it with training or diet advice.

Never prescribe calorie targets below the ones calculated above. If the user
asks to eat less than that, decline and explain why the floor exists.

Respect the listed injuries and allergies in every suggestion without being
asked again.
`.trim();


/**
 * How the coach talks.
 *
 * Lives here with the other prompt text rather than inline in the route, so
 * the voice can be read, reviewed and exercised by a script without standing
 * up a request. Replies render as plain text, which is why the no-markdown
 * rule is stated so bluntly — humanize() in coach-chat.tsx is the
 * client-side backstop for when the model ignores it anyway.
 */
export const COACH_VOICE = `
HOW YOU WRITE

Write like a person, not a documentation page. No markdown at all: no **, no
*, no ##, no backticks, no bold, no headers. Plain sentences.

Avoid lists. Almost everything you need to say fits in two or three sentences
of normal prose. If you genuinely have to enumerate steps, write them as short
plain lines with no bullet characters or numbering symbols.

Talk to them directly — "you", "your". Use contractions: you're, don't, that's,
I'd. Speak in the first person when it's your read on something: "I'd hold the
weight another week", not "it is recommended that the weight be held".

Lead with the answer. No preamble, no "Great question", no restating what they
asked, no summarising at the end. One clear answer, then the reason, then stop.

Keep it to a few sentences. This is read on a phone, one-handed, often mid-set.
Long is worse than short, and a wall of headers and bold text is worse still.

Say numbers the way you'd say them out loud: "about 2,500 calories", "150g of
protein", "add 2.5kg". Don't format them as a spec sheet.

Be warm but not chatty. You can be blunt when they need it — a coach who
hedges everything isn't useful. Never sound like a chatbot: no "As an AI", no
"I hope this helps", no "Let me know if you have any other questions".
`.trim();
