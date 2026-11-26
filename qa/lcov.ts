// Reads lcov.info, the coverage format both test runners write (KAN-102).
// One record per source file: SF is the file, LF/LH lines found and hit,
// BRF/BRH branches, FNF/FNH functions, and end_of_record closes it.

export type Counts = { found: number; hit: number };
export type Coverage = { lines: Counts; branches: Counts; functions: Counts };
export type FileCoverage = Coverage & { file: string };
export type Gate = { lines: number; branches: number };

type Part = keyof Coverage;
const FIELDS: Record<string, [Part, keyof Counts]> = {
  LF: ['lines', 'found'],
  LH: ['lines', 'hit'],
  BRF: ['branches', 'found'],
  BRH: ['branches', 'hit'],
  FNF: ['functions', 'found'],
  FNH: ['functions', 'hit'],
};

const empty = (): Coverage => ({
  lines: { found: 0, hit: 0 },
  branches: { found: 0, hit: 0 },
  functions: { found: 0, hit: 0 },
});

export function parseLcov(text: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  let file: FileCoverage | undefined;
  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    const key = colon < 0 ? line.trim() : line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    if (key === 'SF') {
      // Windows writes src\split\money.ts; CI (Linux) writes src/split/money.ts
      file = { file: value.replaceAll('\\', '/'), ...empty() };
    } else if (key === 'end_of_record' && file) {
      files.push(file);
      file = undefined;
    } else if (file && FIELDS[key]) {
      const [part, which] = FIELDS[key];
      file[part][which] = Number(value);
    }
  }
  return files;
}

// Adds the counts up; the percentage is taken from the sums, not averaged
export function total(files: Coverage[]): Coverage {
  const sum = empty();
  for (const f of files)
    for (const part of ['lines', 'branches', 'functions'] as const) {
      sum[part].found += f[part].found;
      sum[part].hit += f[part].hit;
    }
  return sum;
}

// src/split/money.ts -> src/split; a file straight in src stays in src
export function folderOf(file: string): string {
  const parts = file.split('/');
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/') || '.';
}

export function byFolder(files: FileCoverage[]): Map<string, Coverage> {
  const groups = new Map<string, FileCoverage[]>();
  for (const f of files) {
    const folder = folderOf(f.file);
    groups.set(folder, [...(groups.get(folder) ?? []), f]);
  }
  const sorted = [...groups].sort(([a], [b]) => a.localeCompare(b));
  return new Map(sorted.map(([folder, fs]) => [folder, total(fs)]));
}

// Nothing to cover counts as fully covered, as Vitest does
export const pct = (c: Counts) => (c.found ? (c.hit / c.found) * 100 : 100);

// The gates come from the Vitest config itself, so the page can't drift from CI:
//   'src/split/**': { lines: 90, branches: 90 }  -> folder src/split
//   thresholds: { lines: 90, branches: 90 }      -> the whole app ('')
export function readGates(config: string): Map<string, Gate> {
  const gates = new Map<string, Gate>();
  const num = '\\s*lines:\\s*(\\d+),\\s*branches:\\s*(\\d+)';
  for (const m of config.matchAll(
    new RegExp(`'([\\w/-]+)/\\*\\*':\\s*\\{${num}`, 'g'),
  ))
    gates.set(m[1], { lines: Number(m[2]), branches: Number(m[3]) });
  const whole = config.match(new RegExp(`thresholds:\\s*\\{${num}`));
  if (whole)
    gates.set('', { lines: Number(whole[1]), branches: Number(whole[2]) });
  return gates;
}

export const meetsGate = (c: Coverage, gate: Gate) =>
  pct(c.lines) >= gate.lines && pct(c.branches) >= gate.branches;
