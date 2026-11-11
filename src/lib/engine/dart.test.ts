import { describe, expect, it } from 'vitest';
import { dartScore, formatDart, isDouble, isValidDart, parseDart } from './dart';

describe('dart', () => {
	it('berechnet Punkte', () => {
		expect(dartScore(parseDart('T20'))).toBe(60);
		expect(dartScore(parseDart('D16'))).toBe(32);
		expect(dartScore(parseDart('S5'))).toBe(5);
		expect(dartScore(parseDart('25'))).toBe(25);
		expect(dartScore(parseDart('Bull'))).toBe(50);
		expect(dartScore(parseDart('0'))).toBe(0);
	});

	it('erkennt Doubles (inkl. Bullseye)', () => {
		expect(isDouble(parseDart('D1'))).toBe(true);
		expect(isDouble(parseDart('Bull'))).toBe(true);
		expect(isDouble(parseDart('T20'))).toBe(false);
		expect(isDouble(parseDart('25'))).toBe(false);
		expect(isDouble(parseDart('0'))).toBe(false);
	});

	it('lehnt unmögliche Darts ab', () => {
		expect(isValidDart({ segment: 21, multiplier: 1 })).toBe(false);
		expect(isValidDart({ segment: -1, multiplier: 1 })).toBe(false);
		expect(isValidDart({ segment: 25, multiplier: 3 })).toBe(false);
		expect(isValidDart({ segment: 0, multiplier: 2 })).toBe(false);
		expect(isValidDart({ segment: 5, multiplier: 4 as never })).toBe(false);
		expect(isValidDart({ segment: 1.5, multiplier: 1 })).toBe(false);
		expect(() => parseDart('T25')).toThrow();
		expect(() => parseDart('X5')).toThrow();
	});

	it('formatiert und parst symmetrisch', () => {
		for (const label of ['T20', 'D16', 'S5', '25', 'Bull', '0']) {
			expect(formatDart(parseDart(label))).toBe(label);
		}
	});
});
