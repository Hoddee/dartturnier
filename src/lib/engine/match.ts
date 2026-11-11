import { dartScore, isDouble, isValidDart } from './dart';
import type {
	Dart,
	MatchConfig,
	MatchState,
	PlayerSlot,
	PlayerStats
} from './types';

export function otherPlayer(p: PlayerSlot): PlayerSlot {
	return p === 0 ? 1 : 0;
}

/** Wer in Leg `leg` (0-basiert) anwirft: wechselt jedes Leg. */
export function legStarter(config: MatchConfig, leg: number): PlayerSlot {
	return ((config.firstThrower + leg) % 2) as PlayerSlot;
}

export function emptyStats(): PlayerStats {
	return {
		pointsScored: 0,
		dartsThrown: 0,
		visits: 0,
		highestVisit: 0,
		highestFinish: 0,
		count100Plus: 0,
		count140Plus: 0,
		count180: 0,
		legsWon: 0,
		legsPlayed: 0,
		bestLegDarts: null
	};
}

function validateConfig(config: MatchConfig): void {
	if (!Number.isInteger(config.startScore) || config.startScore < 2) {
		throw new Error('startScore muss eine ganze Zahl >= 2 sein');
	}
	if (!Number.isInteger(config.legsToWin) || config.legsToWin < 1) {
		throw new Error('legsToWin muss eine ganze Zahl >= 1 sein');
	}
}

export function createMatch(config: MatchConfig): MatchState {
	validateConfig(config);
	const starter = legStarter(config, 0);
	return {
		config,
		legsWon: [0, 0],
		currentLeg: 0,
		remaining: [config.startScore, config.startScore],
		currentPlayer: starter,
		visitStartScore: config.startScore,
		currentVisit: [],
		legDarts: [0, 0],
		visits: [],
		legResults: [],
		finished: false,
		winner: null,
		stats: [emptyStats(), emptyStats()]
	};
}

function recordVisitStats(stats: PlayerStats, points: number, darts: number, bust: boolean): void {
	stats.visits += 1;
	stats.dartsThrown += darts;
	stats.pointsScored += points;
	if (bust) return;
	stats.highestVisit = Math.max(stats.highestVisit, points);
	if (points >= 100) stats.count100Plus += 1;
	if (points >= 140) stats.count140Plus += 1;
	if (points === 180) stats.count180 += 1;
}

/**
 * Wendet einen Dart auf den Matchstand an und liefert einen neuen Stand zurück
 * (der übergebene Stand bleibt unverändert).
 *
 * Regeln:
 * - Aufnahme = bis zu 3 Darts, danach Spielerwechsel.
 * - Bust (unter 0, bei Double Out auch Rest 1, oder 0 ohne Double): Rest springt
 *   auf den Stand vor der Aufnahme zurück, Spielerwechsel sofort, 0 Punkte.
 *   Für den Average zählt eine Bust-Aufnahme als 3 Darts.
 * - Checkout beendet das Leg; Anwurf wechselt jedes Leg.
 */
