/**
 * Komplettes Turnier über den Demo-Speicher (gleiche Regeln wie die Supabase-Funktionen):
 * 32 Spieler anlegen, Gruppen, Spielplan, jedes Match Dart für Dart über die Board-Funktionen
 * spielen, Achtelfinale befüllen, KO-Runden bis zum Sieger.
 */
import { describe, expect, it } from 'vitest';
import { applyChange } from '../data/apply';
import { BackendError } from '../data/backend';
import { DEMO_BOARD_KEY, MemoryBackend } from '../data/memory-backend';
import type { Change } from '../db-types';
import { applyDart, createMatch } from '../engine/match';
import { splitIntoGroups } from '../tournament/groups';
import {
	currentMatchForBoard,
	deriveAll,
	matchConfig,
	toData,
	upcomingForBoard,
	type Data
} from './derive';
import { groupMatchRows, koMatchRows, r16Assignments } from './plans';
import { seededRng, simulateMatch } from './simulate';

const KEY = DEMO_BOARD_KEY;

async function playMatchViaBoard(be: MemoryBackend, data: Data, matchId: string, rng: () => number) {
	const m = data.matches.find((x) => x.id === matchId)!;
	await be.boardReady(KEY, matchId, 0);
	await be.boardReady(KEY, matchId, 1);
	const first = rng() < 0.5 ? 0 : 1;
	await be.boardSetFirstThrower(KEY, matchId, first);
	const config = matchConfig({ legs_to_win: m.legs_to_win, first_thrower: first });
	const { darts } = simulateMatch(config, [0.4 + rng() * 0.5, 0.4 + rng() * 0.5], rng);
	let s = createMatch(config);
	for (let i = 0; i < darts.length; i++) {
		s = applyDart(s, darts[i]);
		await be.boardAddDart(KEY, {
			matchId,
			seq: i + 1,
			segment: darts[i].segment,
			multiplier: darts[i].multiplier,
			legsA: s.legsWon[0],
			legsB: s.legsWon[1],
			winnerSlot: s.winner
		});
	}
}

