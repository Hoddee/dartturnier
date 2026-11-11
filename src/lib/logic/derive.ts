/**
 * Abgeleitete Turnierdaten aus dem Datenstand (Snapshot): Matchstände, Tabellen,
 * Statistiken, nächstes Match pro Scheibe, KO-Baum. Reine Funktionen, gut testbar.
 */
import type { DartRow, GroupPlayerRow, MatchRow, PlayerRow, Snapshot, TournamentSettingsRow } from '../db-types';
import { applyDart, createMatch, emptyStats, mergeStats, threeDartAverage } from '../engine/match';
import type { Dart, MatchConfig, MatchState, PlayerStats } from '../engine/types';
import { buildKnockout, KO_ROUND_LABELS, type KoMatchDef, type KoRound, type SlotSource } from '../tournament/knockout';
import { computeStandings, isGroupComplete, qualificationBlocked } from '../tournament/standings';
import type { MatchResult, StandingRow, Tiebreaker } from '../tournament/types';

export const START_SCORE = 501;

export function matchConfig(m: Pick<MatchRow, 'legs_to_win' | 'first_thrower'>): MatchConfig {
	return { startScore: START_SCORE, legsToWin: m.legs_to_win, doubleOut: true, firstThrower: m.first_thrower };
}

export function toDart(d: Pick<DartRow, 'segment' | 'multiplier'>): Dart {
	return { segment: d.segment, multiplier: d.multiplier };
}

/**
 * Spielt die Darts eines Matches nach. Ungültige oder überzählige Darts (z. B. nach einer
 * manuellen Korrektur der Turnierleitung) werden ignoriert, statt alles abstürzen zu lassen.
 */
export function replaySafe(config: MatchConfig, darts: Dart[]): MatchState {
	let state = createMatch(config);
	for (const d of darts) {
		if (state.finished) break;
		try {
			state = applyDart(state, d);
		} catch {
			break;
		}
	}
	return state;
}

const stateCache = new WeakMap<DartRow[], Map<string, MatchState>>();

/** Matchstand mit Cache (Schlüssel: Dart-Array-Identität + Konfiguration). */
export function matchState(m: MatchRow, darts: DartRow[] | undefined): MatchState {
	const list = darts ?? EMPTY;
	const key = `${m.legs_to_win}|${m.first_thrower}`;
	let byKey = stateCache.get(list);
	if (!byKey) {
		byKey = new Map();
		stateCache.set(list, byKey);
	}
	let s = byKey.get(key);
	if (!s) {
		s = replaySafe(matchConfig(m), list.map(toDart));
		byKey.set(key, s);
	}
	return s;
}
const EMPTY: DartRow[] = [];

export function groupDartsByMatch(darts: DartRow[]): Record<string, DartRow[]> {
	const out: Record<string, DartRow[]> = {};
	for (const d of darts) (out[d.match_id] ??= []).push(d);
	for (const list of Object.values(out)) list.sort((a, b) => a.seq - b.seq);
	return out;
}

// ---------------------------------------------------------------------------
// Gruppen und Tabellen
// ---------------------------------------------------------------------------

export interface GroupView {
	id: string;
	playerIds: string[];
}

export function groupsFrom(groupPlayers: GroupPlayerRow[]): GroupView[] {
	const map = new Map<string, GroupPlayerRow[]>();
	for (const gp of groupPlayers) {
		if (!map.has(gp.group_id)) map.set(gp.group_id, []);
		map.get(gp.group_id)!.push(gp);
	}
	return [...map.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([id, rows]) => ({ id, playerIds: rows.sort((a, b) => a.seed - b.seed).map((r) => r.player_id) }));
}

export function groupResults(matches: MatchRow[]): MatchResult[] {
	return matches
		.filter((m) => m.stage === 'group' && m.status === 'finished' && m.player_a && m.player_b)
		.map((m) => ({ playerA: m.player_a!, playerB: m.player_b!, legsA: m.legs_a, legsB: m.legs_b }));
}

export interface GroupStandings {
	group: GroupView;
	rows: StandingRow[];
	complete: boolean;
	/** Gleichstand an der Aufstiegsgrenze, Entscheidung der Turnierleitung nötig. */
	blocked: boolean;
	/** Endgültige Reihenfolge, sobald die Gruppe fertig und eindeutig ist. */
	final: string[] | null;
}

export const ADVANCE_PER_GROUP = 2;

