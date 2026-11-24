import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** @typedef {{ id: string, claimToken: string, deviceId: string }} Config */

export function configDir(env = process.env) {
  return env.TOKENBURN_HOME || join(homedir(), '.tokenburn');
}
export function configPath(env = process.env) {
  return join(configDir(env), 'config.json');
}

/** @returns {Promise<Config | null>} */
export async function loadConfig(env = process.env) {
  try {
    const c = JSON.parse(await readFile(configPath(env), 'utf8'));
    if (c && typeof c.id === 'string' && typeof c.claimToken === 'string' && typeof c.deviceId === 'string') return c;
  } catch {
    /* none */
  }
  return null;
}

/** @param {Config} cfg */
export async function saveConfig(cfg, env = process.env) {
  await mkdir(configDir(env), { recursive: true, mode: 0o700 });
  const p = configPath(env);
  const body = JSON.stringify({ id: cfg.id, claimToken: cfg.claimToken, deviceId: cfg.deviceId }, null, 2) + '\n';
  await writeFile(p, body, { mode: 0o600 });
  await chmod(p, 0o600);
}

export const newDeviceId = () => randomUUID();
