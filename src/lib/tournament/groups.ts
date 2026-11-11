import type { Group, MatchStatus, ScheduledMatch } from './types';

export const GROUP_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** Teilt Spieler der Reihe nach in Gruppen (die ersten 4 = Gruppe A usw.). */
export function splitIntoGroups(playerIds: string[], groupSize: number): Group[] {
	if (playerIds.length === 0 || playerIds.length % groupSize !== 0) {
		throw new Error(
			`${playerIds.length} Spieler lassen sich nicht gleichmäßig in Gruppen à ${groupSize} teilen`
		);
	}
	const count = playerIds.length / groupSize;
	if (count > GROUP_IDS.length) throw new Error('Zu viele Gruppen');
	return Array.from({ length: count }, (_, i) => ({
		id: GROUP_IDS[i],
		playerIds: playerIds.slice(i * groupSize, (i + 1) * groupSize)
	}));
}

/** Zufällige Auslosung (Fisher-Yates). `rng` ist für Tests austauschbar. */
export function drawGroups(
	playerIds: string[],
	groupSize: number,
	rng: () => number = Math.random
): Group[] {
	const shuffled = [...playerIds];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return splitIntoGroups(shuffled, groupSize);
}

/**
 * Jeder-gegen-jeden-Spielplan nach der Kreismethode.
 * Rückgabe: Runden, jede Runde mit Paarungen als Indexpaare.
 * Bei ungerader Spielerzahl wird ein Freilos eingefügt (Paarungen mit Freilos entfallen).
 */
export function roundRobinRounds(n: number): [number, number][][] {
	const size = n % 2 === 0 ? n : n + 1;
	const bye = n % 2 === 0 ? -1 : n;
	let rest = Array.from({ length: size - 1 }, (_, i) => i + 1);
	const rounds: [number, number][][] = [];
	for (let r = 0; r < size - 1; r++) {
		const order = [0, ...rest];
		const pairs: [number, number][] = [];
		for (let i = 0; i < size / 2; i++) {
			const a = order[i];
			const b = order[size - 1 - i];
			if (a !== bye && b !== bye) pairs.push([a, b]);
		}
		rounds.push(pairs);
		rest = [rest[rest.length - 1], ...rest.slice(0, -1)];
	}
	return rounds;
}

/** Scheibe (1-basiert) einer Gruppe: A+E → 1, B+F → 2, C+G → 3, D+H → 4. */
export function groupBoard(groupIndex: number, boardCount: number): number {
	return (groupIndex % boardCount) + 1;
}

/**
 * Erzeugt den kompletten Gruppenspielplan inkl. Scheibe und Warteschlangen-Position.
 * Auf einer Scheibe wechseln sich die zugeordneten Gruppen ab, damit kein Spieler
 * zwei Matches direkt hintereinander hat.
 */
export function buildGroupSchedule(groups: Group[], boardCount = 4): ScheduledMatch[] {
	const matches: ScheduledMatch[] = [];
	for (let board = 1; board <= boardCount; board++) {
		const boardGroups = groups.filter((_, i) => groupBoard(i, boardCount) === board);
		if (boardGroups.length === 0) continue;
		const rounds = boardGroups.map((g) => roundRobinRounds(g.playerIds.length));
		const roundCount = Math.max(...rounds.map((r) => r.length));
		let queueIndex = 0;
		for (let r = 0; r < roundCount; r++) {
			const perRound = Math.max(...rounds.map((rr) => rr[r]?.length ?? 0));
			for (let m = 0; m < perRound; m++) {
				boardGroups.forEach((g, gi) => {
					const pair = rounds[gi][r]?.[m];
					if (!pair) return;
					matches.push({
						id: `${g.id}-${r + 1}-${m + 1}`,
						stage: 'group',
						group: g.id,
						round: r + 1,
						playerA: g.playerIds[pair[0]],
						playerB: g.playerIds[pair[1]],
						board,
						queueIndex: queueIndex++
					});
				});
			}
		}
	}
	return matches;
}

/**
 * Nächstes Match einer Scheibe: das laufende, sonst das erste noch nicht gespielte
 * in der Warteschlange.
 */
export function nextMatchForBoard(
	matches: ScheduledMatch[],
	statusById: Record<string, MatchStatus | undefined>,
	board: number
): ScheduledMatch | null {
	const queue = matches
		.filter((m) => m.board === board)
		.sort((a, b) => a.queueIndex - b.queueIndex);
	const live = queue.find((m) => statusById[m.id] === 'live');
	if (live) return live;
	return queue.find((m) => (statusById[m.id] ?? 'scheduled') !== 'finished') ?? null;
}