export function applyDart(state: MatchState, dart: Dart): MatchState {
	if (state.finished) throw new Error('Das Match ist bereits beendet');
	if (!isValidDart(dart)) throw new Error('Ungültiger Dart');

	const s = structuredClone(state);
	const p = s.currentPlayer;
	const visitDarts = [...s.currentVisit, dart];
	const visitStart = s.visitStartScore;
	const newRemaining = s.remaining[p] - dartScore(dart);

	let bust = false;
	let checkout = false;
	if (newRemaining < 0) bust = true;
	else if (s.config.doubleOut && newRemaining === 1) bust = true;
	else if (newRemaining === 0) {
		if (s.config.doubleOut && !isDouble(dart)) bust = true;
		else checkout = true;
	}

	if (bust) {
		s.remaining[p] = visitStart;
		recordVisitStats(s.stats[p], 0, 3, true);
		s.legDarts[p] += 3;
		s.visits.push({
			player: p,
			leg: s.currentLeg,
			darts: visitDarts,
			scoreBefore: visitStart,
			scoreAfter: visitStart,
			points: 0,
			bust: true,
			checkout: false
		});
		return endVisit(s);
	}

	if (checkout) {
		s.remaining[p] = 0;
		recordVisitStats(s.stats[p], visitStart, visitDarts.length, false);
		s.legDarts[p] += visitDarts.length;
		s.stats[p].highestFinish = Math.max(s.stats[p].highestFinish, visitStart);
		s.visits.push({
			player: p,
			leg: s.currentLeg,
			darts: visitDarts,
			scoreBefore: visitStart,
			scoreAfter: 0,
			points: visitStart,
			bust: false,
			checkout: true
		});

		// Leg abschließen
		s.legsWon[p] += 1;
		s.stats[p].legsWon += 1;
		s.stats[0].legsPlayed += 1;
		s.stats[1].legsPlayed += 1;
		const winnerDarts = s.legDarts[p];
		const best = s.stats[p].bestLegDarts;
		s.stats[p].bestLegDarts = best === null ? winnerDarts : Math.min(best, winnerDarts);
		s.legResults.push({
			leg: s.currentLeg,
			winner: p,
			starter: legStarter(s.config, s.currentLeg),
			winnerDarts
		});
		s.currentVisit = [];

		if (s.legsWon[p] >= s.config.legsToWin) {
			s.finished = true;
			s.winner = p;
			return s;
		}

		// nächstes Leg
		s.currentLeg += 1;
		s.remaining = [s.config.startScore, s.config.startScore];
		s.legDarts = [0, 0];
		s.currentPlayer = legStarter(s.config, s.currentLeg);
		s.visitStartScore = s.config.startScore;
		return s;
	}

	// normaler Dart
	s.remaining[p] = newRemaining;
	s.currentVisit = visitDarts;
	if (visitDarts.length === 3) {
		const points = visitStart - newRemaining;
		recordVisitStats(s.stats[p], points, 3, false);
		s.legDarts[p] += 3;
		s.visits.push({
			player: p,
			leg: s.currentLeg,
			darts: visitDarts,
			scoreBefore: visitStart,
			scoreAfter: newRemaining,
			points,
			bust: false,
			checkout: false
		});
		return endVisit(s);
	}
	return s;
}

/** Spielerwechsel nach abgeschlossener Aufnahme. */
function endVisit(s: MatchState): MatchState {
	s.currentVisit = [];
	s.currentPlayer = otherPlayer(s.currentPlayer);
	s.visitStartScore = s.remaining[s.currentPlayer];
	return s;
}

/**
 * Berechnet den kompletten Matchstand aus der Dart-Liste (Event Sourcing).
 * Undo = letzten Dart aus der Liste entfernen und neu berechnen.
 */
export function replay(config: MatchConfig, darts: Dart[]): MatchState {
	let state = createMatch(config);
	for (const d of darts) state = applyDart(state, d);
	return state;
}

export function undoLastDart(darts: Dart[]): Dart[] {
	return darts.slice(0, -1);
}

/** 3-Dart-Average: Punkte pro Dart * 3. */
export function threeDartAverage(stats: PlayerStats): number {
	return stats.dartsThrown === 0 ? 0 : (stats.pointsScored / stats.dartsThrown) * 3;
}

/** Führt Statistiken mehrerer Matches zusammen (für Turnier-Statistik pro Spieler). */
export function mergeStats(a: PlayerStats, b: PlayerStats): PlayerStats {
	const bests = [a.bestLegDarts, b.bestLegDarts].filter((x): x is number => x !== null);
	return {
		pointsScored: a.pointsScored + b.pointsScored,
		dartsThrown: a.dartsThrown + b.dartsThrown,
		visits: a.visits + b.visits,
		highestVisit: Math.max(a.highestVisit, b.highestVisit),
		highestFinish: Math.max(a.highestFinish, b.highestFinish),
		count100Plus: a.count100Plus + b.count100Plus,
		count140Plus: a.count140Plus + b.count140Plus,
		count180: a.count180 + b.count180,
		legsWon: a.legsWon + b.legsWon,
		legsPlayed: a.legsPlayed + b.legsPlayed,
		bestLegDarts: bests.length ? Math.min(...bests) : null
	};
}
