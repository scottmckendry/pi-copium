/**
 * pi-copium — session pruning
 *
 * Automatically prunes session files inactive for 30 days on startup.
 * Keeps the 10 most recent sessions, named sessions, and the active session.
 * Old session files are deleted permanently.
 */

import { getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, SessionInfo } from "@earendil-works/pi-coding-agent";
import { lstat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const RETENTION_DAYS = 30;
const KEEP_RECENT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SizedSession extends SessionInfo {
	size: number;
}

export function selectPruneCandidates<T extends SessionInfo>(
	sessions: T[],
	currentSessionFile: string | undefined,
	now = Date.now(),
): T[] {
	const currentPath = currentSessionFile ? resolve(currentSessionFile) : undefined;
	const eligible = sessions.filter(
		(session) => !currentPath || resolve(session.path) !== currentPath,
	);
	const recent = new Set(
		[...eligible]
			.sort((a, b) => b.modified.getTime() - a.modified.getTime())
			.slice(0, KEEP_RECENT)
			.map((session) => session.path),
	);
	const cutoff = now - RETENTION_DAYS * DAY_MS;

	return eligible.filter(
		(session) =>
			!recent.has(session.path) &&
			!session.name &&
			session.modified.getTime() < cutoff,
	);
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${bytes} B`;
}

function notify(ctx: ExtensionContext, message: string, level: "info" | "warning"): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}

async function addSizes(sessions: SessionInfo[]): Promise<SizedSession[]> {
	const sized = await Promise.all(
		sessions.map(async (session): Promise<SizedSession | undefined> => {
			try {
				const stats = await lstat(session.path);
				if (!stats.isFile() || stats.isSymbolicLink()) return undefined;
				return { ...session, size: stats.size };
			} catch {
				return undefined;
			}
		}),
	);
	return sized.filter((session) => session !== undefined);
}

function isWithinSessionsDir(path: string, sessionsDir: string): boolean {
	const rel = relative(resolve(sessionsDir), resolve(path));
	return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function deleteSession(path: string): Promise<void> {
	await unlink(path);
}

async function pruneSessions(ctx: ExtensionContext): Promise<void> {
	const sessionsDir = join(getAgentDir(), "sessions");
	const sessions = await addSizes(await SessionManager.listAll());
	const candidates = selectPruneCandidates(
		sessions,
		ctx.sessionManager.getSessionFile() ?? undefined,
	);

	if (candidates.length === 0) return;

	let deleted = 0;
	let failed = 0;
	let reclaimed = 0;

	for (const session of candidates) {
		if (!isWithinSessionsDir(session.path, sessionsDir)) {
			failed++;
			continue;
		}

		try {
			await deleteSession(session.path);
			deleted++;
			reclaimed += session.size;
		} catch {
			failed++;
		}
	}

	const failureNote = failed > 0 ? ` ${failed} failed.` : "";
	notify(
		ctx,
		`Pruned ${deleted} old sessions (${formatBytes(reclaimed)}).${failureNote}`,
		failed > 0 ? "warning" : "info",
	);
}

export function installSessionPruning(pi: ExtensionAPI): void {
	let hasRun = false;

	pi.on("session_start", async (event, ctx) => {
		if (hasRun || event.reason === "reload") return;
		hasRun = true;

		try {
			await pruneSessions(ctx);
		} catch (error) {
			notify(
				ctx,
				`Session pruning failed: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
		}
	});
}
