import { describe, expect, it } from 'vitest';
import {
	buildGroupSchedule,
	drawGroups,
	groupBoard,
	nextMatchForBoard,
	roundRobinRounds,
	splitIntoGroups
} from './groups';
import type { MatchStatus } from './types';

const players = Array.from({ length: 32 }, (_, i) => `p${i + 1}`);

/** Kleiner deterministischer Zufallsgenerator für reproduzierbare Tests. */
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

describe('Gruppeneinteilung', () => {
	it('teilt 32 Spieler der Reihe nach in 8 Gruppen à 4', () => {
		const groups = splitIntoGroups(players, 4);
		expect(groups.map((g) => g.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
		expect(groups[0].playerIds).toEqual(['p1', 'p2', 'p3', 'p4']);
		expect(groups[7].playerIds).toEqual(['p29', 'p30', 'p31', 'p32']);
	});

	it('meldet ungeeignete Spielerzahlen', () => {
		expect(() => splitIntoGroups(players.slice(0, 30), 4)).toThrow();
		expect(() => splitIntoGroups([], 4)).toThrow();
	});

	it('Auslosung ist reproduzierbar und verliert niemanden', () => {
		const a = drawGroups(players, 4, mulberry32(42));
		const b = drawGroups(players, 4, mulberry32(42));
		expect(a).toEqual(b);
		expect(a.flatMap((g) => g.playerIds).sort()).toEqual([...players].sort());
		expect(a).not.toEqual(splitIntoGroups(players, 4));
	});
});

describe('Round Robin', () => {
	function check(n: number) {
		const rounds = roundRobinRounds(n);
		const seen = new Set<string>();
		for (const round of rounds) {
			const inRound = new Set<number>();
			for (const [a, b] of round) {
				expect(inRound.has(a) || inRound.has(b)).toBe(false);
				inRound.add(a);
				inRound.add(b);
				seen.add([Math.min(a, b), Math.max(a, b)].join('-'));
			}
		}
		expect(seen.size).toBe((n * (n - 1)) / 2);
		return rounds;
	}

	it('4 Spieler: 3 Runden à 2 Spiele, jede Paarung genau einmal', () => {
		const rounds = check(4);
		expect(rounds).toHaveLength(3);
		expect(rounds.every((x) => x.length === 2)).toBe(true);
	});

	it('funktioniert auch für 3, 5 und 6 Spieler (Freilos bei ungerade)', () => {
		expect(check(3)).toHaveLength(3);
		expect(check(5)).toHaveLength(5);
		expect(check(6)).toHaveLength(5);
	});
});

describe('Spielplan', () => {
	const groups = splitIntoGroups(players, 4);
	const schedule = buildGroupSchedule(groups, 4);

	it('Gruppen wechseln sich auf den Scheiben ab (A+E → 1, B+F → 2, ...)', () => {
		expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => groupBoard(i, 4))).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
		const boardOf = (g: string) => new Set(schedule.filter((m) => m.group === g).map((m) => m.board));
		expect(boardOf('A')).toEqual(new Set([1]));
		expect(boardOf('E')).toEqual(new Set([1]));
		expect(boardOf('D')).toEqual(new Set([4]));
		expect(boardOf('H')).toEqual(new Set([4]));
	});

	it('48 Gruppenspiele, 12 pro Scheibe, IDs eindeutig', () => {
		expect(schedule).toHaveLength(48);
		expect(new Set(schedule.map((m) => m.id)).size).toBe(48);
		for (let b = 1; b <= 4; b++) {
			const q = schedule.filter((m) => m.board === b).sort((x, y) => x.queueIndex - y.queueIndex);
			expect(q).toHaveLength(12);
			expect(q.map((m) => m.queueIndex)).toEqual(Array.from({ length: 12 }, (_, i) => i));
		}
	});

	it('jede Paarung innerhalb einer Gruppe kommt genau einmal vor', () => {
		for (const g of groups) {
			const pairs = schedule
				.filter((m) => m.group === g.id)
				.map((m) => [m.playerA, m.playerB].sort().join('|'));
			expect(pairs).toHaveLength(6);
			expect(new Set(pairs).size).toBe(6);
			for (const p of pairs) {
				for (const id of p.split('|')) expect(g.playerIds).toContain(id);
			}
		}
	});

	it('kein Spieler hat zwei Matches direkt hintereinander an derselben Scheibe', () => {
		for (let b = 1; b <= 4; b++) {
			const q = schedule.filter((m) => m.board === b).sort((x, y) => x.queueIndex - y.queueIndex);
			for (let i = 1; i < q.length; i++) {
				const prev = new Set([q[i - 1].playerA, q[i - 1].playerB]);
				expect(prev.has(q[i].playerA)).toBe(false);
				expect(prev.has(q[i].playerB)).toBe(false);
			}
		}
	});

	it('Match-IDs folgen dem Schema Gruppe-Runde-Spiel', () => {
		expect(schedule.find((m) => m.queueIndex === 0 && m.board === 1)!.id).toBe('A-1-1');
		expect(schedule.map((m) => m.id)).toContain('H-3-2');
	});
});

describe('Nächstes Match pro Scheibe', () => {
	const schedule = buildGroupSchedule(splitIntoGroups(players, 4), 4);
	const queue1 = schedule.filter((m) => m.board === 1).sort((a, b) => a.queueIndex - b.queueIndex);

	it('liefert das erste offene Match', () => {
		expect(nextMatchForBoard(schedule, {}, 1)!.id).toBe(queue1[0].id);
		const status: Record<string, MatchStatus> = { [queue1[0].id]: 'finished' };
		expect(nextMatchForBoard(schedule, status, 1)!.id).toBe(queue1[1].id);
	});

	it('bevorzugt ein laufendes Match', () => {
		const status: Record<string, MatchStatus> = {
			[queue1[0].id]: 'finished',
			[queue1[3].id]: 'live'
		};
		expect(nextMatchForBoard(schedule, status, 1)!.id).toBe(queue1[3].id);
	});

	it('liefert null, wenn alles gespielt ist', () => {
		const status = Object.fromEntries(queue1.map((m) => [m.id, 'finished' as MatchStatus]));
		expect(nextMatchForBoard(schedule, status, 1)).toBeNull();
		expect(nextMatchForBoard(schedule, status, 2)).not.toBeNull();
	});
});