export function computeAllStandings(
	groups: GroupView[],
	matches: MatchRow[],
	settings: TournamentSettingsRow,
	overrides: Record<string, string[] | undefined>,
	averages: Record<string, number>
): GroupStandings[] {
	const results = groupResults(matches);
	return groups.map((group) => {
		const rows = computeStandings(group.playerIds, results, {
			pointsPerWin: settings.points_per_win,
			tiebreakers: settings.tiebreakers as Tiebreaker[],
			averages,
			manualOrder: overrides[group.id]
		});
		const complete = isGroupComplete(group.playerIds, results);
		const blocked = complete && qualificationBlocked(rows, ADVANCE_PER_GROUP);
		return { group, rows, complete, blocked, final: complete && !blocked ? rows.map((r) => r.playerId) : null };
	});
}

// ---------------------------------------------------------------------------
// Statistiken
// ---------------------------------------------------------------------------

export interface PlayerTotals {
	stats: PlayerStats;
	average: number;
	matchesPlayed: number;
	matchesWon: number;
}

/** Turnier-Statistik pro Spieler, zusammengeführt aus allen Matches mit Darts. */
export function playerTotals(
	matches: MatchRow[],
	dartsByMatch: Record<string, DartRow[]>
): Record<string, PlayerTotals> {
	const acc: Record<string, PlayerTotals> = {};
	const get = (id: string) => (acc[id] ??= { stats: emptyStats(), average: 0, matchesPlayed: 0, matchesWon: 0 });
	for (const m of matches) {
		if (!m.player_a || !m.player_b) continue;
		const darts = dartsByMatch[m.id];
		if (m.status === 'finished') {
			get(m.player_a).matchesPlayed++;
			get(m.player_b).matchesPlayed++;
			if (m.winner_id) get(m.winner_id).matchesWon++;
		}
		if (!darts?.length) continue;
		const s = matchState(m, darts);
		const a = get(m.player_a);
		const b = get(m.player_b);
		a.stats = mergeStats(a.stats, s.stats[0]);
		b.stats = mergeStats(b.stats, s.stats[1]);
	}
	for (const t of Object.values(acc)) t.average = threeDartAverage(t.stats);
	return acc;
}

export interface LeaderEntry {
	playerId: string;
	value: number;
}

export interface Leaderboards {
	highestVisit: LeaderEntry[];
	highestFinish: LeaderEntry[];
	bestAverage: LeaderEntry[];
	most180: LeaderEntry[];
	bestLeg: LeaderEntry[];
}

export function leaderboards(totals: Record<string, PlayerTotals>, limit = 5): Leaderboards {
	const entries = Object.entries(totals);
	const top = (
		value: (t: PlayerTotals) => number | null,
		dir: 'desc' | 'asc' = 'desc',
		filter: (t: PlayerTotals) => boolean = () => true
	) =>
		entries
			.filter(([, t]) => filter(t))
			.map(([playerId, t]) => ({ playerId, value: value(t) }))
			.filter((e): e is LeaderEntry => e.value !== null && e.value > 0)
			.sort((a, b) => (dir === 'desc' ? b.value - a.value : a.value - b.value))
			.slice(0, limit);
	return {
		highestVisit: top((t) => t.stats.highestVisit),
		highestFinish: top((t) => t.stats.highestFinish),
		// Mindestens 9 Darts, damit ein einzelner Glückswurf nicht ganz oben steht
		bestAverage: top((t) => Math.round(t.average * 100) / 100, 'desc', (t) => t.stats.dartsThrown >= 9),
		most180: top((t) => t.stats.count180),
		bestLeg: top((t) => t.stats.bestLegDarts, 'asc')
	};
}

export function averagesOf(totals: Record<string, PlayerTotals>): Record<string, number> {
	return Object.fromEntries(Object.entries(totals).map(([id, t]) => [id, t.average]));
}

// ---------------------------------------------------------------------------
// Scheiben
// ---------------------------------------------------------------------------

export function queueForBoard(matches: MatchRow[], board: number): MatchRow[] {
	return matches
		.filter((m) => m.board === board)
		.sort((a, b) => (a.queue_index ?? 1e9) - (b.queue_index ?? 1e9) || a.id.localeCompare(b.id));
}

/**
 * Aktuelles Match einer Scheibe: das laufende, sonst das erste noch offene Match,
 * dessen Spieler feststehen.
 */
export function currentMatchForBoard(matches: MatchRow[], board: number): MatchRow | null {
	const queue = queueForBoard(matches, board);
	return (
		queue.find((m) => m.status === 'live') ??
		queue.find((m) => m.status === 'scheduled' && m.player_a && m.player_b) ??
		null
	);
}

