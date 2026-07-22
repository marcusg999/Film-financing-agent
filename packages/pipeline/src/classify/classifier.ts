/**
 * Money-vs-craft classification (docs/04 problem 1). Separates financing
 * from creative credit with a confidence score — never promotes a bare
 * producer/EP credit to "money".
 *
 * Two implementations behind one interface:
 *   - RuleClassifier  — deterministic, runs with no API key (default)
 *   - ClaudeClassifier — LLM judgment, active when ANTHROPIC_API_KEY is set
 * The factory picks Claude when the key exists, else the rule classifier.
 */

export interface ClassifyInput {
  role: string; // financier_role
  excerpt: string | null; // evidence excerpt
  classificationMethod?: string | null; // prior method (e.g. rule:wikidata_p272)
}

export interface ClassifyResult {
  isFinancial: boolean | null; // null = genuinely unknown, a valid state
  confidence: number; // 0..1
  method: string;
  rationale: string;
}

export interface Classifier {
  readonly method: string;
  classify(input: ClassifyInput): Promise<ClassifyResult>;
}

/** Roles that are financial by definition of the role itself. */
const FINANCIAL_ROLES = new Set([
  "equity",
  "co_financier",
  "gap_loan",
  "mg_advance",
  "presale",
  "grant",
  "tax_credit",
  "crowdfunding",
]);

/** Language in evidence that attributes financing. */
const FINANCING_LANGUAGE =
  /\b(financed by|fully funded|equity (from|investment)|backed by|invest(ed|ment) (in|from|by)|co-financ|gap (loan|financing)|minimum guarantee|\bMG\b|pre-?sale|raised \$|funding from|bankrolled)\b/i;

export class RuleClassifier implements Classifier {
  readonly method = "rule:money_v_craft";

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    const text = input.excerpt ?? "";
    const hasFinancingLang = FINANCING_LANGUAGE.test(text);
    const fromFiling = input.classificationMethod === "sec_filing";

    if (fromFiling) {
      return { isFinancial: true, confidence: 0.9, method: this.method, rationale: "named in a securities filing" };
    }
    if (FINANCIAL_ROLES.has(input.role)) {
      // Role is money by definition; financing language nudges confidence up.
      const conf = hasFinancingLang ? 0.85 : input.role === "co_financier" ? 0.7 : 0.8;
      return { isFinancial: true, confidence: conf, method: this.method, rationale: `financial role "${input.role}"` };
    }
    if (input.role === "executive_producer") {
      // The unreliable signal (docs/04). Only money with explicit language;
      // otherwise genuinely unknown — never defaulted to money.
      return hasFinancingLang
        ? { isFinancial: true, confidence: 0.6, method: this.method, rationale: "EP credit with financing language" }
        : { isFinancial: null, confidence: 0.4, method: this.method, rationale: "EP credit, no financing language — ambiguous" };
    }
    if (input.role === "producer") {
      // Craft by default unless financing language is present.
      return hasFinancingLang
        ? { isFinancial: true, confidence: 0.55, method: this.method, rationale: "producer credit with financing language" }
        : { isFinancial: false, confidence: 0.7, method: this.method, rationale: "producer credit, treated as craft" };
    }
    return { isFinancial: null, confidence: 0.3, method: this.method, rationale: `role "${input.role}" not classifiable by rule` };
  }
}
