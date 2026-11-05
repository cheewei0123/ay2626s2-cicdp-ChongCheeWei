// Reads a setting that the app cannot run without, and stops at startup if it is missing
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see apps/api/.env.example)`);
  return value;
}
