// Reads the reports of the other checks for the QA page (KAN-103):
// Lighthouse, the OWASP ZAP baseline scan, Stryker mutation testing, and the
// result of every CI job the QA report job waits for.

// ---- Lighthouse: a score from 0 to 1 per category ----
type LighthouseJson = {
  categories: Record<string, { title: string; score: number | null }>;
};

export function lighthouseScores(json: LighthouseJson) {
  return Object.values(json.categories).map((c) => ({
    title: c.title,
    score: c.score === null ? null : Math.round(c.score * 100),
  }));
}

// ---- ZAP baseline: alerts with a risk code, 0 (informational) to 3 (high) ----
type ZapJson = {
  site: {
    alerts: {
      name: string;
      riskcode: string;
      count?: string;
      instances?: unknown[];
    }[];
  }[];
};
export const RISKS = ['Informational', 'Low', 'Medium', 'High'];

export function zapAlerts(json: ZapJson) {
  const alerts = json.site
    .flatMap((s) => s.alerts)
    .map((a) => ({
      name: a.name,
      risk: Number(a.riskcode),
      count: Number(a.count ?? a.instances?.length ?? 1),
    }))
    .sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));
  const byRisk = RISKS.map(
    (_, risk) => alerts.filter((a) => a.risk === risk).length,
  );
  return { alerts, byRisk };
}

// ---- Stryker: each mutant (a small change to the code) is killed by a test or survives ----
type StrykerJson = { files: Record<string, { mutants: { status: string }[] }> };

export function mutationScore(json: StrykerJson) {
  const count = (status: string) =>
    Object.values(json.files)
      .flatMap((f) => f.mutants)
      .filter((m) => m.status === status).length;
  const killed = count('Killed');
  const timeout = count('Timeout'); // the change made a test hang: also caught
  const survived = count('Survived');
  const noCoverage = count('NoCoverage'); // no test even runs that line
  const detected = killed + timeout;
  const valid = detected + survived + noCoverage;
  // Stryker's own formula: caught mutants out of the ones that could be caught
  return {
    killed,
    timeout,
    survived,
    noCoverage,
    score: valid ? (detected / valid) * 100 : 100,
  };
}

// ---- CI jobs: `toJSON(needs)` from the workflow, one result per job ----
export type Needs = Record<string, { result: string }>;

export function jobResults(needs: Needs) {
  return Object.entries(needs).map(([job, { result }]) => ({ job, result }));
}
