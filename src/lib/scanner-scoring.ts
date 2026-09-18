export const scannerOutcomeTypes = [
  "automation",
  "augmentation",
  "decision-support",
  "process-change",
  "do-nothing",
] as const;

export type ScannerOutcomeType = (typeof scannerOutcomeTypes)[number];

export type ScannerCandidate = {
  id: string;
  title: string;
  summary: string;
  outcomeType: ScannerOutcomeType;
  impact: number;
  feasibility: number;
  timeToValue: number;
  confidence: number;
  risk: number;
  evidence: string[];
  firstStep: string;
};

// Bounds of the deterministic ranking score below, from its known extremes:
// worst case (impact=1, feasibility=1, timeToValue=1, confidence=1, risk=5)
// and best case (impact=5, feasibility=5, timeToValue=5, confidence=5, risk=1).
const CANDIDATE_SCORE_MIN = 40;
const CANDIDATE_SCORE_MAX = 440;

export type RankedScannerCandidate = ScannerCandidate & {
  score: number;
  rank: number;
  // Deterministic 0-10 points this opportunity contributes toward the
  // potential score, derived from the same score above -- never LLM-supplied.
  pointValue: number;
};

export function rankScannerCandidates(
  candidates: readonly ScannerCandidate[],
): RankedScannerCandidate[] {
  return candidates
    .map((candidate) => {
      const score =
        candidate.impact * 30 +
        candidate.feasibility * 25 +
        candidate.timeToValue * 20 +
        candidate.confidence * 15 -
        candidate.risk * 10;
      const pointValue = clamp(
        Math.round(
          ((score - CANDIDATE_SCORE_MIN) / (CANDIDATE_SCORE_MAX - CANDIDATE_SCORE_MIN)) * 10,
        ),
        0,
        10,
      );
      return { ...candidate, score, pointValue };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.impact - left.impact ||
        right.feasibility - left.feasibility ||
        left.risk - right.risk ||
        compareCodePoints(left.id, right.id),
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

// AI maturity dimensions the model judges from the intake (1-5 each). The
// application, not the model, turns these into the 0-100 base score below.
export type ScannerMaturity = {
  toolAdoption: number;
  processIntegration: number;
  dataReadiness: number;
  technicalCapacity: number;
  governance: number;
};

export const SCANNER_MATURITY_DIMENSIONS: readonly (keyof ScannerMaturity)[] = [
  "toolAdoption",
  "processIntegration",
  "dataReadiness",
  "technicalCapacity",
  "governance",
];

export function computeBaseScore(maturity: ScannerMaturity): number {
  const sum = SCANNER_MATURITY_DIMENSIONS.reduce(
    (total, key) => total + maturity[key],
    0,
  );
  // All-1s -> 0, all-5s -> 100.
  return clamp(Math.round(((sum - 5) * 100) / 20), 0, 100);
}

// A scan can never claim a business is fully done -- there is always
// something else to improve -- so the achievable score from the listed
// opportunities is capped below 100, not at it.
const POTENTIAL_SCORE_CEILING = 95;

export function computePotentialScore(
  baseScore: number,
  ranked: readonly RankedScannerCandidate[],
): number {
  const totalPoints = ranked.reduce((sum, candidate) => sum + candidate.pointValue, 0);
  const capped = Math.min(POTENTIAL_SCORE_CEILING, baseScore + totalPoints);
  return Math.max(baseScore, capped);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function compareCodePoints(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
