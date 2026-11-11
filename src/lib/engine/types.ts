/** Multiplikator eines Darts: Single, Double, Triple. */
export type Multiplier = 1 | 2 | 3;

/**
 * Ein einzelner Dart.
 * - segment 0 = Fehlwurf (multiplier immer 1)
 * - segment 1..20 = Zahlenfelder
 * - segment 25 = Bull (multiplier 1 = Single Bull/25, 2 = Bullseye/50, kein Triple)
 */
export interface Dart {
	segment: number;
	multiplier: Multiplier;
}

/** Spieler-Platz im Match: 0 = links/Spieler 1, 1 = rechts/Spieler 2. */
export type PlayerSlot = 0 | 1;

export interface MatchConfig {
	/** Startpunktzahl pro Leg, normalerweise 501. */
	startScore: number;
	/** Anzahl Legs, die zum Matchgewinn nötig sind (First to N). */
	legsToWin: number;
	/** Double Out aktiv (Turnier: ja). */
	doubleOut: boolean;
	/** Wer wirft im ersten Leg zuerst. Danach wechselt der Anwurf pro Leg. */
	firstThrower: PlayerSlot;
}

/** Abgeschlossene Aufnahme (bis zu 3 Darts). */
export interface VisitRecord {
	player: PlayerSlot;
	leg: number;
	darts: Dart[];
	scoreBefore: number;
	scoreAfter: number;
	/** Erzielte Punkte der Aufnahme (0 bei Bust). */
	points: number;
	bust: boolean;
	checkout: boolean;
}

export interface LegResult {
	leg: number;
	winner: PlayerSlot;
	starter: PlayerSlot;
	/** Darts des Siegers in diesem Leg (Bust zählt als 3 Darts). */
	winnerDarts: number;
}

/**
 * Statistiken, die sich additiv über mehrere Matches zusammenführen lassen
 * (siehe mergeStats), damit daraus Turnier-Statistiken pro Spieler entstehen.
 */
export interface PlayerStats {
	pointsScored: number;
	dartsThrown: number;
	visits: number;
	highestVisit: number;
	highestFinish: number;
	/** Aufnahmen mit mindestens 100 / 140 Punkten (kumulativ, ohne Bust). */
	count100Plus: number;
	count140Plus: number;
	count180: number;
	legsWon: number;
	legsPlayed: number;
	/** Wenigste Darts in einem gewonnenen Leg, null falls noch keins gewonnen. */
	bestLegDarts: number | null;
}

export interface MatchState {
	config: MatchConfig;
	legsWon: [number, number];
	currentLeg: number;
	/** Live-Restpunktzahl, wird nach jedem einzelnen Dart aktualisiert. */
	remaining: [number, number];
	currentPlayer: PlayerSlot;
	/** Restpunktzahl des aktuellen Spielers zu Beginn seiner laufenden Aufnahme. */
	visitStartScore: number;
	/** Darts der laufenden (noch nicht abgeschlossenen) Aufnahme. */
	currentVisit: Dart[];
	/** Darts pro Spieler im aktuellen Leg (für Leg-Statistik). */
	legDarts: [number, number];
	visits: VisitRecord[];
	legResults: LegResult[];
	finished: boolean;
	winner: PlayerSlot | null;
	stats: [PlayerStats, PlayerStats];
}
