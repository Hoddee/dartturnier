/**
 * Pläne für Aktionen der Turnierleitung: Spielplan erzeugen, KO-Baum anlegen,
 * Achtelfinale befüllen. Reine Funktionen; die Datenbank-Schreibzugriffe macht das Admin-Panel.
 */
import type { MatchRow, NewMatch, TournamentSettingsRow } from '../db-types';
import { buildGroupSchedule } from '../tournament/groups';
import { buildKnockout } from '../tournament/knockout';
import type { GroupView, GroupStandings } from './derive';

export const BOARD_COUNT = 4;

/**
 * Verteilt die Zähler in einer Gruppe möglichst fair: Zähler ist immer einer der beiden Spieler,
 * die gerade nicht spielen. Alle Kombinationen werden durchprobiert (bei 6 Spielen nur 64) und die
 * beste genommen:
 *   1. gleichmäßig verteilt (bei 4 Spielern zählen zwei je zweimal, zwei je einmal),
 *   2. möglichst niemand zählt direkt vor dem eigenen nächsten Spiel,
 *   3. möglichst niemand zählt zweimal hintereinander.
 * `matches` sind die Spiele EINER Gruppe in Spielreihenfolge.
 */
export function assignGroupScorers(
	playerIds: string[],
	matches: { playerA: string; playerB: string }[]
): string[] {
	const candidates = matches.map((m) => playerIds.filter((p) => p !== m.playerA && p !== m.playerB));
	if (candidates.some((c) => c.length === 0)) return matches.map(() => '');
	let best: string[] = [];
	let bestCost = Infinity;
	const total = candidates.reduce((n, c) => n * c.length, 1);
	for (let combo = 0; combo < total; combo++) {
		let rest = combo;
		const pick = candidates.map((c) => {
			const choice = c[rest % c.length];
			rest = Math.floor(rest / c.length);
			return choice;
		});
		const counts = new Map(playerIds.map((p) => [p, 0]));
		for (const p of pick) counts.set(p, (counts.get(p) ?? 0) + 1);
		const values = [...counts.values()];
		let cost = 100 * (Math.max(...values) - Math.min(...values));
		pick.forEach((scorer, i) => {
			const next = matches[i + 1];
			if (next && (next.playerA === scorer || next.playerB === scorer)) cost += 10;
			if (i > 0 && pick[i - 1] === scorer) cost += 5;
		});
		if (cost < bestCost) {
			bestCost = cost;
			best = pick;
		}
	}
	return best;
}

export function groupMatchRows(groups: GroupView[], settings: TournamentSettingsRow): NewMatch[] {
	const schedule = buildGroupSchedule(groups, BOARD_COUNT);
	const scorer = new Map<string, string>();
	for (const g of groups) {
		const list = schedule.filter((m) => m.group === g.id).sort((a, b) => a.queueIndex - b.queueIndex);
		assignGroupScorers(g.playerIds, list).forEach((s, i) => s && scorer.set(list[i].id, s));
	}
	return schedule.map((m) => ({
		id: m.id,
		stage: 'group',
		group_id: m.group,
		round: String(m.round),
		player_a: m.playerA,
		player_b: m.playerB,
		board: m.board,
		queue_index: m.queueIndex,
		legs_to_win: settings.group_legs_to_win,
		next_match_id: null,
		next_slot: null,
		loser_next_match_id: null,
		loser_next_slot: null,
		scorer_id: scorer.get(m.id) ?? null,
		scorer_from_loser_of: null
	}));
}

const ROUND_QUEUE_BASE = { R16: 100, QF: 200, SF: 300, P3: 400, F: 500 } as const;

/** Achtelfinale in zwei Wellen: R16-1..4 zuerst, R16-5..8 danach (gleiche Scheibe). */
export const R16_WAVE_SIZE = 4;

