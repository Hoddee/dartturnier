/**
 * Pläne für Aktionen der Turnierleitung: Spielplan erzeugen, KO-Baum anlegen,
 * Achtelfinale befüllen. Reine Funktionen; die Datenbank-Schreibzugriffe macht das Admin-Panel.
 */
import type { MatchRow, NewMatch, TournamentSettingsRow } from '../db-types';
import { buildGroupSchedule } from '../tournament/groups';
import { buildKnockout } from '../tournament/knockout';
import type { GroupView, GroupStandings } from './derive';

export const BOARD_COUNT = 4;

export function groupMatchRows(groups: GroupView[], settings: TournamentSettingsRow): NewMatch[] {
	return buildGroupSchedule(groups, BOARD_COUNT).map((m) => ({
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
		next_slot: null
	}));
}

const ROUND_QUEUE_BASE = { R16: 100, QF: 200, SF: 300, F: 400 } as const;

/** KO-Matches inkl. Verknüpfung zum Folgematch (für das automatische Weiterrücken). */
export function koMatchRows(groupIds: string[], settings: TournamentSettingsRow): NewMatch[] {
	const defs = buildKnockout(groupIds, { boardCount: BOARD_COUNT, legsToWin: settings.ko_legs_to_win });
	const next = new Map<string, { id: string; slot: 0 | 1 }>();
	for (const d of defs) {
		if (d.a.type === 'winner') next.set(d.a.matchId, { id: d.id, slot: 0 });
		if (d.b.type === 'winner') next.set(d.b.matchId, { id: d.id, slot: 1 });
	}
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
		next_slot: next.get(d.id)?.slot ?? null
	}));
}

export interface SlotAssignment {
	matchId: string;
	player_a?: string;
	player_b?: string;
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
	return out;
}
