/**
 * Führt die Supabase-Migrationen gegen ein echtes Postgres (PGlite, läuft im Prozess) aus
 * und prüft Absicherung und Spielablauf der Datenbankfunktionen.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

/** Nachbildung der Supabase-Umgebung: Rollen, Rechte, Realtime-Publication. */
const SUPABASE_STUB = `
	create role anon nologin;
	create role authenticated nologin;
	create publication supabase_realtime;
	alter default privileges in schema public grant all on tables to anon, authenticated;
	grant usage on schema public to anon, authenticated;
`;

let db: PGlite;

async function asRole<T>(role: 'anon' | 'authenticated', fn: () => Promise<T>): Promise<T> {
	await db.exec(`set role ${role}`);
	try {
		return await fn();
	} finally {
		await db.exec('reset role');
	}
}

async function errorOf(p: Promise<unknown>): Promise<{ message: string; code?: string }> {
	try {
		await p;
	} catch (e) {
		const err = e as { message: string; code?: string };
		return { message: err.message, code: err.code };
	}
	throw new Error('Fehler erwartet, aber Aufruf war erfolgreich');
}

const KEY = 'geheimer-board-schluessel';

const addDart = (match: string, seq: number, seg: number, mul: number, la = 0, lb = 0, win: number | null = null) =>
	db.query(`select * from board_add_dart($1, $2, $3, $4::smallint, $5::smallint, $6::smallint, $7::smallint, $8::smallint)`, [
		KEY,
		match,
		seq,
		seg,
		mul,
		la,
		lb,
		win
	]);

const match = async (id: string) =>
	(await db.query<Record<string, unknown>>('select * from matches where id = $1', [id])).rows[0];

beforeAll(async () => {
	db = new PGlite();
	await db.exec(SUPABASE_STUB);
	for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
		await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
	}
	await db.exec(`insert into app_secrets (key, value) values ('board_key', '${KEY}')`);
	await db.exec(`
		insert into players (id, name) values
			('00000000-0000-0000-0000-00000000000a', 'Anna'),
			('00000000-0000-0000-0000-00000000000b', 'Ben'),
			('00000000-0000-0000-0000-00000000000c', 'Chris'),
			('00000000-0000-0000-0000-00000000000d', 'Dana');
		insert into groups (id) values ('A');
		insert into matches (id, stage, group_id, round, player_a, player_b, board, queue_index, legs_to_win)
		values ('A-1-1', 'group', 'A', '1',
			'00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 0, 1);
		insert into matches (id, stage, round, legs_to_win) values ('F-1', 'ko', 'F', 1);
		insert into matches (id, stage, round, player_a, player_b, legs_to_win, next_match_id, next_slot)
		values
			('SF-1', 'ko', 'SF', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 1, 'F-1', 0),
			('SF-2', 'ko', 'SF', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d', 1, 'F-1', 1);
	`);
}, 60_000);