/** Die nächsten offenen Matches nach dem aktuellen (für "Als Nächstes"). */
export function upcomingForBoard(matches: MatchRow[], board: number, limit = 3): MatchRow[] {
	const current = currentMatchForBoard(matches, board);
	return queueForBoard(matches, board)
		.filter((m) => m.status === 'scheduled' && m.id !== current?.id)
		.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Anzeige-Texte
// ---------------------------------------------------------------------------

export function roundLabel(m: Pick<MatchRow, 'stage' | 'group_id' | 'round'>): string {
	if (m.stage === 'group') return `Gruppe ${m.group_id} · Runde ${m.round}`;
	return KO_ROUND_LABELS[m.round as KoRound] ?? m.round;
}

function slotLabel(source: SlotSource): string {
	if (source.type === 'group') return `${source.place}. Gruppe ${source.group}`;
	const [round, index] = source.matchId.split('-');
	const names: Record<string, string> = { R16: 'Achtelfinale', QF: 'Viertelfinale', SF: 'Halbfinale' };
	return `${source.type === 'loser' ? 'Verlierer' : 'Sieger'} ${names[round] ?? round} ${index}`;
}

/** Platzhalter-Texte für noch offene KO-Plätze, z. B. "1. Gruppe A". */
export function koPlaceholders(groupIds: string[]): Record<string, [string, string]> {
	if (groupIds.length !== 8) return {};
	const defs: KoMatchDef[] = buildKnockout(groupIds);
	return Object.fromEntries(defs.map((d) => [d.id, [slotLabel(d.a), slotLabel(d.b)]]));
}

export function nameOf(players: Record<string, PlayerRow>, id: string | null | undefined, fallback = '–'): string {
	return (id && players[id]?.name) || fallback;
}

export function formatAverage(n: number): string {
	return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Datenstand mit Darts gruppiert pro Match (so bleiben unveränderte Matches im Cache). */
export interface Data extends Omit<Snapshot, 'darts'> {
	dartsByMatch: Record<string, DartRow[]>;
}

export function toData(s: Snapshot): Data {
	const { darts, ...rest } = s;
	return { ...rest, dartsByMatch: groupDartsByMatch(darts) };
}

/** Alles, was die Ansichten brauchen, in einem Schritt berechnet. */
export function deriveAll(s: Data) {
	const players = Object.fromEntries(s.players.map((p) => [p.id, p]));
	const dartsByMatch = s.dartsByMatch;
	const groups = groupsFrom(s.groupPlayers);
	const totals = playerTotals(s.matches, dartsByMatch);
	const overrides = Object.fromEntries(s.overrides.map((o) => [o.group_id, o.manual_order]));
	const standings = computeAllStandings(groups, s.matches, s.settings, overrides, averagesOf(totals));
	return { players, dartsByMatch, groups, totals, standings, leaders: leaderboards(totals) };
}

// ---------------------------------------------------------------------------
// Zeitplan
// ---------------------------------------------------------------------------

function at(date: string, time: string, plusMinutes = 0): Date | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
	const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
	if (!m || !d) return null;
	// Ortszeit des Geräts (Turnier in Deutschland)
	return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(m[1]), Number(m[2]) + plusMinutes);
}

/** Geplante Startzeit eines Spiels laut Zeitplan in den Einstellungen. */
export function plannedStart(m: MatchRow, s: TournamentSettingsRow, matches: MatchRow[]): Date | null {
	if (!s.event_date || !s.start_time) return null;
	if (m.stage === 'group') {
		const onBoard = matches
			.filter((x) => x.stage === 'group' && x.board === m.board)
			.sort((a, b) => (a.queue_index ?? 0) - (b.queue_index ?? 0));
		const i = onBoard.findIndex((x) => x.id === m.id);
		return at(s.event_date, s.start_time, Math.max(0, i) * (s.slot_minutes || 20));
	}
	const times = s.ko_times ?? {};
	const index = Number(m.id.split('-')[1] ?? 1);
	const key = m.round === 'R16' ? (index <= 4 ? 'R16a' : 'R16b') : m.round;
	const t = (times as Record<string, string>)[key];
	return t ? at(s.event_date, t) : null;
}

export function formatTime(d: Date | null): string {
	return d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
}

/**
 * Verzug einer Scheibe in Minuten (positiv = hinter dem Plan), gemessen am aktuellen Spiel.
 * null, wenn nichts ansteht.
 */
export function boardDelay(
	board: number,
	matches: MatchRow[],
	s: TournamentSettingsRow,
	now: Date = new Date()
): number | null {
	const current = currentMatchForBoard(matches, board);
	if (!current) return null;
	const planned = plannedStart(current, s, matches);
	if (!planned) return null;
	const reference = current.status === 'live' && current.started_at ? new Date(current.started_at) : now;
	return Math.round((reference.getTime() - planned.getTime()) / 60000);
}
