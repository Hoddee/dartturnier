/** Zeilen-Typen passend zu den SQL-Migrationen in supabase/migrations */

export interface PlayerRow {
	id: string;
	name: string;
	created_at: string;
	/** Eingabereihenfolge */
	position: number;
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
	ko_legs_to_win: Record<'R16' | 'QF' | 'SF' | 'F', number>;
}

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
	ko_legs_to_win: { R16: 4, QF: 4, SF: 5, F: 6 }
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