describe('Supabase-Migrationen', () => {
	it('Öffentlich lesbar, aber nicht direkt beschreibbar', async () => {
		await asRole('anon', async () => {
			const rows = await db.query('select count(*)::int as n from players');
			expect((rows.rows[0] as { n: number }).n).toBe(4);
			const res = await db.query(`update matches set legs_a = 5 where id = 'A-1-1'`);
			expect(res.affectedRows ?? 0).toBe(0);
			await errorOf(db.query(`insert into darts (match_id, seq, segment, multiplier) values ('A-1-1', 1, 20, 3)`));
			// RLS ohne Policy: Tabelle erscheint leer
			expect((await db.query('select * from app_secrets')).rows).toHaveLength(0);
			await errorOf(db.query(`select admin_set_board_key('irgendwas-langes')`));
		});
		expect((await match('A-1-1')).legs_a).toBe(0);
	});

	it('Board-Schlüssel wird geprüft', async () => {
		await asRole('anon', async () => {
			const e = await errorOf(db.query(`select board_ready('falsch', 'A-1-1', 0::smallint)`));
			expect(e.message).toContain('Ungültiger Board-Schlüssel');
			const ok = await db.query<{ ok: boolean }>(`select board_check_key($1) as ok`, [KEY]);
			expect(ok.rows[0].ok).toBe(true);
			const bad = await db.query<{ ok: boolean }>(`select board_check_key('falsch') as ok`);
			expect(bad.rows[0].ok).toBe(false);
		});
	});

	it('Ablauf: Ready → Anwurf → Darts → Undo → Sieg', async () => {
		await asRole('anon', async () => {
			// Darts vor dem Start werden abgelehnt
			expect((await errorOf(addDart('A-1-1', 1, 20, 3))).code).toBe('DT001');

			await db.query(`select board_ready($1, 'A-1-1', 0::smallint)`, [KEY]);
			expect((await match('A-1-1')).status).toBe('scheduled');
			await db.query(`select board_ready($1, 'A-1-1', 1::smallint)`, [KEY]);
			expect((await match('A-1-1')).status).toBe('live');

			// Anwurf fehlt noch
			expect((await errorOf(addDart('A-1-1', 1, 20, 3))).code).toBe('DT001');
			await db.query(`select board_set_first_thrower($1, 'A-1-1', 1::smallint)`, [KEY]);
			const m = await match('A-1-1');
			expect(m.first_thrower).toBe(1);
			expect(m.first_thrower_set).toBe(true);

			await addDart('A-1-1', 1, 20, 3);
			// Wiederholung desselben Darts: kein Fehler, keine Doppelung
			await addDart('A-1-1', 1, 20, 3);
			// Falscher Dart unter derselben Nummer: Konflikt
			expect((await errorOf(addDart('A-1-1', 1, 19, 3))).code).toBe('DT001');
			// Lücke: Konflikt
			expect((await errorOf(addDart('A-1-1', 3, 20, 1))).code).toBe('DT001');
			await addDart('A-1-1', 2, 20, 1);

			const count = await db.query<{ n: number }>(`select count(*)::int as n from darts where match_id = 'A-1-1'`);
			expect(count.rows[0].n).toBe(2);

			// Anwurf kann nach dem ersten Dart nicht mehr geändert werden
			expect(
				(await errorOf(db.query(`select board_set_first_thrower($1, 'A-1-1', 0::smallint)`, [KEY]))).code
			).toBe('DT001');

			// Undo nur für den letzten Dart, Wiederholung ist harmlos
			expect(
				(await errorOf(db.query(`select board_undo_dart($1, 'A-1-1', 1, 0::smallint, 0::smallint)`, [KEY]))).code
			).toBe('DT001');
			await db.query(`select board_undo_dart($1, 'A-1-1', 2, 0::smallint, 0::smallint)`, [KEY]);
			await db.query(`select board_undo_dart($1, 'A-1-1', 2, 0::smallint, 0::smallint)`, [KEY]);
			const after = await db.query<{ n: number }>(`select count(*)::int as n from darts where match_id = 'A-1-1'`);
			expect(after.rows[0].n).toBe(1);

			// Sieg
			await addDart('A-1-1', 2, 25, 2, 0, 1, 1);
			const won = await match('A-1-1');
			expect(won.status).toBe('finished');
			expect(won.winner_id).toBe('00000000-0000-0000-0000-00000000000b');
			expect(won.legs_b).toBe(1);

			// Undo nach Matchende öffnet das Match wieder
			await db.query(`select board_undo_dart($1, 'A-1-1', 2, 0::smallint, 0::smallint)`, [KEY]);
			const reopened = await match('A-1-1');
			expect(reopened.status).toBe('live');
			expect(reopened.winner_id).toBeNull();
		});
	});

	it('KO: Sieger rücken automatisch nach, Undo nimmt es zurück', async () => {
		await asRole('anon', async () => {
			for (const id of ['SF-1', 'SF-2']) {
				await db.query(`select board_ready($1, $2, 0::smallint)`, [KEY, id]);
				await db.query(`select board_ready($1, $2, 1::smallint)`, [KEY, id]);
				await db.query(`select board_set_first_thrower($1, $2, 0::smallint)`, [KEY, id]);
			}
			await addDart('SF-1', 1, 25, 2, 1, 0, 0);
			let f = await match('F-1');
			expect(f.player_a).toBe('00000000-0000-0000-0000-00000000000a');
			expect(f.player_b).toBeNull();

			await addDart('SF-2', 1, 25, 2, 0, 1, 1);
			f = await match('F-1');
			expect(f.player_b).toBe('00000000-0000-0000-0000-00000000000d');

			await db.query(`select board_undo_dart($1, 'SF-2', 1, 0::smallint, 0::smallint)`, [KEY]);
			f = await match('F-1');
			expect(f.player_b).toBeNull();
			expect(f.player_a).toBe('00000000-0000-0000-0000-00000000000a');
		});
	});

	it('Turnierleitung: Board-Schlüssel setzen und Match zurücksetzen', async () => {
		await asRole('authenticated', async () => {
			await errorOf(db.query(`select admin_set_board_key('kurz')`));
			await db.query(`select admin_set_board_key('neuer-schluessel-123')`);
			await db.query(`select reset_match('A-1-1')`);
		});
		const m = await match('A-1-1');
		expect(m.status).toBe('scheduled');
		expect(m.first_thrower_set).toBe(false);
		expect(m.ready_a).toBe(false);
		const n = await db.query<{ n: number }>(`select count(*)::int as n from darts where match_id = 'A-1-1'`);
		expect(n.rows[0].n).toBe(0);
		await asRole('anon', async () => {
			const ok = await db.query<{ ok: boolean }>(`select board_check_key('neuer-schluessel-123') as ok`);
			expect(ok.rows[0].ok).toBe(true);
		});
	});
});