describe('Turnier komplett über die Board-Funktionen', () => {
	it('läuft von der Anmeldung bis zum Turniersieger', { timeout: 120_000 }, async () => {
		const be = new MemoryBackend({ latency: false, persist: false });

		const rng = seededRng(7);
		const names = Array.from({ length: 32 }, (_, i) => `Spieler ${i + 1}`);
		await be.addPlayers(names);
		let data = toData(await be.loadAll());
		expect(data.players.map((p) => p.name)).toEqual(names);

		const groups = splitIntoGroups(
			data.players.map((p) => p.id),
			4
		);
		await be.saveGroups(groups);
		data = toData(await be.loadAll());
		await be.replaceMatches('group', groupMatchRows(deriveAll(data).groups, data.settings));
		await be.replaceMatches('ko', koMatchRows(deriveAll(data).groups.map((g) => g.id), data.settings));
		data = toData(await be.loadAll());
		expect(data.matches.filter((m) => m.stage === 'group')).toHaveLength(48);
		expect(data.matches.filter((m) => m.stage === 'ko')).toHaveLength(16);

		// Zähler in der Gruppenphase: immer ein Gruppenmitglied, das nicht spielt, fair verteilt
		for (const g of deriveAll(data).groups) {
			const gm = data.matches.filter((m) => m.group_id === g.id);
			const counts = new Map(g.playerIds.map((p) => [p, 0]));
			for (const m of gm) {
				expect(g.playerIds).toContain(m.scorer_id);
				expect([m.player_a, m.player_b]).not.toContain(m.scorer_id);
				counts.set(m.scorer_id!, counts.get(m.scorer_id!)! + 1);
			}
			expect([...counts.values()].sort()).toEqual([1, 1, 2, 2]);
		}

		// Falscher Schlüssel wird abgelehnt
		await expect(be.boardReady('falsch', 'A-1-1', 0)).rejects.toBeInstanceOf(BackendError);

		// Gruppenphase: jede Scheibe arbeitet ihre Warteschlange ab
		for (let guard = 0; guard < 100; guard++) {
			data = toData(await be.loadAll());
			const current = [1, 2, 3, 4]
				.map((b) => currentMatchForBoard(data.matches, b))
				.filter((m) => m && m.stage === 'group');
			if (current.length === 0) break;
			for (const m of current) await playMatchViaBoard(be, data, m!.id, rng);
		}
		data = toData(await be.loadAll());
		expect(data.matches.filter((m) => m.stage === 'group' && m.status === 'finished')).toHaveLength(48);

		let view = deriveAll(data);
		expect(view.standings.every((s) => s.complete)).toBe(true);
		// Gleichstände an der Grenze entscheidet die Turnierleitung (hier: Setzreihenfolge)
		for (const s of view.standings.filter((x) => x.blocked)) {
			await be.setOverride(s.group.id, s.rows.map((r) => r.playerId));
		}
		data = toData(await be.loadAll());
		view = deriveAll(data);
		expect(view.standings.every((s) => s.final)).toBe(true);

		const assignments = r16Assignments(
			view.groups.map((g) => g.id),
			view.standings,
			data.matches.filter((m) => m.stage === 'ko')
		);
		expect(assignments).toHaveLength(8);
		for (const a of assignments) {
			const { matchId, ...patch } = a;
			await be.updateMatch(matchId, patch);
		}
		data = toData(await be.loadAll());
		// Erste Achtelfinal-Welle: Zähler spielt später auf derselben Scheibe
		for (let i = 1; i <= 4; i++) {
			const early = data.matches.find((m) => m.id === `R16-${i}`)!;
			const late = data.matches.find((m) => m.id === `R16-${i + 4}`)!;
			expect(early.board).toBe(late.board);
			expect([late.player_a, late.player_b]).toContain(early.scorer_id);
			expect(late.scorer_from_loser_of).toBe(early.id);
		}

		// KO-Phase: Sieger rücken automatisch nach
		for (let guard = 0; guard < 50; guard++) {
			data = toData(await be.loadAll());
			const current = [1, 2, 3, 4].map((b) => currentMatchForBoard(data.matches, b)).filter(Boolean);
			if (current.length === 0) break;
			for (const m of current) await playMatchViaBoard(be, data, m!.id, rng);
		}
		data = toData(await be.loadAll());
		const ko = data.matches.filter((m) => m.stage === 'ko');
		expect(ko.every((m) => m.status === 'finished')).toBe(true);
		// Zweite Welle wurde von den Verlierern der ersten gezählt
		for (let i = 1; i <= 4; i++) {
			const early = ko.find((m) => m.id === `R16-${i}`)!;
			const late = ko.find((m) => m.id === `R16-${i + 4}`)!;
			const loser = early.winner_id === early.player_a ? early.player_b : early.player_a;
			expect(late.scorer_id).toBe(loser);
		}
		expect(ko.find((m) => m.id === 'QF-1')!.scorer_id).toBeNull();
		// Spiel um Platz 3 mit den Halbfinal-Verlierern
		const sfLosers = ['SF-1', 'SF-2'].map((id) => {
			const m = ko.find((x) => x.id === id)!;
			return m.winner_id === m.player_a ? m.player_b : m.player_a;
		});
		const p3 = ko.find((m) => m.id === 'P3-1')!;
		expect([p3.player_a, p3.player_b]).toEqual(sfLosers);
		expect(p3.winner_id).not.toBeNull();
		const final = ko.find((m) => m.id === 'F-1')!;
		expect(final.winner_id).not.toBeNull();
		expect(final.legs_a === final.legs_to_win || final.legs_b === final.legs_to_win).toBe(true);

		// Statistiken sind gefüllt und plausibel
		view = deriveAll(data);
		expect(Object.keys(view.totals)).toHaveLength(32);
		expect(view.leaders.highestVisit[0].value).toBeLessThanOrEqual(180);
		expect(view.leaders.highestFinish[0].value).toBeLessThanOrEqual(170);
		expect(view.leaders.bestAverage[0].value).toBeGreaterThan(20);
		for (const b of [1, 2, 3, 4]) {
			expect(currentMatchForBoard(data.matches, b)).toBeNull();
			expect(upcomingForBoard(data.matches, b)).toHaveLength(0);
		}
	});
});

