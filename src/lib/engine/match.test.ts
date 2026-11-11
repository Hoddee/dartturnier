import { describe, expect, it } from 'vitest';
import { parseDart } from './dart';
import {
	applyDart,
	createMatch,
	legStarter,
	mergeStats,
	replay,
	threeDartAverage,
	undoLastDart
} from './match';
import type { MatchConfig, MatchState } from './types';

const base: MatchConfig = { startScore: 501, legsToWin: 3, doubleOut: true, firstThrower: 0 };

/** Wirft die Darts (als Labels) nacheinander. */
function play(state: MatchState, labels: string[]): MatchState {
	return labels.reduce((s, l) => applyDart(s, parseDart(l)), state);
}

describe('Matchstart', () => {
	it('beginnt mit Startscore und richtigem Anwerfer', () => {
		const s = createMatch(base);
		expect(s.remaining).toEqual([501, 501]);
		expect(s.currentPlayer).toBe(0);
		expect(s.finished).toBe(false);
		expect(createMatch({ ...base, firstThrower: 1 }).currentPlayer).toBe(1);
	});

	it('lehnt ungültige Konfiguration ab', () => {
		expect(() => createMatch({ ...base, startScore: 1 })).toThrow();
		expect(() => createMatch({ ...base, legsToWin: 0 })).toThrow();
	});

	it('Anwurf wechselt pro Leg', () => {
		expect(legStarter(base, 0)).toBe(0);
		expect(legStarter(base, 1)).toBe(1);
		expect(legStarter(base, 2)).toBe(0);
		expect(legStarter({ ...base, firstThrower: 1 }, 0)).toBe(1);
		expect(legStarter({ ...base, firstThrower: 1 }, 1)).toBe(0);
	});
});

describe('Aufnahmen', () => {
	it('aktualisiert den Rest nach jedem Dart und wechselt nach 3 Darts', () => {
		let s = createMatch(base);
		s = play(s, ['T20']);
		expect(s.remaining[0]).toBe(441);
		expect(s.currentPlayer).toBe(0);
		expect(s.currentVisit).toHaveLength(1);
		s = play(s, ['T20', 'T20']);
		expect(s.remaining[0]).toBe(321);
		expect(s.currentPlayer).toBe(1);
		expect(s.currentVisit).toHaveLength(0);
		expect(s.visits).toHaveLength(1);
		expect(s.visits[0].points).toBe(180);
		expect(s.stats[0].count180).toBe(1);
	});

	it('Anwurf von Spieler 2 funktioniert', () => {
		const s = play(createMatch({ ...base, firstThrower: 1 }), ['T20', 'T20', 'T20']);
		expect(s.remaining).toEqual([501, 321]);
		expect(s.currentPlayer).toBe(0);
	});

	it('wirft Fehler bei ungültigem Dart', () => {
		const s = createMatch(base);
		expect(() => applyDart(s, { segment: 25, multiplier: 3 })).toThrow();
	});

	it('verändert den übergebenen Stand nicht', () => {
		const s = createMatch(base);
		const snapshot = structuredClone(s);
		applyDart(s, parseDart('T20'));
		expect(s).toEqual(snapshot);
	});
});

