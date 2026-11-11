/**
 * Demo-Modus: komplette Turnier-Datenbank im Browser (localStorage).
 * Mehrere Tabs im selben Browser bleiben über BroadcastChannel synchron, so lassen sich
 * iPad-Ansicht, Live-Seite und Admin nebeneinander ausprobieren. Verhält sich wie die
 * Supabase-Funktionen (gleiche Prüfungen, gleiche Fehler).
 */
import {
	DEFAULT_SETTINGS,
	type Change,
	type DartRow,
	type MatchRow,
	type NewMatch,
	type Snapshot,
	type TournamentSettingsRow
} from '../db-types';
import type { Dart } from '../engine/types';
import {
	BackendError,
	type AddDartArgs,
	type Backend,
	type GroupAssignment,
	type Session,
	type UndoDartArgs
} from './backend';

const STORAGE_KEY = 'dart-turnier-demo-v1';
const SESSION_KEY = 'dart-turnier-demo-session';
export const DEMO_BOARD_KEY = 'demo';

function emptySnapshot(): Snapshot {
	return {
		players: [],
		groupPlayers: [],
		matches: [],
		darts: [],
		settings: structuredClone(DEFAULT_SETTINGS),
		overrides: []
	};
}

function safeGet(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeSet(key: string, value: string | null) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* privater Modus o. ä.: Demo läuft dann nur im Speicher */
	}
}

function uuid(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
	});
}


export class MemoryBackend implements Backend {
	readonly mode = 'demo' as const;
	private data: Snapshot;
	private listeners = new Set<(c: Change) => void>();
	private authListeners = new Set<(s: Session | null) => void>();
	private channel: BroadcastChannel | null = null;
	private latency: boolean;

	/** latency: kleine künstliche Verzögerungen wie bei einem echten Server (für Tests abschaltbar). */
	constructor(options: { latency?: boolean; persist?: boolean } = {}) {
		this.latency = options.latency ?? true;
		this.persist = options.persist ?? true;
		this.data = this.persist ? this.read() : emptySnapshot();
		if (this.persist && typeof BroadcastChannel !== 'undefined') {
			this.channel = new BroadcastChannel(STORAGE_KEY);
			this.channel.onmessage = () => {
				this.data = this.read();
				this.emit({ kind: 'reload' });
			};
		}
	}

	private persist: boolean;

	private delay(ms: number): Promise<void> {
		return this.latency ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
	}

	private read(): Snapshot {
		const raw = safeGet(STORAGE_KEY);
		if (!raw) return emptySnapshot();
		try {
			return { ...emptySnapshot(), ...JSON.parse(raw) };
		} catch {
			return emptySnapshot();
		}
	}

	private emit(c: Change) {
		for (const l of this.listeners) l(c);
	}

	/** Speichert, informiert andere Tabs und meldet die Änderungen an die eigenen Abonnenten. */
	private commit(changes: Change[]) {
		if (this.persist) {
			safeSet(STORAGE_KEY, JSON.stringify(this.data));
			this.channel?.postMessage('changed');
		}
		for (const c of changes) this.emit(c);
	}

	private match(id: string): MatchRow {
		const m = this.data.matches.find((x) => x.id === id);
		if (!m) throw new BackendError('other', 'Match nicht gefunden');
		return m;
	}

	private checkKey(key: string) {
		if (key !== DEMO_BOARD_KEY) throw new BackendError('badKey', 'Ungültiger Board-Schlüssel');
	}

	private dartsOf(matchId: string): DartRow[] {
		return this.data.darts.filter((d) => d.match_id === matchId).sort((a, b) => a.seq - b.seq);
	}

	/** Entspricht dem Trigger advance_winner. */
	private advance(m: MatchRow, oldWinner: string | null): Change[] {
		if (!m.next_match_id || m.winner_id === oldWinner) return [];
		const next = this.data.matches.find((x) => x.id === m.next_match_id);
		if (!next || next.status !== 'scheduled') return [];
		if (m.next_slot === 0) next.player_a = m.winner_id;
		else next.player_b = m.winner_id;
		next.ready_a = false;
		next.ready_b = false;
		return [{ kind: 'upsert', table: 'matches', row: { ...next } }];
	}

	private setMatch(m: MatchRow, patch: Partial<MatchRow>): Change[] {
		const oldWinner = m.winner_id;
		Object.assign(m, patch);
		return [{ kind: 'upsert', table: 'matches', row: { ...m } }, ...this.advance(m, oldWinner)];
	}

	async loadAll(): Promise<Snapshot> {
		await this.delay(30);
		return structuredClone(this.data);
	}

