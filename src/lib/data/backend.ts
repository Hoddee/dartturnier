import type {
	Change,
	MatchRow,
	NewMatch,
	Snapshot,
	TournamentSettingsRow
} from '../db-types';

export type BackendErrorCode = 'conflict' | 'badKey' | 'auth' | 'network' | 'other';

export class BackendError extends Error {
	constructor(
		public code: BackendErrorCode,
		message: string
	) {
		super(message);
	}
}

export interface AddDartArgs {
	matchId: string;
	seq: number;
	segment: number;
	multiplier: number;
	legsA: number;
	legsB: number;
	winnerSlot: 0 | 1 | null;
}

export interface UndoDartArgs {
	matchId: string;
	seq: number;
	legsA: number;
	legsB: number;
}

export interface GroupAssignment {
	id: string;
	playerIds: string[];
}

export interface Session {
	email: string;
}

/** Gemeinsame Schnittstelle für Supabase und den Demo-Modus. */
export interface Backend {
	readonly mode: 'supabase' | 'demo';

	loadAll(): Promise<Snapshot>;
	/** Liefert Änderungen; onStatus(true) nach jedem (Wieder-)Verbinden. */
	subscribe(onChange: (c: Change) => void, onStatus: (connected: boolean) => void): () => void;

	// Scheiben (iPads)
	checkBoardKey(key: string): Promise<boolean>;
	/** Die Board-Funktionen liefern den aktualisierten Match-Datensatz zurück. */
	boardReady(key: string, matchId: string, slot: 0 | 1): Promise<MatchRow | null>;
	boardSetFirstThrower(key: string, matchId: string, slot: 0 | 1): Promise<MatchRow | null>;
	boardAddDart(key: string, args: AddDartArgs): Promise<MatchRow | null>;
	boardUndoDart(key: string, args: UndoDartArgs): Promise<MatchRow | null>;

	// Login Turnierleitung
	getSession(): Promise<Session | null>;
	onAuthChange(cb: (s: Session | null) => void): () => void;
	signIn(email: string, password: string): Promise<void>;
	signOut(): Promise<void>;

	// Turnierleitung
	addPlayers(names: string[]): Promise<void>;
	renamePlayer(id: string, name: string): Promise<void>;
	deletePlayer(id: string): Promise<void>;
	/** Spielerfoto setzen (bereits verkleinertes Bild) oder mit null entfernen. */
	setPlayerPhoto(playerId: string, photo: Blob | null): Promise<void>;
	/** Ersetzt alle Gruppen und Gruppenzuordnungen (inkl. manueller Entscheidungen). */
	saveGroups(groups: GroupAssignment[]): Promise<void>;
	/** Löscht alle Matches der Phase (samt Darts) und legt die neuen an. */
	replaceMatches(stage: 'group' | 'ko', rows: NewMatch[]): Promise<void>;
	updateMatch(id: string, patch: Partial<MatchRow>): Promise<void>;
	resetMatch(id: string): Promise<void>;
	setOverride(groupId: string, order: string[] | null): Promise<void>;
	updateSettings(patch: Partial<TournamentSettingsRow>): Promise<void>;
	setBoardKey(value: string): Promise<void>;
	resetTournament(): Promise<void>;
}