describe('Bust', () => {
	// p0 hat nach zwei 180ern 141 Rest, p1 wirft jeweils 3 Fehlwürfe
	const to141 = () =>
		play(createMatch(base), [
			...['T20', 'T20', 'T20'],
			...['0', '0', '0'],
			...['T20', 'T20', 'T20'],
			...['0', '0', '0']
		]);

	it('Hilfsstand stimmt', () => {
		const s = to141();
		expect(s.remaining).toEqual([141, 501]);
		expect(s.currentPlayer).toBe(0);
	});

	it('Überwerfen: Rest zurück, Spielerwechsel, 0 Punkte', () => {
		let s = to141();
		s = play(s, ['T20', 'T20', 'T20']); // 81, 21, -39 -> Bust
		expect(s.remaining[0]).toBe(141);
		expect(s.currentPlayer).toBe(1);
		const last = s.visits[s.visits.length - 1];
		expect(last.bust).toBe(true);
		expect(last.points).toBe(0);
		expect(last.scoreAfter).toBe(141);
	});

	it('Bust beendet die Aufnahme sofort, auch vor dem 3. Dart', () => {
		let s = to141();
		s = play(s, ['T20', 'T20']); // 21 Rest
		s = play(s, ['T20']); // Bust beim 3. Dart
		expect(s.currentPlayer).toBe(1);
		let s2 = to141();
		s2 = play(s2, ['T20', 'T20', 'S20']); // 1 Rest -> Bust (Double Out)
		expect(s2.remaining[0]).toBe(141);
		expect(s2.currentPlayer).toBe(1);
		expect(s2.currentVisit).toHaveLength(0);
	});

	it('Rest 1 ist bei Double Out ein Bust', () => {
		const s = play(createMatch({ ...base, startScore: 40 }), ['S20', 'S19']);
		expect(s.remaining[0]).toBe(40); // 1 Rest -> Bust
		expect(s.currentPlayer).toBe(1);
	});

	it('Rest 0 ohne Double ist ein Bust', () => {
		let s = play(createMatch({ ...base, startScore: 40 }), ['S20', 'S20']);
		expect(s.remaining[0]).toBe(40);
		expect(s.visits[0].bust).toBe(true);
		expect(s.legsWon).toEqual([0, 0]);
		s = play(s, ['0', '0', '0']);
		expect(s.currentPlayer).toBe(0);
	});

	it('Ohne Double Out zählt Rest 1 und Finish ohne Double', () => {
		const cfg = { ...base, startScore: 40, doubleOut: false };
		let s = play(createMatch(cfg), ['S20', 'S19']);
		expect(s.remaining[0]).toBe(1);
		s = play(createMatch(cfg), ['S20', 'S20']);
		expect(s.legsWon).toEqual([1, 0]);
	});

	it('Bust zählt für Statistik als 3 Darts mit 0 Punkten', () => {
		const s = play(createMatch({ ...base, startScore: 40 }), ['S20', 'S20']);
		expect(s.stats[0].dartsThrown).toBe(3);
		expect(s.stats[0].pointsScored).toBe(0);
		expect(s.stats[0].visits).toBe(1);
		expect(s.stats[0].highestVisit).toBe(0);
	});
});

describe('Checkout und Legs', () => {
	it('Double schließt das Leg ab, Checkout-Wert wird gemerkt', () => {
		let s = play(createMatch(base), [
			...['T20', 'T20', 'T20'],
			...['0', '0', '0'],
			...['T20', 'T20', 'T20'],
			...['0', '0', '0'],
			...['T20', 'T19', 'D12']
		]);
		expect(s.legsWon).toEqual([1, 0]);
		expect(s.stats[0].highestFinish).toBe(141);
		expect(s.stats[0].bestLegDarts).toBe(9);
		expect(s.legResults).toEqual([{ leg: 0, winner: 0, starter: 0, winnerDarts: 9 }]);
		// neues Leg: volle Punkte, Gegner wirft an
		expect(s.remaining).toEqual([501, 501]);
		expect(s.currentLeg).toBe(1);
		expect(s.currentPlayer).toBe(1);
		expect(s.finished).toBe(false);
		s = play(s, ['0']);
		expect(s.remaining[1]).toBe(501);
	});

	it('Bullseye gilt als Double', () => {
		const s = play(createMatch({ ...base, startScore: 50 }), ['Bull']);
		expect(s.legsWon).toEqual([1, 0]);
		expect(s.stats[0].highestFinish).toBe(50);
	});

	it('Checkout mit 1 oder 2 Darts zählt nur die geworfenen Darts', () => {
		const s = play(createMatch({ ...base, startScore: 100 }), ['T20', 'D20']);
		expect(s.legsWon).toEqual([1, 0]);
		expect(s.stats[0].dartsThrown).toBe(2);
		expect(s.stats[0].bestLegDarts).toBe(2);
	});

	it('Match endet bei First to N, danach keine Darts mehr', () => {
		const cfg: MatchConfig = { ...base, startScore: 40, legsToWin: 2 };
		let s = play(createMatch(cfg), ['D20']); // Leg 1 an Spieler 0
		expect(s.legsWon).toEqual([1, 0]);
		expect(s.currentPlayer).toBe(1); // Spieler 1 wirft Leg 2 an
		s = play(s, ['0', '0', '0', 'D20']); // Spieler 1 verfehlt, Spieler 0 checkt
		expect(s.legsWon).toEqual([2, 0]);
		expect(s.finished).toBe(true);
		expect(s.winner).toBe(0);
		expect(() => applyDart(s, parseDart('T20'))).toThrow();
	});

	it('Spieler 2 kann das Match gewinnen', () => {
		const cfg: MatchConfig = { ...base, startScore: 40, legsToWin: 1, firstThrower: 1 };
		const s = play(createMatch(cfg), ['D20']);
		expect(s.finished).toBe(true);
		expect(s.winner).toBe(1);
		expect(s.legsWon).toEqual([0, 1]);
	});

	it('zählt gespielte Legs für beide Spieler', () => {
		const cfg: MatchConfig = { ...base, startScore: 40, legsToWin: 2 };
		const s = play(createMatch(cfg), ['D20', '0', '0', '0', 'D20']);
		expect(s.stats[0].legsPlayed).toBe(2);
		expect(s.stats[1].legsPlayed).toBe(2);
		expect(s.stats[0].legsWon).toBe(2);
		expect(s.stats[1].legsWon).toBe(0);
	});
});

