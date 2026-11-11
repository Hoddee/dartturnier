import { dartScore, formatDart } from './dart';
import type { Dart } from './types';

/** Beliebtheit der Finish-Doubles (kleiner = besser). */
const DOUBLE_ORDER = [20, 16, 8, 10, 12, 18, 4, 6, 14, 25, 2, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

function doubleRank(segment: number): number {
	const i = DOUBLE_ORDER.indexOf(segment);
	return i < 0 ? 99 : i;
}

/** Aufwand eines Darts, der NICHT das Finish-Double ist (kleiner = besser). */
function setupPenalty(d: Dart): number {
	if (d.multiplier === 3) return d.segment >= 15 ? 20 - d.segment : 7 + (14 - d.segment);
	if (d.multiplier === 2) return d.segment === 25 ? 6 : 40;
	if (d.segment === 25) return 34;
	return 14 + (20 - d.segment);
}

/** Alle Darts, die vor dem finalen Double geworfen werden können, absteigend nach Punkten. */
const SETUP_DARTS: Dart[] = (() => {
	const darts: Dart[] = [];
	for (let n = 1; n <= 20; n++) {
		darts.push({ segment: n, multiplier: 1 });
		darts.push({ segment: n, multiplier: 2 });
		darts.push({ segment: n, multiplier: 3 });
	}
	darts.push({ segment: 25, multiplier: 1 });
	darts.push({ segment: 25, multiplier: 2 });
	return darts.sort(
		(a, b) => dartScore(b) - dartScore(a) || setupPenalty(a) - setupPenalty(b)
	);
})();

interface Candidate {
	darts: Dart[];
	cost: number;
}

/**
 * Sucht den besten Checkout-Weg für `remaining` mit höchstens `dartsLeft` Darts
 * (Double Out). Es wird zuerst die geringste Anzahl Darts gewählt, dann der
 * "angenehmste" Weg (bevorzugte Doubles, T20/T19 als Setup).
 * Liefert null, wenn kein Checkout möglich ist (z. B. 169, 168, 166, 165, 163,
 * 162, 159 mit 3 Darts, oder alles über 170).
 */
export function suggestCheckout(remaining: number, dartsLeft = 3): Dart[] | null {
	if (!Number.isInteger(remaining) || remaining < 2 || remaining > 170) return null;
	const maxDarts = Math.min(3, Math.max(1, Math.floor(dartsLeft)));

	for (let length = 1; length <= maxDarts; length++) {
		let best: Candidate | null = null;

		const search = (rem: number, setupLeft: number, startIdx: number, acc: Dart[], cost: number) => {
			if (setupLeft === 0) {
				if (rem % 2 !== 0) return;
				const seg = rem / 2;
				if (!((seg >= 1 && seg <= 20) || seg === 25)) return;
				const total = cost + doubleRank(seg);
				if (!best || total < best.cost) {
					best = { darts: [...acc, { segment: seg, multiplier: 2 }], cost: total };
				}
				return;
			}
			for (let i = startIdx; i < SETUP_DARTS.length; i++) {
				const d = SETUP_DARTS[i];
				const score = dartScore(d);
				// Rest muss nach dem Setup-Dart noch >= 2 sein (sonst wäre schon Bust/Ende)
				if (rem - score < 2) continue;
				search(rem - score, setupLeft - 1, i, [...acc, d], cost + setupPenalty(d));
			}
		};

		search(remaining, length - 1, 0, [], 0);
		if (best) return (best as Candidate).darts;
	}
	return null;
}

/** Wie suggestCheckout, aber als Anzeige-Labels, z. B. ["T20", "T20", "Bull"]. */
export function checkoutLabels(remaining: number, dartsLeft = 3): string[] | null {
	const darts = suggestCheckout(remaining, dartsLeft);
	return darts ? darts.map(formatDart) : null;
}
