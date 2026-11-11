import { describe, expect, it } from 'vitest';
import { computeStandings, isGroupComplete, qualificationBlocked } from './standings';
import type { MatchResult } from './types';

const ids = ['A', 'B', 'C', 'D'];
const r = (playerA: string, legsA: number, legsB: number, playerB: string): MatchResult => ({
	playerA,
	playerB,
	legsA,
	legsB
});
const order = (rows: { playerId: string }[]) => rows.map((x) => x.playerId);

/**
 * A schlägt B (3:2), B und A haben je 2 Siege. B hat die bessere Leg-Differenz,
 * A den direkten Vergleich. C und D haben je 1 Sieg, D schlägt C direkt.
 */
const headToHeadVsLegDiff: MatchResult[] = [
	r('A', 3, 2, 'B'),
	r('C', 3, 1, 'A'),
	r('A', 3, 0, 'D'),
	r('B', 3, 0, 'C'),
	r('B', 3, 0, 'D'),
	r('D', 3, 0, 'C')
];

/** A, B und C schlagen sich im Kreis (jeweils 3:0) und alle schlagen D 3:0: identisch in allen Kriterien. */
const perfectCycle: MatchResult[] = [
	r('A', 3, 0, 'B'),
	r('B', 3, 0, 'C'),
	r('C', 3, 0, 'A'),
	r('A', 3, 0, 'D'),
	r('B', 3, 0, 'D'),
	r('C', 3, 0, 'D')
];

describe('Gruppentabelle', () => {
	it('sortiert nach Punkten und berechnet Legs', () => {
		const rows = computeStandings(ids, [
			r('A', 3, 0, 'B'),
			r('A', 3, 1, 'C'),
			r('A', 3, 2, 'D'),
			r('B', 3, 1, 'C'),
			r('B', 3, 0, 'D'),
			r('C', 3, 2, 'D')
		]);
		expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
		expect(rows.map((x) => x.points)).toEqual([6, 4, 2, 0]);
		expect(rows[0]).toMatchObject({
			rank: 1,
			played: 3,
			wins: 3,
			losses: 0,
			legsFor: 9,
			legsAgainst: 3,
			legDiff: 6,
			tieKey: null
		});
		expect(rows.every((x) => x.tieKey === null)).toBe(true);
	});

	it('Zwischenstand mit unvollständigen Spielen', () => {
		const rows = computeStandings(ids, [r('C', 3, 2, 'B')]);
		expect(order(rows).slice(0, 2)).toEqual(['C', 'A']);
		expect(rows.find((x) => x.playerId === 'C')!.played).toBe(1);
		expect(rows.find((x) => x.playerId === 'A')!.played).toBe(0);
	});

	it('Direkter Vergleich vor Leg-Differenz (Standard)', () => {
		const rows = computeStandings(ids, headToHeadVsLegDiff);
		expect(order(rows)).toEqual(['A', 'B', 'D', 'C']);
		expect(rows.every((x) => x.tieKey === null)).toBe(true);
	});

	it('Reihenfolge der Kriterien ist konfigurierbar', () => {
		const rows = computeStandings(ids, headToHeadVsLegDiff, {
			tiebreakers: ['legDiff', 'headToHead']
		});
		expect(order(rows).slice(0, 2)).toEqual(['B', 'A']);
	});

	it('Dreier-Kreisgleichstand fällt auf Leg-Differenz zurück', () => {
		// A beat B, B beat C, C beat A: direkter Vergleich trennt nicht, Leg-Differenz schon
		const rows = computeStandings(['A', 'B', 'C'], [r('A', 3, 2, 'B'), r('B', 3, 0, 'C'), r('C', 3, 1, 'A')]);
		// Alle haben 1 Sieg. Leg-Differenz im Kreis-Vergleich: B +2, A −1, C −1
		const diffs = Object.fromEntries(rows.map((x) => [x.playerId, x.legDiff]));
		expect(diffs).toEqual({ A: -1, B: 2, C: -1 });
		expect(rows.every((x) => x.points === 2)).toBe(true);
		// B ist vorn; zwischen A und C wird der direkte Vergleich erneut angewendet: C schlug A
		expect(order(rows)).toEqual(['B', 'C', 'A']);
		expect(rows.every((x) => x.tieKey === null)).toBe(true);
	});

	it('Nicht auflösbarer Gleichstand wird markiert und nach Setzreihenfolge sortiert', () => {
		const rows = computeStandings(ids, perfectCycle);
		expect(order(rows)).toEqual(['A', 'B', 'C', 'D']);
		const keys = rows.map((x) => x.tieKey);
		expect(keys[0]).not.toBeNull();
		expect(keys[0]).toBe(keys[1]);
		expect(keys[1]).toBe(keys[2]);
		expect(keys[3]).toBeNull();
	});

	it('Gleichstand an der Qualifikationsgrenze blockiert, manuelle Entscheidung löst ihn', () => {
		const rows = computeStandings(ids, perfectCycle);
		expect(qualificationBlocked(rows, 2)).toBe(true);
		expect(qualificationBlocked(rows, 3)).toBe(false); // Grenze zwischen C und D: kein Gleichstand

		const manual = computeStandings(ids, perfectCycle, { manualOrder: ['C', 'A', 'B'] });
		expect(order(manual)).toEqual(['C', 'A', 'B', 'D']);
		expect(manual.every((x) => x.tieKey === null)).toBe(true);
		expect(qualificationBlocked(manual, 2)).toBe(false);
	});

	it('Average als zusätzliches Kriterium', () => {
		const rows = computeStandings(ids, perfectCycle, {
			tiebreakers: ['headToHead', 'legDiff', 'legsWon', 'average'],
			averages: { A: 50, B: 60, C: 55, D: 40 }
		});
		expect(order(rows)).toEqual(['B', 'C', 'A', 'D']);
		expect(rows.every((x) => x.tieKey === null)).toBe(true);
	});

	it('Punkte pro Sieg sind konfigurierbar', () => {
		const rows = computeStandings(ids, [r('A', 3, 0, 'B')], { pointsPerWin: 3 });
		expect(rows[0]).toMatchObject({ playerId: 'A', points: 3 });
	});

	it('ignoriert Ergebnisse fremder Spieler', () => {
		const rows = computeStandings(ids, [r('X', 3, 0, 'Y'), r('A', 3, 0, 'B')]);
		expect(rows.reduce((s, x) => s + x.played, 0)).toBe(2);
	});
});

describe('Gruppe komplett', () => {
	it('erkennt abgeschlossene Gruppe (6 Matches bei 4 Spielern)', () => {
		expect(isGroupComplete(ids, perfectCycle)).toBe(true);
		expect(isGroupComplete(ids, perfectCycle.slice(0, 5))).toBe(false);
		expect(isGroupComplete(ids, [])).toBe(false);
	});
});
