import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import {
	DEFAULT_SETTINGS,
	type Change,
	type DartRow,
	type GroupOverrideRow,
	type GroupPlayerRow,
	type MatchRow,
	type NewMatch,
	type PlayerRow,
	type Snapshot,
	type TableName,
	type TournamentSettingsRow
} from '../db-types';
import {
	BackendError,
	type AddDartArgs,
	type Backend,
	type GroupAssignment,
	type Session,
	type UndoDartArgs
} from './backend';

const PAGE = 1000;

function fail(error: PostgrestError | { message: string; code?: string } | null): never {
	const code = error?.code;
	const message = error?.message ?? 'Unbekannter Fehler';
	if (code === 'DT001') throw new BackendError('conflict', message);
	if (code === '28000' || message.includes('Board-Schlüssel')) throw new BackendError('badKey', message);
	if (code === '42501' || code === 'PGRST301') throw new BackendError('auth', 'Keine Berechtigung, bitte neu einloggen');
	if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Load failed')) {
		throw new BackendError('network', 'Keine Verbindung zum Server');
	}
	throw new BackendError('other', message);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function check<T>(p: PromiseLike<{ data: any; error: PostgrestError | null }>): Promise<T> {
	let res: { data: T; error: PostgrestError | null };
	try {
		res = await p;
	} catch (e) {
		fail({ message: e instanceof Error ? e.message : String(e) });
	}
	if (res.error) fail(res.error);
	return res.data;
}

const TABLES: TableName[] = ['players', 'group_players', 'matches', 'darts', 'tournament_settings', 'group_overrides'];

export class SupabaseBackend implements Backend {
	readonly mode = 'supabase' as const;
	private db: SupabaseClient;

	constructor(url: string, anonKey: string) {
		this.db = createClient(url, anonKey, {
			auth: { persistSession: true, autoRefreshToken: true },
			realtime: { params: { eventsPerSecond: 50 } }
		});
	}

	private async fetchAll<T>(table: TableName, order: string[]): Promise<T[]> {
		const out: T[] = [];
		for (let from = 0; ; from += PAGE) {
			let q = this.db.from(table).select('*');
			for (const col of order) q = q.order(col, { ascending: true });
			const rows = await check<T[]>(q.range(from, from + PAGE - 1));
			out.push(...rows);
			if (rows.length < PAGE) return out;
		}
	}

	async loadAll(): Promise<Snapshot> {
		const [players, groupPlayers, matches, darts, settingsRows, overrides] = await Promise.all([
			this.fetchAll<PlayerRow>('players', ['position']),
			this.fetchAll<GroupPlayerRow>('group_players', ['group_id', 'seed']),
			this.fetchAll<MatchRow>('matches', ['id']),
			this.fetchAll<DartRow>('darts', ['match_id', 'seq']),
			this.fetchAll<TournamentSettingsRow>('tournament_settings', ['id']),
			this.fetchAll<GroupOverrideRow>('group_overrides', ['group_id'])
		]);
		return {
			players,
			groupPlayers,
			matches,
			darts,
			settings: settingsRows[0] ?? DEFAULT_SETTINGS,
			overrides
		};
	}

	subscribe(onChange: (c: Change) => void, onStatus: (connected: boolean) => void): () => void {
		let channel = this.db.channel(`turnier-${Math.random().toString(36).slice(2)}`);
		for (const table of TABLES) {
			channel = channel.on(
				'postgres_changes' as never,
				{ event: '*', schema: 'public', table },
				(payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
					if (payload.eventType === 'DELETE') onChange({ kind: 'delete', table, row: payload.old });
					else onChange({ kind: 'upsert', table, row: payload.new });
				}
			);
		}
		channel.subscribe((status) => {
			if (status === 'SUBSCRIBED') onStatus(true);
			else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus(false);
		});
		return () => {
			void this.db.removeChannel(channel);
		};
	}

	// ---- Scheiben ----

	async checkBoardKey(key: string): Promise<boolean> {
		return check<boolean>(this.db.rpc('board_check_key', { p_key: key }));
	}

	async boardReady(key: string, matchId: string, slot: 0 | 1) {
		return check<MatchRow | null>(this.db.rpc('board_ready', { p_key: key, p_match_id: matchId, p_slot: slot }));
	}

	async boardSetFirstThrower(key: string, matchId: string, slot: 0 | 1) {
		return check<MatchRow | null>(
			this.db.rpc('board_set_first_thrower', { p_key: key, p_match_id: matchId, p_slot: slot })
		);
	}

