/**
 * Simulierte Spieler für Demo-Modus und Tests: wirft realistische Darts
 * (zielt auf T20 bzw. auf den Checkout-Weg und trifft mit einer gewissen Wahrscheinlichkeit).
 */
import { suggestCheckout } from '../engine/checkout';
import { applyDart, createMatch } from '../engine/match';
import type { Dart, MatchConfig, MatchState, Multiplier } from '../engine/types';

const NEIGHBORS: Record<number, [number, number]> = {
	20: [5, 1], 1: [20, 18], 18: [1, 4], 4: [18, 13], 13: [4, 6], 6: [13, 10], 10: [6, 15],
	15: [10, 2], 2: [15, 17], 17: [2, 3], 3: [17, 19], 19: [3, 7], 7: [19, 16], 16: [7, 8],
	8: [16, 11], 11: [8, 14], 14: [11, 9], 9: [14, 12], 12: [9, 5], 5: [12, 20]
};

/** Ein Wurf auf ein Ziel. `skill` 0..1 (0,5 ≈ Kneipenniveau, 0,9 ≈ sehr stark). */
export function throwAt(target: Dart, skill: number, rng: () => number): Dart {
	const r = rng();
	if (target.segment === 25) {
		if (r < 0.25 * skill) return { segment: 25, multiplier: 2 };
		if (r < 0.7 * skill + 0.1) return { segment: 25, multiplier: 1 };
		return { segment: 1 + Math.floor(rng() * 20), multiplier: 1 };
	}
	const neighbor = () => NEIGHBORS[target.segment][rng() < 0.5 ? 0 : 1];
	if (target.multiplier === 3) {
		if (r < 0.45 * skill) return target;
		if (r < 0.45 * skill + 0.45) return { segment: target.segment, multiplier: 1 };
		return { segment: neighbor(), multiplier: (rng() < 0.15 ? 3 : 1) as Multiplier };
	}
	if (target.multiplier === 2) {
		if (r < 0.42 * skill) return target;
		if (r < 0.42 * skill + 0.3) return { segment: target.segment, multiplier: 1 };
		if (r < 0.42 * skill + 0.55) return { segment: 0, multiplier: 1 };
		return { segment: neighbor(), multiplier: 1 };
	}
	if (r < 0.85) return target;
	return { segment: neighbor(), multiplier: 1 };
}

/** Wählt das Ziel für den nächsten Dart. */
export function chooseTarget(state: MatchState): Dart {
	const p = state.currentPlayer;
	const rest = state.remaining[p];
	const dartsLeft = 3 - state.currentVisit.length;
	const route = suggestCheckout(rest, dartsLeft);
	if (route) return route[0];
	if (rest > 60 || rest < 2) return { segment: 20, multiplier: 3 };
	// Rest ohne direkten Checkout: auf ein gerades Ergebnis stellen
	const setup = rest - 32 > 0 && rest - 32 <= 20 ? rest - 32 : rest % 2 === 1 ? 1 : Math.min(20, rest - 2);
	return { segment: Math.max(1, setup), multiplier: 1 };
}

/** Spielt ein komplettes Match durch und liefert alle Darts. */
export function simulateMatch(
	config: MatchConfig,
	skills: [number, number],
	rng: () => number = Math.random
): { darts: Dart[]; state: MatchState } {
	let state = createMatch(config);
	const darts: Dart[] = [];
	while (!state.finished && darts.length < 5000) {
		const dart = throwAt(chooseTarget(state), skills[state.currentPlayer], rng);
		state = applyDart(state, dart);
		darts.push(dart);
	}
	return { darts, state };
}

export function seededRng(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
