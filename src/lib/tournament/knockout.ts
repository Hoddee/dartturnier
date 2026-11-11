/** P3 = Spiel um Platz 3 */
export type KoRound = 'R16' | 'QF' | 'SF' | 'P3' | 'F';

export type SlotSource =
	| { type: 'group'; group: string; place: number }
	| { type: 'winner'; matchId: string }
	| { type: 'loser'; matchId: string };

export interface KoMatchDef {
	/** z. B. "R16-3", "QF-1", "SF-2", "F-1" */
	id: string;
	round: KoRound;
	/** Position innerhalb der Runde, 1-basiert (von oben nach unten im Turnierbaum). */
	index: number;
	a: SlotSource;
	b: SlotSource;
	legsToWin: number;
	/** Vorgeschlagene Scheibe (1-basiert); die Turnierleitung kann sie überschreiben. */
	board: number;
}

export interface KoConfig {
	/** Legs zum Sieg pro Runde. */
	legsToWin: Record<KoRound, number>;
	boardCount: number;
}

export const DEFAULT_KO_CONFIG: KoConfig = {
	legsToWin: { R16: 3, QF: 4, SF: 5, P3: 5, F: 6 },
	boardCount: 4
};

export const KO_ROUND_LABELS: Record<KoRound, string> = {
	R16: 'Achtelfinale',
	QF: 'Viertelfinale',
	SF: 'Halbfinale',
	P3: 'Spiel um Platz 3',
	F: 'Finale'
};

/**
 * Turnierbaum für 8 Gruppen (je 2 Aufsteiger → 16 Spieler).
 *
 * Paarungen im Achtelfinale kreuzen die Gruppen paarweise (A1–B2, B1–A2, C1–D2, ...).
 * Beide Spieler einer Gruppe landen in gegenüberliegenden Baumhälften und können
 * erst im Finale wieder aufeinandertreffen.
 */
export function buildKnockout(
	groupIds: string[],
	config: KoConfig = DEFAULT_KO_CONFIG
): KoMatchDef[] {
	if (groupIds.length !== 8) {
		throw new Error('Der Turnierbaum ist aktuell nur für genau 8 Gruppen vorgesehen');
	}
	const g = (group: string, place: number): SlotSource => ({ type: 'group', group, place });
	const w = (matchId: string): SlotSource => ({ type: 'winner', matchId });
	const l = (matchId: string): SlotSource => ({ type: 'loser', matchId });

	// Obere Baumhälfte: Sieger der Gruppen 1 gegen Zweite der Nachbargruppe; untere Hälfte gespiegelt.
	const pairs: [SlotSource, SlotSource][] = [];
	for (let i = 0; i < 8; i += 2) pairs.push([g(groupIds[i], 1), g(groupIds[i + 1], 2)]);
	for (let i = 0; i < 8; i += 2) pairs.push([g(groupIds[i + 1], 1), g(groupIds[i], 2)]);

	const defs: KoMatchDef[] = [];
	const board = (n: number) => ((n - 1) % config.boardCount) + 1;

	pairs.forEach(([a, b], i) =>
		defs.push({
			id: `R16-${i + 1}`,
			round: 'R16',
			index: i + 1,
			a,
			b,
			legsToWin: config.legsToWin.R16,
			board: board(i + 1)
		})
	);
	for (let i = 1; i <= 4; i++) {
		defs.push({
			id: `QF-${i}`,
			round: 'QF',
			index: i,
			a: w(`R16-${2 * i - 1}`),
			b: w(`R16-${2 * i}`),
			legsToWin: config.legsToWin.QF,
			board: board(i)
		});
	}
	for (let i = 1; i <= 2; i++) {
		defs.push({
			id: `SF-${i}`,
			round: 'SF',
			index: i,
			a: w(`QF-${2 * i - 1}`),
			b: w(`QF-${2 * i}`),
			legsToWin: config.legsToWin.SF,
			board: board(i)
		});
	}
	defs.push({
		id: 'P3-1',
		round: 'P3',
		index: 1,
		a: l('SF-1'),
		b: l('SF-2'),
		legsToWin: config.legsToWin.P3 ?? config.legsToWin.SF,
		board: Math.min(2, config.boardCount)
	});
	defs.push({
		id: 'F-1',
		round: 'F',
		index: 1,
		a: w('SF-1'),
		b: w('SF-2'),
		legsToWin: config.legsToWin.F,
		board: 1
	});
	return defs;
}

export interface KoContext {
	/**
	 * Endgültige Gruppenreihenfolge (Spieler-IDs, Platz 1 zuerst) pro Gruppe.
	 * Nur eintragen, wenn die Gruppe abgeschlossen und der Gleichstand geklärt ist.
	 */
	groupRankings: Record<string, string[] | undefined>;
	/** Sieger bereits beendeter KO-Matches (matchId → Spieler-ID). */
	winners: Record<string, string | undefined>;
	/** Verlierer bereits beendeter KO-Matches (für das Spiel um Platz 3). */
	losers?: Record<string, string | undefined>;
}

export interface ResolvedKoMatch {
	def: KoMatchDef;
	playerA: string | null;
	playerB: string | null;
	winner: string | null;
	/** Beide Spieler stehen fest, das Match kann starten. */
	ready: boolean;
}

function resolveSlot(source: SlotSource, ctx: KoContext): string | null {
	if (source.type === 'group') return ctx.groupRankings[source.group]?.[source.place - 1] ?? null;
	if (source.type === 'loser') return ctx.losers?.[source.matchId] ?? null;
	return ctx.winners[source.matchId] ?? null;
}

/** Befüllt den Turnierbaum mit den bisher feststehenden Spielern. */
export function resolveKnockout(defs: KoMatchDef[], ctx: KoContext): ResolvedKoMatch[] {
	return defs.map((def) => {
		const playerA = resolveSlot(def.a, ctx);
		const playerB = resolveSlot(def.b, ctx);
		return {
			def,
			playerA,
			playerB,
			winner: ctx.winners[def.id] ?? null,
			ready: playerA !== null && playerB !== null
		};
	});
}