	async boardAddDart(key: string, a: AddDartArgs) {
		return check<MatchRow | null>(
			this.db.rpc('board_add_dart', {
				p_key: key,
				p_match_id: a.matchId,
				p_seq: a.seq,
				p_segment: a.segment,
				p_multiplier: a.multiplier,
				p_legs_a: a.legsA,
				p_legs_b: a.legsB,
				p_winner_slot: a.winnerSlot
			})
		);
	}

	async boardUndoDart(key: string, a: UndoDartArgs) {
		return check<MatchRow | null>(
			this.db.rpc('board_undo_dart', {
				p_key: key,
				p_match_id: a.matchId,
				p_seq: a.seq,
				p_legs_a: a.legsA,
				p_legs_b: a.legsB
			})
		);
	}

	// ---- Login ----

	async getSession(): Promise<Session | null> {
		const { data } = await this.db.auth.getSession();
		return data.session ? { email: data.session.user.email ?? '' } : null;
	}

	onAuthChange(cb: (s: Session | null) => void): () => void {
		const { data } = this.db.auth.onAuthStateChange((_e, session) =>
			cb(session ? { email: session.user.email ?? '' } : null)
		);
		return () => data.subscription.unsubscribe();
	}

	async signIn(email: string, password: string) {
		const { error } = await this.db.auth.signInWithPassword({ email, password });
		if (error) throw new BackendError('auth', 'Login fehlgeschlagen: E-Mail oder Passwort falsch');
	}

	async signOut() {
		await this.db.auth.signOut();
	}

	// ---- Turnierleitung ----

	async addPlayers(names: string[]) {
		await check(this.db.from('players').insert(names.map((name) => ({ name }))));
	}

	async renamePlayer(id: string, name: string) {
		await check(this.db.from('players').update({ name }).eq('id', id));
	}

	async deletePlayer(id: string) {
		await check(this.db.from('players').delete().eq('id', id));
	}

	async saveGroups(groups: GroupAssignment[]) {
		await check(this.db.from('group_overrides').delete().neq('group_id', ''));
		await check(this.db.from('group_players').delete().neq('group_id', ''));
		if (groups.length) {
			await check(this.db.from('groups').upsert(groups.map((g) => ({ id: g.id }))));
			const rows = groups.flatMap((g) =>
				g.playerIds.map((player_id, i) => ({ group_id: g.id, player_id, seed: i + 1 }))
			);
			await check(this.db.from('group_players').insert(rows));
		}
	}

	async replaceMatches(stage: 'group' | 'ko', rows: NewMatch[]) {
		// Verweise auf Folgematches zuerst lösen, sonst blockieren sich die Fremdschlüssel
		if (stage === 'ko') await check(this.db.from('matches').update({ next_match_id: null }).eq('stage', 'ko'));
		await check(this.db.from('matches').delete().eq('stage', stage));
		if (!rows.length) return;
		// Folgematches existieren erst nach dem Einfügen: Verknüpfung in zwei Schritten
		await check(this.db.from('matches').insert(rows.map((r) => ({ ...r, next_match_id: null }))));
		const links = rows.filter((r) => r.next_match_id);
		await Promise.all(
			links.map((r) =>
				check(this.db.from('matches').update({ next_match_id: r.next_match_id, next_slot: r.next_slot }).eq('id', r.id))
			)
		);
	}

	async updateMatch(id: string, patch: Partial<MatchRow>) {
		await check(this.db.from('matches').update(patch).eq('id', id));
	}

	async resetMatch(id: string) {
		await check(this.db.rpc('reset_match', { p_match_id: id }));
	}

	async setOverride(groupId: string, order: string[] | null) {
		if (order) {
			await check(this.db.from('group_overrides').upsert({ group_id: groupId, manual_order: order }));
		} else {
			await check(this.db.from('group_overrides').delete().eq('group_id', groupId));
		}
	}

	async updateSettings(patch: Partial<TournamentSettingsRow>) {
		await check(this.db.from('tournament_settings').update(patch).eq('id', 1));
	}

	async setBoardKey(value: string) {
		await check(this.db.rpc('admin_set_board_key', { p_value: value }));
	}

	async resetTournament() {
		await check(this.db.from('matches').update({ next_match_id: null }).neq('id', ''));
		await check(this.db.from('matches').delete().neq('id', ''));
		await check(this.db.from('group_overrides').delete().neq('group_id', ''));
		await check(this.db.from('group_players').delete().neq('group_id', ''));
		await check(this.db.from('groups').delete().neq('id', ''));
		await check(this.db.from('players').delete().neq('name', ''));
	}
}
