import type { IntakeRequest, LogEvent } from "./events.ts";

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * The thin filesystem boundary around the log. Everything else in `src/log` is
 * pure; this module is the only part that touches disk — reading the
 * conflict-free `intake/` staging area and the committed `log/`, and writing
 * each back. Committed events are serialized with sorted keys so a re-serialized
 * event is byte-identical regardless of how it was constructed.
 */

/** Repo-relative directory holding committed, sequenced events. */
export const LOG_DIR = "log";

/** Repo-relative staging directory holding un-sequenced intake submissions. */
export const INTAKE_DIR = "intake";

/** Zero-pad width for the `seq` prefix of a log filename (keeps them sortable). */
const SEQ_PAD = 5;

/** An intake submission paired with the staging file it was read from. */
export type StagedIntake = {
  file: string;
  request: IntakeRequest;
};

function listJson(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .toSorted();
}

/** Read and parse every committed event in `log/`, sorted by `seq`. */
export function readLog(cwd: string): LogEvent[] {
  const dir = join(cwd, LOG_DIR);
  const events = listJson(dir).map(
    (name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as LogEvent,
  );
  return events.sort((a, b) => a.seq - b.seq);
}

/** Read and parse every staged intake in `intake/`, sorted by filename. */
export function readIntake(cwd: string): StagedIntake[] {
  const dir = join(cwd, INTAKE_DIR);
  return listJson(dir).map((file) => ({
    file,
    request: JSON.parse(readFileSync(join(dir, file), "utf8")) as IntakeRequest,
  }));
}

/** Serialize an event with sorted keys so its on-disk bytes are deterministic. */
export function serializeEvent(event: LogEvent): string {
  return `${JSON.stringify(event, Object.keys(event).toSorted(), 2)}\n`;
}

/** Write a committed event to `log/<seq>-<display>.json`. */
export function writeEvent(cwd: string, event: LogEvent): void {
  const dir = join(cwd, LOG_DIR);
  mkdirSync(dir, { recursive: true });
  const name = `${String(event.seq).padStart(SEQ_PAD, "0")}-${event.display}.json`;
  writeFileSync(join(dir, name), serializeEvent(event));
}

/** Write a new staging submission to `intake/<ts>-<nonce>.json`. */
export function writeIntake(cwd: string, request: IntakeRequest): string {
  const dir = join(cwd, INTAKE_DIR);
  mkdirSync(dir, { recursive: true });
  const stamp = request.ts.replaceAll(/[:.]/g, "-");
  const name = `${stamp}-${request.nonce}.json`;
  writeFileSync(join(dir, name), `${JSON.stringify(request, undefined, 2)}\n`);
  return `${INTAKE_DIR}/${name}`;
}

/** Delete a consumed intake file from the staging area. */
export function removeIntake(cwd: string, file: string): void {
  const path = join(cwd, INTAKE_DIR, file);
  if (existsSync(path)) {
    rmSync(path);
  }
}
