import { describe, expect, it } from 'vitest';
import { checkoutLabels, suggestCheckout } from './checkout';
import { dartScore, isDouble } from './dart';

const BOGEYS = [159, 162, 163, 165, 166, 168, 169];

describe('Checkout-Vorschläge', () => {
	it('liefert bekannte Standard-Finishes', () => {
		expect(checkoutLabels(170)).toEqual(['T20', 'T20', 'Bull']);
		expect(checkoutLabels(167)).toEqual(['T20', 'T19', 'Bull']);
		expect(checkoutLabels(160)).toEqual(['T20', 'T20', 'D20']);
		expect(checkoutLabels(141)).toEqual(['T20', 'T19', 'D12']);
		expect(checkoutLabels(100)).toEqual(['T20', 'D20']);
		expect(checkoutLabels(40)).toEqual(['D20']);
		expect(checkoutLabels(50)).toEqual(['Bull']);
		expect(checkoutLabels(32)).toEqual(['D16']);
		expect(checkoutLabels(2)).toEqual(['D1']);
	});

	it('kennt keine Checkouts für Bogey-Zahlen und ungültige Werte', () => {
		for (const n of BOGEYS) expect(suggestCheckout(n)).toBeNull();
		expect(suggestCheckout(171)).toBeNull();
		expect(suggestCheckout(1)).toBeNull();
		expect(suggestCheckout(0)).toBeNull();
		expect(suggestCheckout(-5)).toBeNull();
		expect(suggestCheckout(40.5)).toBeNull();
	});

	it('beachtet die Anzahl verbleibender Darts', () => {
		expect(suggestCheckout(40, 1)).not.toBeNull();
		expect(suggestCheckout(41, 1)).toBeNull();
		expect(suggestCheckout(100, 1)).toBeNull();
		expect(suggestCheckout(100, 2)).not.toBeNull();
		expect(suggestCheckout(170, 2)).toBeNull();
		expect(suggestCheckout(170, 3)).not.toBeNull();
	});

	it('alle Werte 2..170 sind gültig lösbar, außer den 7 Bogey-Zahlen', () => {
		const unreachable: number[] = [];
		for (let n = 2; n <= 170; n++) {
			const darts = suggestCheckout(n);
			if (!darts) {
				unreachable.push(n);
				continue;
			}
			expect(darts.length).toBeGreaterThanOrEqual(1);
			expect(darts.length).toBeLessThanOrEqual(3);
			expect(darts.reduce((sum, d) => sum + dartScore(d), 0)).toBe(n);
			expect(isDouble(darts[darts.length - 1])).toBe(true);
		}
		expect(unreachable).toEqual(BOGEYS);
	});

	it('nutzt die minimale Dartanzahl', () => {
		// 2 Darts reichen für 100 -> nie 3 Darts vorschlagen
		expect(suggestCheckout(100)!.length).toBe(2);
		expect(suggestCheckout(40)!.length).toBe(1);
	});
});