	subscribe(onChange: (c: Change) => void, onStatus: (connected: boolean) => void): () => void {
		this.listeners.add(onChange);
		setTimeout(() => onStatus(true), 0);
		return () => this.listeners.delete(onChange);
	}

	// ---- Scheiben ----

	async checkBoardKey(key: string) {
		await this.delay(80);
		return key === DEMO_BOARD_KEY;
	}

	async boardReady(key: string, matchId: string, slot: 0 | 1) {
		await this.delay(60);
		this.checkKey(key);
		const m = this.match(matchId);
		if (m.status !== 'scheduled') return { ...m };
		if (!m.player_a || !m.player_b) throw new BackendError('other', 'Die Spieler dieses Matches stehen noch nicht fest');
		const patch: Partial<MatchRow> = slot === 0 ? { ready_a: true } : { ready_b: true };
		const ready = (slot === 0 || m.ready_a) && (slot === 1 || m.ready_b);
		if (ready) Object.assign(patch, { status: 'live', started_at: new Date().toISOString() });
		this.commit(this.setMatch(m, patch));
		return { ...m };
	}

	async boardSetFirstThrower(key: string, matchId: string, slot: 0 | 1) {
		await this.delay(60);
		this.checkKey(key);
		const m = this.match(matchId);
		if (m.status !== 'live') throw new BackendError('other', 'Das Match läuft nicht');
		if (this.dartsOf(matchId).length) throw new BackendError('conflict', 'Es wurden bereits Darts geworfen');
		this.commit(this.setMatch(m, { first_thrower: slot, first_thrower_set: true }));
		return { ...m };
	}

	async boardAddDart(key: string, a: AddDartArgs) {
		await this.delay(40);
		this.checkKey(key);
		const m = this.match(a.matchId);
		const darts = this.dartsOf(a.matchId);
		const existing = darts.find((d) => d.seq === a.seq);
		if (existing) {
			if (existing.segment === a.segment && existing.multiplier === a.multiplier) return { ...m };
			throw new BackendError('conflict', `Konflikt: Dart ${a.seq} existiert bereits`);
		}
		if (m.status !== 'live' || !m.first_thrower_set) throw new BackendError('conflict', 'Das Match läuft nicht');
		const last = darts.length ? darts[darts.length - 1].seq : 0;
		if (a.seq !== last + 1) throw new BackendError('conflict', 'Konflikt: falsche Dart-Nummer');
		const row: DartRow = {
			match_id: a.matchId,
			seq: a.seq,
			segment: a.segment,
			multiplier: a.multiplier as 1 | 2 | 3,
			created_at: new Date().toISOString()
		};
		this.data.darts.push(row);
		const finished = a.winnerSlot !== null;
		this.commit([
			{ kind: 'upsert', table: 'darts', row: { ...row } },
			...this.setMatch(m, {
				legs_a: a.legsA,
				legs_b: a.legsB,
				status: finished ? 'finished' : 'live',
				winner_id: a.winnerSlot === 0 ? m.player_a : a.winnerSlot === 1 ? m.player_b : null,
				finished_at: finished ? new Date().toISOString() : null
			})
		]);
		return { ...m };
	}

	async boardUndoDart(key: string, a: UndoDartArgs) {
		await this.delay(40);
		this.checkKey(key);
		const m = this.match(a.matchId);
		const darts = this.dartsOf(a.matchId);
		const last = darts.length ? darts[darts.length - 1].seq : 0;
		if (last === a.seq - 1) return { ...m };
		if (last !== a.seq || m.status === 'scheduled') throw new BackendError('conflict', 'Konflikt beim Rückgängigmachen');
		this.data.darts = this.data.darts.filter((d) => !(d.match_id === a.matchId && d.seq === a.seq));
		this.commit([
			{ kind: 'delete', table: 'darts', row: { match_id: a.matchId, seq: a.seq } },
			...this.setMatch(m, { legs_a: a.legsA, legs_b: a.legsB, status: 'live', winner_id: null, finished_at: null })
		]);
		return { ...m };
	}

	// ---- Login (Demo: jede Eingabe wird akzeptiert) ----

	async getSession(): Promise<Session | null> {
		const email = safeGet(SESSION_KEY);
		return email ? { email } : null;
	}

	onAuthChange(cb: (s: Session | null) => void) {
		this.authListeners.add(cb);
		return () => this.authListeners.delete(cb);
	}

	async signIn(email: string) {
		await this.delay(150);
		const e = email.trim() || 'demo@turnier';
		safeSet(SESSION_KEY, e);
		for (const l of this.authListeners) l({ email: e });
	}

	async signOut() {
		safeSet(SESSION_KEY, null);
		for (const l of this.authListeners) l(null);
	}

	// ---- Turnierleitung ----

