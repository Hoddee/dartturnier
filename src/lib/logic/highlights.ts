/**
 * Höhepunkte für Einblendungen: 180er und High Finishes (Checkout ab 100).
 */
import type { MatchRow } from '../db-types';
import type { Data } from './derive';
import { matchState } from './derive';

export const HIGH_FINISH_MIN = 100;

export interface Highlight {
	/** Eindeutig pro Aufnahme, damit nichts doppelt eingeblendet wird */
	key: string;
	kind: '180' | 'finish';
	value: number;
	playerId: string;
	matchId: string;
	board: number | null;
}

export function highlightsOf(m: MatchRow, data: Data): Highlight[] {
	const darts = data.dartsByMatch[m.id];
	if (!darts?.length || !m.player_a || !m.player_b) return [];
	const s = matchState(m, darts);
	const out: Highlight[] = [];
	s.visits.forEach((v, i) => {
		if (v.bust) return;
		const playerId = v.player === 0 ? m.player_a! : m.player_b!;
		if (v.checkout && v.points >= HIGH_FINISH_MIN) {
			out.push({ key: `${m.id}:${i}:f`, kind: 'finish', value: v.points, playerId, matchId: m.id, board: m.board });
		} else if (v.points === 180) {
			out.push({ key: `${m.id}:${i}:180`, kind: '180', value: 180, playerId, matchId: m.id, board: m.board });
		}
	});
	return out;
}

export function allHighlights(data: Data): Highlight[] {
	return data.matches.filter((m) => m.status !== 'scheduled').flatMap((m) => highlightsOf(m, data));
}
