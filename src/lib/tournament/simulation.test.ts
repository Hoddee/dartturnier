import { describe, expect, it } from 'vitest';
import { buildGroupSchedule, drawGroups } from './groups';
import { buildKnockout, resolveKnockout } from './knockout';
import { computeStandings, isGroupComplete, qualificationBlocked } from './standings';
import type { MatchResult } from './types';

function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Komplettes Probe-Turnier mit 32 Spielern und zufälligen Ergebnissen. */
function simulate(seed: number) {
	const rng = mulberry32(seed);
	const players = Array.from({ length: 32 }, (_, i) => `p${i + 1}`);
	const groups = drawGroups(players, 4, rng);
	const schedule = buildGroupSchedule(groups, 4);

	const results: MatchResult[] = schedule.map((m) => {
		const aWins = rng() < 0.5;
		const loserLegs = Math.floor(rng() * 3); // 0..2
		return {
			playerA: m.playerA,
			playerB: m.playerB,
			legsA: aWins ? 3 : loserLegs,
			legsB: aWins ? loserLegs : 3
		};
	});

	const groupRankings: Record<string, string[]> = {};
	let manualResolutions = 0;
	for (const g of groups) {
		expect(isGroupComplete(g.playerIds, results)).toBe(true);
		let rows = computeStandings(g.playerIds, results);
		if (qualificationBlocked(rows, 2)) {
			// Turnierleitung entscheidet: hier einfach in Setzreihenfolge
			manualResolutions++;
			rows = computeStandings(g.playerIds, results, { manualOrder: g.playerIds });
			expect(qualificationBlocked(rows, 2)).toBe(false);
		}
		groupRankings[g.id] = rows.map((r) => r.playerId);
	}

	const defs = buildKnockout(groups.map((g) => g.id));
	const winners: Record<string, string> = {};
	const losers: Record<string, string> = {};
	for (const def of defs) {
		const m = resolveKnockout(defs, { groupRankings, winners, losers }).find((r) => r.def.id === def.id)!;
		expect(m.ready).toBe(true);
		const aWins = rng() < 0.5;
		winners[def.id] = aWins ? m.playerA! : m.playerB!;
		losers[def.id] = aWins ? m.playerB! : m.playerA!;
	}
	return { players, groups, schedule, groupRankings, defs, winners, manualResolutions };
}

describe('Probe-Turnier (32 Spieler)', () => {
	for (const seed of [1, 2, 3, 42, 2026]) {
		it(`läuft vollständig durch (Seed ${seed})`, () => {
			const t = simulate(seed);
			expect(t.schedule).toHaveLength(48);
			expect(Object.keys(t.winners)).toHaveLength(16);

			// Genau 16 Spieler im Achtelfinale, alle aus den Top 2 ihrer Gruppe
			const r16 = resolveKnockout(t.defs, { groupRankings: t.groupRankings, winners: {} }).filter(
				(m) => m.def.round === 'R16'
			);
			const r16Players = r16.flatMap((m) => [m.playerA!, m.playerB!]);
			expect(new Set(r16Players).size).toBe(16);
			const topTwo = Object.values(t.groupRankings).flatMap((rank) => rank.slice(0, 2));
			expect([...r16Players].sort()).toEqual([...topTwo].sort());

			// Der Gewinner ist ein Teilnehmer
			expect(t.players).toContain(t.winners['F-1']);
		});
	}
});
