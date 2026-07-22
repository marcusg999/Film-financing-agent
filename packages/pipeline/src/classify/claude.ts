import type { Classifier, ClassifyInput, ClassifyResult } from "./classifier.js";
import { RuleClassifier } from "./classifier.js";

/**
 * Claude-backed money-vs-craft classifier (docs/04). Active only when
 * ANTHROPIC_API_KEY is present; falls back to the rule classifier on any
 * API error so a hiccup degrades quality rather than halting the pipeline.
 *
 * Uses claude-haiku-4-5 — this is the high-volume path; the schema and
 * few-shot examples are prompt-cacheable (docs/06 cost levers). Kept
 * dependency-light (fetch to the Messages API) so no SDK is required.
 */

const MODEL = "claude-haiku-4-5-20251001";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You classify a film-industry credit as FINANCING (money) or CRAFT (creative), for an agent that finds funders of indie films.
Rules:
- "producer" is usually craft, not money.
- "executive producer" is an unreliable money signal: only financial with explicit financing language; otherwise unknown.
- equity/gap loan/MG advance/presale/grant/tax credit/crowdfunding/co-financier are financial by role.
- Never guess money from a bare credit. "unknown" is a valid, honest answer.
Return ONLY JSON: {"is_financial": true|false|null, "confidence": 0..1, "rationale": "<short>"}.`;

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
}

export class ClaudeClassifier implements Classifier {
  readonly method = "llm:money_v_craft";
  private fallback = new RuleClassifier();

  constructor(
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch
  ) {}

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    const prompt = `Role: ${input.role}\nEvidence excerpt: ${input.excerpt ?? "(none)"}\nClassify.`;
    try {
      const res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 200,
          system: SYSTEM,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const body = (await res.json()) as AnthropicResponse;
      const text = body.content?.find((c) => c.type === "text")?.text ?? "";
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const isFinancial = json.is_financial === null ? null : Boolean(json.is_financial);
      const confidence = Math.max(0, Math.min(1, Number(json.confidence)));
      return {
        isFinancial,
        confidence: Number.isFinite(confidence) ? confidence : 0.3,
        method: this.method,
        rationale: String(json.rationale ?? "").slice(0, 300),
      };
    } catch {
      // Degrade to the deterministic classifier rather than stall.
      const r = await this.fallback.classify(input);
      return { ...r, rationale: `[llm fallback] ${r.rationale}` };
    }
  }
}

/** Factory: Claude when the key is set, else the rule classifier. */
export function getClassifier(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Classifier {
  const key = env.ANTHROPIC_API_KEY;
  return key ? new ClaudeClassifier(key, fetchImpl) : new RuleClassifier();
}