describe('Undo (Event Sourcing)', () => {
	it('letzter Dart entfernen ergibt exakt den vorherigen Stand', () => {
		const darts = [
			'T20', 'T20', 'T20', '0', '0', '0', 'T20', 'T20', 'T20', '0', '0', '0', 'T20', 'T19', 'D12', '0'
		].map(parseDart);
		for (let n = 1; n <= darts.length; n++) {
			const full = replay(base, darts.slice(0, n));
			const undone = replay(base, undoLastDart(darts.slice(0, n)));
			expect(undone).toEqual(replay(base, darts.slice(0, n - 1)));
			expect(full).not.toEqual(undone);
		}
	});

	it('Undo nach Bust stellt die laufende Aufnahme wieder her', () => {
		const darts = ['T20', 'T20', 'T20', '0', '0', '0', 'T20', 'T20', 'T20', '0', '0', '0', 'T20', 'T20', 'T20'].map(
			parseDart
		);
		const bust = replay(base, darts);
		expect(bust.currentPlayer).toBe(1);
		const undone = replay(base, undoLastDart(darts));
		expect(undone.currentPlayer).toBe(0);
		expect(undone.remaining[0]).toBe(21);
		expect(undone.currentVisit).toHaveLength(2);
	});

	it('Undo nach Matchende macht das Match wieder spielbar', () => {
		const cfg: MatchConfig = { ...base, startScore: 40, legsToWin: 1 };
		const darts = [parseDart('D20')];
		expect(replay(cfg, darts).finished).toBe(true);
		const undone = replay(cfg, undoLastDart(darts));
		expect(undone.finished).toBe(false);
		expect(undone.winner).toBeNull();
	});
});

describe('Statistiken', () => {
	it('berechnet 3-Dart-Average', () => {
		// Spieler 0: 180 + 60 (in zwei Aufnahmen), 6 Darts -> 240/6*3 = 120
		const s = play(createMatch(base), [
			...['T20', 'T20', 'T20'],
			...['0', '0', '0'],
			...['T20', '0', '0']
		]);
		expect(s.stats[0].pointsScored).toBe(240);
		expect(s.stats[0].dartsThrown).toBe(6);
		expect(threeDartAverage(s.stats[0])).toBe(120);
		expect(threeDartAverage(s.stats[1])).toBe(0);
	});

	it('zählt 100+, 140+ und 180 kumulativ', () => {
		const s = play(createMatch(base), [
			...['T20', 'T20', 'T20'], // 180
			...['0', '0', '0'],
			...['T20', 'T20', 'S20'], // 140
			...['0', '0', '0'],
			...['T20', 'S20', 'S20'] // 100
		]);
		expect(s.stats[0].count100Plus).toBe(3);
		expect(s.stats[0].count140Plus).toBe(2);
		expect(s.stats[0].count180).toBe(1);
		expect(s.stats[0].highestVisit).toBe(180);
	});

	it('mergeStats summiert und nimmt Maxima/Minima', () => {
		const cfg: MatchConfig = { ...base, startScore: 40, legsToWin: 1 };
		const a = play(createMatch(cfg), ['D20']).stats[0];
		const b = play(createMatch({ ...cfg, startScore: 100 }), ['T20', 'D20']).stats[0];
		const m = mergeStats(a, b);
		expect(m.legsWon).toBe(2);
		expect(m.dartsThrown).toBe(3);
		expect(m.highestFinish).toBe(100);
		expect(m.bestLegDarts).toBe(1);
		expect(mergeStats(a, { ...b, bestLegDarts: null }).bestLegDarts).toBe(1);
	});
});
