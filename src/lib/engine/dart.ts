import type { Dart, Multiplier } from './types';

export const MISS: Dart = { segment: 0, multiplier: 1 };

/** Prüft, ob der Dart auf einer echten Dartscheibe möglich ist. */
export function isValidDart(d: Dart): boolean {
	const { segment, multiplier } = d;
	if (!Number.isInteger(segment) || ![1, 2, 3].includes(multiplier as number)) return false;
	if (segment === 0) return multiplier === 1;
	if (segment === 25) return multiplier === 1 || multiplier === 2;
	return segment >= 1 && segment <= 20;
}

export function dartScore(d: Dart): number {
	return d.segment * d.multiplier;
}

/** Double-Out-tauglich: Double 1-20 oder Bullseye. */
export function isDouble(d: Dart): boolean {
	return d.segment > 0 && d.multiplier === 2;
}

/** Kurzschreibweise für Anzeige: T20, D16, S5, 25, Bull, 0 (Fehlwurf). */
export function formatDart(d: Dart): string {
	if (d.segment === 0) return '0';
	if (d.segment === 25) return d.multiplier === 2 ? 'Bull' : '25';
	const prefix = d.multiplier === 3 ? 'T' : d.multiplier === 2 ? 'D' : 'S';
	return `${prefix}${d.segment}`;
}

/** Gegenstück zu formatDart, z. B. für Tests. Wirft bei ungültiger Eingabe. */
export function parseDart(label: string): Dart {
	const l = label.trim().toUpperCase();
	let dart: Dart | null = null;
	if (l === '0' || l === 'MISS') dart = MISS;
	else if (l === 'BULL' || l === 'DB') dart = { segment: 25, multiplier: 2 };
	else if (l === '25' || l === 'SB') dart = { segment: 25, multiplier: 1 };
	else {
		const m = /^([SDT])(\d{1,2})$/.exec(l);
		if (m) {
			const multiplier: Multiplier = m[1] === 'T' ? 3 : m[1] === 'D' ? 2 : 1;
			dart = { segment: Number(m[2]), multiplier };
		}
	}
	if (!dart || !isValidDart(dart)) throw new Error(`Ungültiger Dart: "${label}"`);
	return dart;
}