/** KO-Matches inkl. Verknüpfung zum Folgematch (für das automatische Weiterrücken). */
export function koMatchRows(groupIds: string[], settings: TournamentSettingsRow): NewMatch[] {
	const defs = buildKnockout(groupIds, { boardCount: BOARD_COUNT, legsToWin: settings.ko_legs_to_win });
	const next = new Map<string, { id: string; slot: 0 | 1 }>();
	const loserNext = new Map<string, { id: string; slot: 0 | 1 }>();
	for (const d of defs) {
		if (d.a.type === 'winner') next.set(d.a.matchId, { id: d.id, slot: 0 });
		if (d.b.type === 'winner') next.set(d.b.matchId, { id: d.id, slot: 1 });
		if (d.a.type === 'loser') loserNext.set(d.a.matchId, { id: d.id, slot: 0 });
		if (d.b.type === 'loser') loserNext.set(d.b.matchId, { id: d.id, slot: 1 });
	}
	// Zweite Achtelfinal-Welle: Zähler ist der Verlierer des Spiels davor auf derselben Scheibe
	const scorerFromLoser = (d: (typeof defs)[number]) =>
		d.round === 'R16' && d.index > R16_WAVE_SIZE ? `R16-${d.index - R16_WAVE_SIZE}` : null;
	return defs.map((d) => ({
		id: d.id,
		stage: 'ko',
		group_id: null,
		round: d.round,
		player_a: null,
		player_b: null,
		board: d.board,
		queue_index: ROUND_QUEUE_BASE[d.round] + d.index,
		legs_to_win: d.legsToWin,
		next_match_id: next.get(d.id)?.id ?? null,
		next_slot: next.get(d.id)?.slot ?? null,
		loser_next_match_id: loserNext.get(d.id)?.id ?? null,
		loser_next_slot: loserNext.get(d.id)?.slot ?? null,
		scorer_id: null,
		scorer_from_loser_of: scorerFromLoser(d)
	}));
}

export interface SlotAssignment {
	matchId: string;
	player_a?: string;
	player_b?: string;
	scorer_id?: string;
}

/**
 * Trägt die Gruppenersten/-zweiten ins Achtelfinale ein, soweit die Gruppen fertig sind.
 * Bereits begonnene Matches werden nicht verändert.
 */
export function r16Assignments(
	groupIds: string[],
	standings: GroupStandings[],
	koMatches: MatchRow[]
): SlotAssignment[] {
	const defs = buildKnockout(groupIds).filter((d) => d.round === 'R16');
	const finalOf = new Map(standings.map((s) => [s.group.id, s.final]));
	const out: SlotAssignment[] = [];
	for (const d of defs) {
		const row = koMatches.find((m) => m.id === d.id);
		if (!row || row.status !== 'scheduled') continue;
		const pick = (src: (typeof d)['a']) =>
			src.type === 'group' ? (finalOf.get(src.group)?.[src.place - 1] ?? undefined) : undefined;
		const a = pick(d.a);
		const b = pick(d.b);
		const change: SlotAssignment = { matchId: d.id };
		if (a && a !== row.player_a) change.player_a = a;
		if (b && b !== row.player_b) change.player_b = b;
		if (change.player_a || change.player_b) out.push(change);
	}

	// Erste Welle: Zähler ist ein Spieler der zweiten Welle auf derselben Scheibe (spielt später)
	for (let i = 1; i <= R16_WAVE_SIZE; i++) {
		const row = koMatches.find((m) => m.id === `R16-${i}`);
		if (!row || row.status !== 'scheduled' || row.scorer_id) continue;
		const laterId = `R16-${i + R16_WAVE_SIZE}`;
		const later = koMatches.find((m) => m.id === laterId);
		const pending = out.find((c) => c.matchId === laterId);
		const candidate = pending?.player_a ?? later?.player_a ?? pending?.player_b ?? later?.player_b;
		if (!candidate) continue;
		const existing = out.find((c) => c.matchId === row.id);
		if (existing) existing.scorer_id = candidate;
		else out.push({ matchId: row.id, scorer_id: candidate });
	}
	return out;
}
