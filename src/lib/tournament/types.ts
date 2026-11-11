export type MatchStatus = 'scheduled' | 'live' | 'finished';

/** Ergebnis eines beendeten Matches (Legs aus Sicht von A und B). */
export interface MatchResult {
	playerA: string;
	playerB: string;
	legsA: number;
	legsB: number;
}

export interface Group {
	/** Gruppenbuchstabe, z. B. "A". */
	id: string;
	/** Spieler-IDs in Setzreihenfolge (wird als letzter Fallback bei Gleichstand genutzt). */
	playerIds: string[];
}

export interface ScheduledMatch {
	/** z. B. "A-2-1" = Gruppe A, Runde 2, Spiel 1 */
	id: string;
	stage: 'group';
	group: string;
	round: number;
	playerA: string;
	playerB: string;
	/** Scheibe, 1-basiert. */
	board: number;
	/** Position in der Warteschlange der Scheibe, 0-basiert. */
	queueIndex: number;
}

/** Kriterien bei Punktgleichheit, werden in der konfigurierten Reihenfolge angewendet. */
export type Tiebreaker = 'headToHead' | 'legDiff' | 'legsWon' | 'average';

export interface StandingsOptions {
	/** Punkte pro Sieg (Standard 2). */
	pointsPerWin: number;
	tiebreakers: Tiebreaker[];
	/** 3-Dart-Average pro Spieler, nur nötig falls "average" als Kriterium genutzt wird. */
	averages?: Record<string, number>;
	/** Manuelle Entscheidung der Turnierleitung für nicht auflösbare Gleichstände (Spieler-IDs, bester zuerst). */
	manualOrder?: string[];
}

export interface StandingRow {
	playerId: string;
	rank: number;
	played: number;
	wins: number;
	losses: number;
	legsFor: number;
	legsAgainst: number;
	legDiff: number;
	points: number;
	/**
	 * Gleiche Zahl bei Spielern, die nach allen Kriterien weiterhin gleichauf sind
	 * (die Reihenfolge ist dann nur vorläufig); sonst null.
	 */
	tieKey: number | null;
}