	async addPlayers(names: string[]) {
		let pos = Math.max(0, ...this.data.players.map((p) => p.position));
		const now = new Date().toISOString();
		for (const name of names) {
			this.data.players.push({ id: uuid(), name, created_at: now, position: ++pos });
		}
		this.commit([{ kind: 'reload' }]);
	}

	async renamePlayer(id: string, name: string) {
		const p = this.data.players.find((x) => x.id === id);
		if (p) p.name = name;
		this.commit([{ kind: 'reload' }]);
	}

	async deletePlayer(id: string) {
		if (this.data.matches.some((m) => m.player_a === id || m.player_b === id || m.winner_id === id)) {
			throw new BackendError('other', 'Spieler ist bereits in Spielen eingeplant');
		}
		this.data.players = this.data.players.filter((p) => p.id !== id);
		this.data.groupPlayers = this.data.groupPlayers.filter((g) => g.player_id !== id);
		this.commit([{ kind: 'reload' }]);
	}

	async saveGroups(groups: GroupAssignment[]) {
		this.data.overrides = [];
		this.data.groupPlayers = groups.flatMap((g) =>
			g.playerIds.map((player_id, i) => ({ group_id: g.id, player_id, seed: i + 1 }))
		);
		this.commit([{ kind: 'reload' }]);
	}

	async replaceMatches(stage: 'group' | 'ko', rows: NewMatch[]) {
		const ids = new Set(this.data.matches.filter((m) => m.stage === stage).map((m) => m.id));
		this.data.matches = this.data.matches.filter((m) => m.stage !== stage);
		this.data.darts = this.data.darts.filter((d) => !ids.has(d.match_id));
		for (const r of rows) {
			this.data.matches.push({
				...r,
				first_thrower: 0,
				first_thrower_set: false,
				status: 'scheduled',
				ready_a: false,
				ready_b: false,
				legs_a: 0,
				legs_b: 0,
				winner_id: null,
				started_at: null,
				finished_at: null
			});
		}
		this.commit([{ kind: 'reload' }]);
	}

	async updateMatch(id: string, patch: Partial<MatchRow>) {
		this.commit(this.setMatch(this.match(id), patch));
	}

	async resetMatch(id: string) {
		this.data.darts = this.data.darts.filter((d) => d.match_id !== id);
		const changes = this.setMatch(this.match(id), {
			status: 'scheduled',
			ready_a: false,
			ready_b: false,
			legs_a: 0,
			legs_b: 0,
			winner_id: null,
			started_at: null,
			finished_at: null,
			first_thrower: 0,
			first_thrower_set: false
		});
		this.commit([{ kind: 'reload' }, ...changes]);
	}

	async setOverride(groupId: string, order: string[] | null) {
		this.data.overrides = this.data.overrides.filter((o) => o.group_id !== groupId);
		if (order) this.data.overrides.push({ group_id: groupId, manual_order: order });
		this.commit([{ kind: 'reload' }]);
	}

	async updateSettings(patch: Partial<TournamentSettingsRow>) {
		this.data.settings = { ...this.data.settings, ...patch, id: 1 };
		this.commit([{ kind: 'upsert', table: 'tournament_settings', row: { ...this.data.settings } }]);
	}

	async setBoardKey() {
		throw new BackendError('other', `Im Demo-Modus ist der Board-Schlüssel immer "${DEMO_BOARD_KEY}"`);
	}

	async resetTournament() {
		const settings = this.data.settings;
		this.data = { ...emptySnapshot(), settings };
		this.commit([{ kind: 'reload' }]);
	}

	// ---- nur Demo ----

	/** Trägt ein komplett simuliertes Match auf einen Schlag ein (inkl. Darts). */
	async demoPlayMatch(matchId: string, firstThrower: 0 | 1, darts: Dart[], legsA: number, legsB: number) {
		const m = this.match(matchId);
		if (m.status !== 'scheduled' || !m.player_a || !m.player_b) return;
		this.data.darts = this.data.darts.filter((d) => d.match_id !== matchId);
		const now = Date.now();
		darts.forEach((d, i) =>
			this.data.darts.push({
				match_id: matchId,
				seq: i + 1,
				segment: d.segment,
				multiplier: d.multiplier,
				created_at: new Date(now + i).toISOString()
			})
		);
		const changes = this.setMatch(m, {
			first_thrower: firstThrower,
			first_thrower_set: true,
			ready_a: true,
			ready_b: true,
			status: 'finished',
			legs_a: legsA,
			legs_b: legsB,
			winner_id: legsA > legsB ? m.player_a : m.player_b,
			started_at: new Date(now).toISOString(),
			finished_at: new Date(now).toISOString()
		});
		this.commit([{ kind: 'reload' }, ...changes]);
	}
}
