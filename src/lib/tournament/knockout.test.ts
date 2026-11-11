import { describe, expect, it } from 'vitest';
import {
	buildKnockout,
	resolveKnockout,
	type KoMatchDef,
	type SlotSource
} from './knockout';

const groupIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const defs = buildKnockout(groupIds);
const byId = new Map(defs.map((d) => [d.id, d]));

/** Alle Setzplätze ("A1" = Gruppensieger A, "B2" = Zweiter B), die in einen Slot münden können. */
function seeds(source: SlotSource): string[] {
	if (source.type === 'group') return [`${source.group}${source.place}`];
	const d = byId.get(source.matchId)!;
	return [...seeds(d.a), ...seeds(d.b)];
}
const groupsOf = (s: SlotSource) => new Set(seeds(s).map((x) => x[0]));

describe('Turnierbaum', () => {
	it('besteht aus 8 + 4 + 2 + 1 Matches', () => {
		const count = (round: string) => defs.filter((d) => d.round === round).length;
		expect([count('R16'), count('QF'), count('SF'), count('F')]).toEqual([8, 4, 2, 1]);
		expect(new Set(defs.map((d) => d.id)).size).toBe(15);
	});

	it('Achtelfinale kreuzt benachbarte Gruppen (A1–B2, B1–A2, ...)', () => {
		const slot = (id: string) => {
			const d = byId.get(id)!;
			return [d.a, d.b].map((s) => (s as { group: string; place: number })).map((s) => `${s.group}${s.place}`);
		};
		expect(slot('R16-1')).toEqual(['A1', 'B2']);
		expect(slot('R16-2')).toEqual(['C1', 'D2']);
		expect(slot('R16-5')).toEqual(['B1', 'A2']);
		expect(slot('R16-8')).toEqual(['H1', 'G2']);
	});

	it('Spieler derselben Gruppe treffen vor dem Finale nie aufeinander', () => {
		for (const d of defs.filter((x) => x.round !== 'F')) {
			const ga = groupsOf(d.a);
			const gb = groupsOf(d.b);
			for (const g of ga) expect(gb.has(g)).toBe(false);
		}
	});

	it('Gruppensieger und Gruppenzweiter liegen in gegenüberliegenden Baumhälften', () => {
		const final = byId.get('F-1')!;
		const top = seeds(final.a);
		const bottom = seeds(final.b);
		for (const g of groupIds) {
			expect(top.includes(`${g}1`) !== top.includes(`${g}2`)).toBe(true);
			expect(top.includes(`${g}1`) ? bottom.includes(`${g}2`) : bottom.includes(`${g}1`)).toBe(true);
		}
		expect(top).toHaveLength(8);
		expect(bottom).toHaveLength(8);
	});

	it('Legs und Scheiben sind gesetzt', () => {
		for (const d of defs) {
			expect(d.legsToWin).toBeGreaterThanOrEqual(1);
			expect(d.board).toBeGreaterThanOrEqual(1);
			expect(d.board).toBeLessThanOrEqual(4);
		}
		expect(byId.get('F-1')!.board).toBe(1);
	});

	it('Legs pro Runde sind konfigurierbar', () => {
		const custom = buildKnockout(groupIds, {
			boardCount: 2,
			legsToWin: { R16: 3, QF: 4, SF: 5, F: 7 }
		});
		expect(custom.find((d) => d.id === 'R16-1')!.legsToWin).toBe(3);
		expect(custom.find((d) => d.id === 'F-1')!.legsToWin).toBe(7);
		expect(Math.max(...custom.map((d) => d.board))).toBe(2);
	});

	it('verlangt genau 8 Gruppen', () => {
		expect(() => buildKnockout(groupIds.slice(0, 6))).toThrow();
	});
});

describe('Turnierbaum befüllen', () => {
	it('füllt nur Matches, deren Gruppen fertig sind', () => {
		const resolved = resolveKnockout(defs, {
			groupRankings: { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3', 'b4'] },
			winners: {}
		});
		const get = (id: string) => resolved.find((r) => r.def.id === id)!;
		expect(get('R16-1')).toMatchObject({ playerA: 'a1', playerB: 'b2', ready: true, winner: null });
		expect(get('R16-5')).toMatchObject({ playerA: 'b1', playerB: 'a2', ready: true });
		expect(get('R16-2')).toMatchObject({ playerA: null, playerB: null, ready: false });
		expect(get('QF-1')).toMatchObject({ playerA: null, ready: false });
	});

	it('trägt Sieger in die nächste Runde ein', () => {
		const rankings: Record<string, string[]> = {};
		for (const g of groupIds) rankings[g] = [`${g}1`, `${g}2`, `${g}3`, `${g}4`];
		const resolved = resolveKnockout(defs, {
			groupRankings: rankings,
			winners: { 'R16-1': 'A1', 'R16-2': 'D2' }
		});
		const qf1 = resolved.find((r) => r.def.id === 'QF-1')!;
		expect(qf1).toMatchObject({ playerA: 'A1', playerB: 'D2', ready: true });
		expect(resolved.find((r) => r.def.id === 'R16-1')!.winner).toBe('A1');
		expect(resolved.find((r) => r.def.id === 'QF-2')!.ready).toBe(false);
	});
});

// Typ-Check: KoMatchDef bleibt exportiert
const _typeCheck: KoMatchDef | undefined = undefined;
void _typeCheck;
