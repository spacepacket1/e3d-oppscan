import { describe, expect, it } from "vitest";

import {
  computeBaseScore,
  rankScannerCandidates,
  type ScannerCandidate,
  type ScannerMaturity,
} from "@/lib/scanner-scoring";

const base: ScannerCandidate = {
  id: "base",
  title: "Base",
  summary: "Summary",
  outcomeType: "automation",
  impact: 3,
  feasibility: 3,
  timeToValue: 3,
  confidence: 3,
  risk: 3,
  evidence: ["Evidence"],
  firstStep: "First step",
};

function candidate(id: string, values: Partial<ScannerCandidate> = {}) {
  return { ...base, id, ...values };
}

describe("scanner deterministic scoring", () => {
  it("maps maturity boundaries and representative intermediate values into the 0-100 base score", () => {
    const lowest: ScannerMaturity = {
      toolAdoption: 1,
      processIntegration: 1,
      dataReadiness: 1,
      technicalCapacity: 1,
      governance: 1,
    };
    const highest: ScannerMaturity = {
      toolAdoption: 5,
      processIntegration: 5,
      dataReadiness: 5,
      technicalCapacity: 5,
      governance: 5,
    };
    const intermediate: ScannerMaturity = {
      toolAdoption: 2,
      processIntegration: 4,
      dataReadiness: 3,
      technicalCapacity: 5,
      governance: 1,
    };

    expect(computeBaseScore(lowest)).toBe(0);
    expect(computeBaseScore(highest)).toBe(100);
    expect(computeBaseScore(intermediate)).toBe(50);
  });

  it("calculates exact representative scores", () => {
    expect(rankScannerCandidates([candidate("high", {
      impact: 5, feasibility: 5, timeToValue: 5, confidence: 5, risk: 1,
    })])[0].score).toBe(440);
    expect(rankScannerCandidates([candidate("low", {
      impact: 1, feasibility: 1, timeToValue: 1, confidence: 1, risk: 5,
    })])[0].score).toBe(40);
  });

  it("applies score, impact, feasibility, risk, and code-point ID tie breaks in order", () => {
    expect(rankScannerCandidates([
      candidate("lower-score", { impact: 1 }),
      candidate("higher-score", { impact: 5 }),
    ]).map(({ id }) => id)).toEqual(["higher-score", "lower-score"]);

    expect(rankScannerCandidates([
      candidate("impact-four", { impact: 4, confidence: 5 }),
      candidate("impact-five", { impact: 5, confidence: 3 }),
    ]).map(({ id }) => id)).toEqual(["impact-five", "impact-four"]);

    expect(rankScannerCandidates([
      candidate("feasibility-four", { feasibility: 4, confidence: 5, risk: 2 }),
      candidate("feasibility-five", { feasibility: 5, confidence: 4, risk: 3 }),
    ]).map(({ id }) => id)).toEqual(["feasibility-five", "feasibility-four"]);

    expect(rankScannerCandidates([
      candidate("risk-two", { risk: 2, timeToValue: 4, confidence: 1 }),
      candidate("risk-three", { risk: 3, timeToValue: 3, confidence: 3 }),
    ]).map(({ id }) => id)).toEqual(["risk-two", "risk-three"]);

    expect(rankScannerCandidates([
      candidate("zeta"),
      candidate("alpha"),
    ]).map(({ id }) => id)).toEqual(["alpha", "zeta"]);
  });

  it("is stable and unaffected by prose or CTA-like wording", () => {
    const input = [
      candidate("bravo", { title: "Book now", summary: "Urgent prose" }),
      candidate("alpha", { title: "Do nothing", summary: "No CTA", outcomeType: "do-nothing" }),
    ];
    const expected = rankScannerCandidates(input);
    for (let run = 0; run < 10; run += 1) {
      expect(rankScannerCandidates(input)).toEqual(expected);
    }
    expect(rankScannerCandidates(input.map((item) => ({
      ...item,
      title: `Changed ${item.id}`,
      summary: `Different copy ${item.id}`,
      firstStep: `Different CTA ${item.id}`,
    })))).toEqual(expected.map((item) => ({
      ...item,
      title: `Changed ${item.id}`,
      summary: `Different copy ${item.id}`,
      firstStep: `Different CTA ${item.id}`,
    })));
  });
});
