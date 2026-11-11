/** Zeilen-Typen passend zu den SQL-Migrationen in supabase/migrations */

export interface PlayerRow {
	id: string;
	name: string;
	created_at: string;
	/** Eingabereihenfolge */
	position: number;
	/** Öffentliche Bild-URL des Spielerfotos (Supabase Storage bzw. Data-URL im Demo-Modus) */
	photo_url: string | null;
}

export interface GroupPlayerRow {
	group_id: string;
	player_id: string;
	seed: number;
}

export type MatchStage = 'group' | 'ko';
export type MatchStatusDb = 'scheduled' | 'live' | 'finished';

export interface MatchRow {
	id: string;
	stage: MatchStage;
	group_id: string | null;
	round: string;
	player_a: string | null;
	player_b: string | null;
	board: number | null;
	queue_index: number | null;
	legs_to_win: number;
	first_thrower: 0 | 1;
	first_thrower_set: boolean;
	status: MatchStatusDb;
	ready_a: boolean;
	ready_b: boolean;
	legs_a: number;
	legs_b: number;
	winner_id: string | null;
	started_at: string | null;
	finished_at: string | null;
	next_match_id: string | null;
	next_slot: 0 | 1 | null;
	/** Verlierer rückt hierhin (Halbfinale → Spiel um Platz 3) */
	loser_next_match_id: string | null;
	loser_next_slot: 0 | 1 | null;
	/** Zähler, der an der Scheibe die Darts eingibt (null = offen) */
	scorer_id: string | null;
	/** Der Verlierer dieses Matches wird automatisch Zähler (Achtelfinale, zweite Welle) */
	scorer_from_loser_of: string | null;
}

/** Felder, die beim Anlegen eines Matches gesetzt werden. */
export type NewMatch = Pick<
	MatchRow,
	| 'id'
	| 'stage'
	| 'group_id'
	| 'round'
	| 'player_a'
	| 'player_b'
	| 'board'
	| 'queue_index'
	| 'legs_to_win'
	| 'next_match_id'
	| 'next_slot'
	| 'loser_next_match_id'
	| 'loser_next_slot'
	| 'scorer_id'
	| 'scorer_from_loser_of'
>;

export interface DartRow {
	match_id: string;
	seq: number;
	segment: number;
	multiplier: 1 | 2 | 3;
	created_at?: string;
}

export interface TournamentSettingsRow {
	id: 1;
	name: string;
	points_per_win: number;
	tiebreakers: string[];
	group_legs_to_win: number;
	ko_legs_to_win: Record<KoRoundKey, number>;
	/** Zeitplan: Turniertag (YYYY-MM-DD), Beginn (HH:MM), Minuten pro Gruppenspiel */
	event_date: string;
	start_time: string;
	slot_minutes: number;
	/** Geplante Startzeiten der KO-Runden (HH:MM); R16a/R16b = erste/zweite Achtelfinal-Welle */
	ko_times: Record<KoTimeKey, string>;
}

export type KoRoundKey = 'R16' | 'QF' | 'SF' | 'P3' | 'F';
export type KoTimeKey = 'R16a' | 'R16b' | 'QF' | 'SF' | 'P3' | 'F';

export interface GroupOverrideRow {
	group_id: string;
	manual_order: string[];
}

export const DEFAULT_SETTINGS: TournamentSettingsRow = {
	id: 1,
	name: 'Dart-Turnier',
	points_per_win: 2,
	tiebreakers: ['headToHead', 'legDiff', 'legsWon'],
	group_legs_to_win: 3,
	ko_legs_to_win: { R16: 3, QF: 4, SF: 5, P3: 5, F: 6 },
	event_date: '2026-12-28',
	start_time: '14:00',
	slot_minutes: 20,
	ko_times: { R16a: '18:30', R16b: '19:05', QF: '19:45', SF: '20:35', P3: '21:15', F: '22:00' }
};

/** Kompletter Datenstand, wie ihn alle Ansichten nutzen. */
export interface Snapshot {
	players: PlayerRow[];
	groupPlayers: GroupPlayerRow[];
	matches: MatchRow[];
	darts: DartRow[];
	settings: TournamentSettingsRow;
	overrides: GroupOverrideRow[];
}

export type TableName =
	| 'players'
	| 'group_players'
	| 'matches'
	| 'darts'
	| 'tournament_settings'
	| 'group_overrides';

/** Änderung aus Realtime bzw. Demo-Modus. Bei 'delete' enthält row mindestens den Primärschlüssel. */
export type Change =
	| { kind: 'upsert'; table: TableName; row: Record<string, unknown> }
	| { kind: 'delete'; table: TableName; row: Record<string, unknown> }
	| { kind: 'reload' };
