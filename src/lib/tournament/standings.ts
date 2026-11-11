import type { MatchResult, StandingRow, StandingsOptions } from './types';

export const DEFAULT_STANDINGS_OPTIONS: StandingsOptions = {
	pointsPerWin: 2,
	// Direkter Vergleich zuerst; danach Leg-Differenz, dann gewonnene Legs.
	// Noch nicht final entschieden: einfach hier oder per Parameter ändern.
	tiebreakers: ['headToHead', 'legDiff', 'legsWon']
};

interface Totals {
	played: number;
	wins: number;
	losses: number;
	legsFor: number;
	legsAgainst: number;
}

function emptyTotals(): Totals {
	return { played: 0, wins: 0, losses: 0, legsFor: 0, legsAgainst: 0 };
}

function tally(playerIds: string[], results: MatchResult[]): Map<string, Totals> {
	const map = new Map(playerIds.map((id) => [id, emptyTotals()]));
	for (const r of results) {
		const a = map.get(r.playerA);
		const b = map.get(r.playerB);
		if (!a || !b) continue; // Ergebnis gehört nicht zu dieser Gruppe
		a.played++;
		b.played++;
		a.legsFor += r.legsA;
		a.legsAgainst += r.legsB;
		b.legsFor += r.legsB;
		b.legsAgainst += r.legsA;
		if (r.legsA > r.legsB) {
			a.wins++;
			b.losses++;
		} else if (r.legsB > r.legsA) {
			b.wins++;
			a.losses++;
		}
	}
	return map;
}

/** Lexikographischer Vergleich, größer = besser. */
function compareKeysDesc(a: number[], b: number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const d = (b[i] ?? 0) - (a[i] ?? 0);
		if (d !== 0) return d;
	}
	return 0;
}

/** Teilt Spieler anhand eines Schlüssels in absteigend sortierte Untergruppen. */
function splitBy(players: string[], key: (id: string) => number[]): string[][] {
	const keyed = players.map((id) => ({ id, key: key(id) }));
	keyed.sort((x, y) => compareKeysDesc(x.key, y.key));
	const out: string[][] = [];
	for (let i = 0; i < keyed.length; i++) {
		if (i > 0 && compareKeysDesc(keyed[i - 1].key, keyed[i].key) === 0) {
			out[out.length - 1].push(keyed[i].id);
		} else {
			out.push([keyed[i].id]);
		}
	}
	return out;
}

/**
 * Löst Gleichstände auf. Liefert geordnete Untergruppen; Untergruppen mit mehr
 * als einem Spieler sind nach allen Kriterien weiterhin gleichauf.
 * Nach jeder Aufspaltung wird auf die verbleibenden Gleichauf-Gruppen die komplette
 * Kriterienliste erneut angewendet (insbesondere der direkte Vergleich nur
 * unter den noch gleichauf liegenden Spielern).
 */
function resolveTies(
	players: string[],
	totals: Map<string, Totals>,
	results: MatchResult[],
	opts: StandingsOptions
): string[][] {
	if (players.length <= 1) return [players];

	for (const criterion of opts.tiebreakers) {
		let groups: string[][];
		if (criterion === 'headToHead') {
			const set = new Set(players);
			const mini = tally(
				players,
				results.filter((r) => set.has(r.playerA) && set.has(r.playerB))
			);
			groups = splitBy(players, (id) => {
				const t = mini.get(id)!;
				return [t.wins * opts.pointsPerWin, t.legsFor - t.legsAgainst];
			});
		} else if (criterion === 'legDiff') {
			groups = splitBy(players, (id) => {
				const t = totals.get(id)!;
				return [t.legsFor - t.legsAgainst];
			});
		} else if (criterion === 'legsWon') {
			groups = splitBy(players, (id) => [totals.get(id)!.legsFor]);
		} else {
			if (!opts.averages) continue;
			groups = splitBy(players, (id) => [opts.averages![id] ?? 0]);
		}

		if (groups.length > 1) {
			return groups.flatMap((g) => resolveTies(g, totals, results, opts));
		}
	}
	return [players];
}

/**
 * Berechnet die Gruppentabelle. `playerIds` bestimmt außerdem die letzte Fallback-
 * Reihenfolge bei nicht auflösbarem Gleichstand (tieKey zeigt diese Fälle an).
 */
export function computeStandings(
	playerIds: string[],
	results: MatchResult[],
	options: Partial<StandingsOptions> = {}
): StandingRow[] {
	const opts: StandingsOptions = { ...DEFAULT_STANDINGS_OPTIONS, ...options };
	const totals = tally(playerIds, results);
	const points = (id: string) => totals.get(id)!.wins * opts.pointsPerWin;

	// 1. Nach Punkten gruppieren, 2. Gleichstände auflösen
	const byPoints = splitBy(playerIds, (id) => [points(id)]);
	const ordered: { id: string; tieKey: number | null }[] = [];
	let nextTieKey = 1;
	for (const bucket of byPoints) {
		for (const tiedGroup of resolveTies(bucket, totals, results, opts)) {
			let members = tiedGroup;
			let tieKey: number | null = null;
			if (members.length > 1) {
				if (opts.manualOrder) {
					const pos = (id: string) => {
						const i = opts.manualOrder!.indexOf(id);
						return i < 0 ? Number.MAX_SAFE_INTEGER : i;
					};
					const manual = [...members].sort((a, b) => pos(a) - pos(b));
					const allListed = members.every((id) => opts.manualOrder!.includes(id));
					members = manual;
					if (!allListed) tieKey = nextTieKey++;
				} else {
					tieKey = nextTieKey++;
				}
			}
			for (const id of members) ordered.push({ id, tieKey });
		}
	}

	return ordered.map(({ id, tieKey }, i) => {
		const t = totals.get(id)!;
		return {
			playerId: id,
			rank: i + 1,
			played: t.played,
			wins: t.wins,
			losses: t.losses,
			legsFor: t.legsFor,
			legsAgainst: t.legsAgainst,
			legDiff: t.legsFor - t.legsAgainst,
			points: points(id),
			tieKey
		};
	});
}

/** Alle Spiele einer Gruppe (Jeder-gegen-jeden) sind gespielt. */
export function isGroupComplete(playerIds: string[], results: MatchResult[]): boolean {
	const n = playerIds.length;
	const set = new Set(playerIds);
	const finished = results.filter((r) => set.has(r.playerA) && set.has(r.playerB)).length;
	return finished >= (n * (n - 1)) / 2;
}

/**
 * Wahr, wenn ein ungelöster Gleichstand genau an der Qualifikationsgrenze liegt
 * (z. B. Platz 2 und 3 bei 2 Aufsteigern). Dann muss die Turnierleitung entscheiden
 * (manualOrder), bevor das Achtelfinale befüllt wird.
 */
export function qualificationBlocked(rows: StandingRow[], advance: number): boolean {
	const a = rows[advance - 1];
	const b = rows[advance];
	return !!a && !!b && a.tieKey !== null && a.tieKey === b.tieKey;
}
