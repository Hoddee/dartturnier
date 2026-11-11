/**
 * Eingabe am iPad mit Sende-Warteschlange.
 *
 * Jeder Dart erscheint sofort auf dem Bildschirm und wird im Hintergrund der Reihe nach
 * gespeichert. Bricht das WLAN kurz weg, bleibt die Eingabe möglich; die Darts werden
 * nachgesendet. Die Datenbank erkennt Wiederholungen, damit nichts doppelt zählt.
 */
import type { MatchRow } from '../db-types';
import { BackendError } from '../data/backend';
import { store } from '../data/store.svelte';
import { matchConfig, replaySafe, toDart } from '../logic/derive';
import { applyDart } from '../engine/match';
import type { Dart, MatchState } from '../engine/types';

type Op = { kind: 'add'; dart: Dart } | { kind: 'undo' };

const PENDING_PREFIX = 'dart-board-pending:';

interface StoredPending {
	base: number;
	ops: Op[];
}

function savePending(matchId: string, base: number, ops: Op[]) {
	try {
		if (ops.length) localStorage.setItem(PENDING_PREFIX + matchId, JSON.stringify({ base, ops }));
		else localStorage.removeItem(PENDING_PREFIX + matchId);
	} catch {
		/* ignorieren */
	}
}

function loadPending(matchId: string, base: number): Op[] {
	try {
		const raw = localStorage.getItem(PENDING_PREFIX + matchId);
		if (!raw) return [];
		const p = JSON.parse(raw) as StoredPending;
		return p.base === base ? p.ops : [];
	} catch {
		return [];
	}
}

function applyOps(confirmed: Dart[], ops: Op[]): Dart[] {
	const out = confirmed.slice();
	for (const op of ops) {
		if (op.kind === 'add') out.push(op.dart);
		else out.pop();
	}
	return out;
}

export class BoardSync {
	readonly matchId: string;
	private key: string;
	private getMatch: () => MatchRow | undefined;

	/** Vom Server bestätigte Darts. */
	confirmed = $state.raw<Dart[]>([]);
	/** Noch nicht gespeicherte Aktionen. */
	pending = $state.raw<Op[]>([]);
	sending = $state(false);
	/** Meldung für die Anzeige (z. B. Verbindungsprobleme). */
	problem = $state<string | null>(null);
	fatal = $state(false);

	darts = $derived(applyOps(this.confirmed, this.pending));
	state = $derived.by((): MatchState => {
		const m = this.getMatch();
		return replaySafe(matchConfig(m ?? { legs_to_win: 1, first_thrower: 0 }), this.darts);
	});

	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private attempts = 0;
	private disposed = false;

	constructor(matchId: string, key: string, getMatch: () => MatchRow | undefined) {
		this.matchId = matchId;
		this.key = key;
		this.getMatch = getMatch;
		this.resync();
		this.pending = loadPending(matchId, this.confirmed.length);
		this.pump();
	}

	/** Bestätigte Darts aus dem Turnierstand übernehmen (beim Start oder nach Konflikten). */
	resync() {
		this.confirmed = (store.data.dartsByMatch[this.matchId] ?? []).map(toDart);
	}

	dispose() {
		this.disposed = true;
		if (this.retryTimer) clearTimeout(this.retryTimer);
	}

	/** Dart eintragen. Liefert false, wenn das Match schon vorbei ist. */
	add(dart: Dart): boolean {
		try {
			applyDart(this.state, dart);
		} catch {
			return false;
		}
		this.setPending([...this.pending, { kind: 'add', dart }]);
		this.pump();
		return true;
	}

	undo(): boolean {
		if (this.darts.length === 0) return false;
		const last = this.pending[this.pending.length - 1];
		// Noch nicht gesendeter Dart: einfach aus der Warteschlange nehmen
		const inFlight = this.sending && this.pending.length === 1;
		if (last?.kind === 'add' && !inFlight) {
			this.setPending(this.pending.slice(0, -1));
		} else {
			this.setPending([...this.pending, { kind: 'undo' }]);
			this.pump();
		}
		return true;
	}

	private setPending(ops: Op[]) {
		this.pending = ops;
		savePending(this.matchId, this.confirmed.length, ops);
	}

	private async pump() {
		if (this.sending || this.disposed || this.fatal || this.pending.length === 0) return;
		const m = this.getMatch();
		if (!m) return;
		this.sending = true;
		const op = this.pending[0];
		const config = matchConfig(m);
		try {
			if (op.kind === 'add') {
				const nextDarts = [...this.confirmed, op.dart];
				const s = replaySafe(config, nextDarts);
				const seq = nextDarts.length;
				const row = await store.backend.boardAddDart(this.key, {
					matchId: this.matchId,
					seq,
					segment: op.dart.segment,
					multiplier: op.dart.multiplier,
					legsA: s.legsWon[0],
					legsB: s.legsWon[1],
					winnerSlot: s.winner
				});
				this.confirmed = nextDarts;
				store.applyLocal({
					kind: 'upsert',
					table: 'darts',
					row: { match_id: this.matchId, seq, segment: op.dart.segment, multiplier: op.dart.multiplier }
				});
				if (row) store.applyLocal({ kind: 'upsert', table: 'matches', row: { ...row } });
			} else {
				const seq = this.confirmed.length;
				const nextDarts = this.confirmed.slice(0, -1);
				const s = replaySafe(config, nextDarts);
				const row = await store.backend.boardUndoDart(this.key, {
					matchId: this.matchId,
					seq,
					legsA: s.legsWon[0],
					legsB: s.legsWon[1]
				});
				this.confirmed = nextDarts;
				store.applyLocal({ kind: 'delete', table: 'darts', row: { match_id: this.matchId, seq } });
				if (row) store.applyLocal({ kind: 'upsert', table: 'matches', row: { ...row } });
			}
			this.attempts = 0;
			this.problem = null;
			this.setPending(this.pending.slice(1));
		} catch (e) {
			const err = e instanceof BackendError ? e : new BackendError('network', String(e));
			if (err.code === 'conflict') {
				this.problem = 'Das Match wurde zwischenzeitlich geändert (z. B. von der Turnierleitung). Stand neu geladen.';
				this.setPending([]);
				await store.reload();
				this.resync();
			} else if (err.code === 'badKey') {
				this.problem = 'Board-Schlüssel ungültig. Bitte die Scheibe neu einrichten.';
				this.fatal = true;
			} else {
				this.attempts++;
				this.problem = 'Keine Verbindung. Eingaben werden gespeichert und nachgesendet …';
				const wait = Math.min(5000, 500 * 2 ** this.attempts);
				this.sending = false;
				this.retryTimer = setTimeout(() => this.pump(), wait);
				return;
			}
		} finally {
			if (this.sending) this.sending = false;
		}
		this.pump();
	}
}