describe('Änderungen anwenden', () => {
	const base: Data = toData({
		players: [],
		groupPlayers: [],
		matches: [],
		darts: [
			{ match_id: 'M', seq: 1, segment: 20, multiplier: 3 },
			{ match_id: 'X', seq: 1, segment: 1, multiplier: 1 }
		],
		settings: {
			id: 1,
			name: 'T',
			points_per_win: 2,
			tiebreakers: [],
			group_legs_to_win: 3,
			ko_legs_to_win: { R16: 3, QF: 4, SF: 5, P3: 5, F: 6 },
			event_date: '2026-12-28',
			start_time: '14:00',
			slot_minutes: 20,
			ko_times: { R16a: '18:30', R16b: '19:05', QF: '19:45', SF: '20:35', P3: '21:15', F: '22:00' }
		},
		overrides: []
	});

	it('Darts einfügen und löschen, idempotent, andere Matches unberührt', () => {
		const add: Change = { kind: 'upsert', table: 'darts', row: { match_id: 'M', seq: 2, segment: 19, multiplier: 1 } };
		const d1 = applyChange(base, add);
		expect(d1.dartsByMatch.M.map((d) => d.seq)).toEqual([1, 2]);
		expect(d1.dartsByMatch.X).toBe(base.dartsByMatch.X);
		expect(applyChange(d1, add)).toBe(d1);
		const d2 = applyChange(d1, { kind: 'delete', table: 'darts', row: { match_id: 'M', seq: 2 } });
		expect(d2.dartsByMatch.M.map((d) => d.seq)).toEqual([1]);
		expect(applyChange(d2, { kind: 'delete', table: 'darts', row: { match_id: 'M', seq: 2 } })).toBe(d2);
	});
});

describe('Zeitplan', () => {
	it('verteilt Gruppenspiele im 20-Minuten-Takt ab 14 Uhr und setzt KO-Zeiten', async () => {
		const { plannedStart } = await import('./derive');
		const { DEFAULT_SETTINGS } = await import('../db-types');
		const ids = Array.from({ length: 32 }, (_, i) => `p${i}`);
		const groups = splitIntoGroups(ids, 4);
		const rows = [...groupMatchRows(groups, DEFAULT_SETTINGS), ...koMatchRows(groups.map((g) => g.id), DEFAULT_SETTINGS)];
		const matches = rows.map((r) => ({ ...r, status: 'scheduled' })) as unknown as import('../db-types').MatchRow[];
		const t = (id: string) => {
			const d = plannedStart(matches.find((m) => m.id === id)!, DEFAULT_SETTINGS, matches)!;
			return `${d.getDate()}.${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
		};
		const board1 = matches.filter((m) => m.stage === 'group' && m.board === 1).sort((a, b) => a.queue_index! - b.queue_index!);
		expect(t(board1[0].id)).toBe('28.12. 14:00');
		expect(t(board1[1].id)).toBe('28.12. 14:20');
		expect(t(board1[11].id)).toBe('28.12. 17:40');
		expect(t('R16-1')).toBe('28.12. 18:30');
		expect(t('R16-5')).toBe('28.12. 19:05');
		expect(t('QF-2')).toBe('28.12. 19:45');
		expect(t('SF-1')).toBe('28.12. 20:35');
		expect(t('P3-1')).toBe('28.12. 21:15');
		expect(t('F-1')).toBe('28.12. 22:00');
	});
});
