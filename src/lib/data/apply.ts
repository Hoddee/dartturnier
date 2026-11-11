import type {
	Change,
	DartRow,
	GroupOverrideRow,
	GroupPlayerRow,
	MatchRow,
	PlayerRow,
	TournamentSettingsRow
} from '../db-types';
import type { Data } from '../logic/derive';

function upsertBy<T>(list: T[], row: T, same: (a: T) => boolean): T[] {
	const i = list.findIndex(same);
	if (i < 0) return [...list, row];
	const copy = list.slice();
	copy[i] = { ...list[i], ...row };
	return copy;
}

/**
 * Wendet eine Änderung unveränderlich auf den Datenstand an. Nur die betroffenen Teile
 * bekommen neue Objekte, damit Caches (z. B. Matchstände) für den Rest erhalten bleiben.
 * Mehrfaches Anwenden derselben Änderung ist harmlos.
 */
export function applyChange(d: Data, c: Change): Data {
	if (c.kind === 'reload') return d;
	const row = c.row;
	switch (c.table) {
		case 'players': {
			const r = row as unknown as PlayerRow;
			const players =
				c.kind === 'delete'
					? d.players.filter((p) => p.id !== r.id)
					: upsertBy(d.players, r, (p) => p.id === r.id).sort((a, b) => a.position - b.position);
			return { ...d, players };
		}
		case 'group_players': {
			const r = row as unknown as GroupPlayerRow;
			const same = (g: GroupPlayerRow) => g.group_id === r.group_id && g.player_id === r.player_id;
			const groupPlayers =
				c.kind === 'delete' ? d.groupPlayers.filter((g) => !same(g)) : upsertBy(d.groupPlayers, r, same);
			return { ...d, groupPlayers };
		}
		case 'matches': {
			const r = row as unknown as MatchRow;
			const matches =
				c.kind === 'delete' ? d.matches.filter((m) => m.id !== r.id) : upsertBy(d.matches, r, (m) => m.id === r.id);
			return { ...d, matches };
		}
		case 'darts': {
			const r = row as unknown as DartRow;
			const current = d.dartsByMatch[r.match_id] ?? [];
			let next: DartRow[];
			if (c.kind === 'delete') {
				if (!current.some((x) => x.seq === r.seq)) return d;
				next = current.filter((x) => x.seq !== r.seq);
			} else {
				const existing = current.find((x) => x.seq === r.seq);
				if (existing && existing.segment === r.segment && existing.multiplier === r.multiplier) return d;
				next = [...current.filter((x) => x.seq !== r.seq), r].sort((a, b) => a.seq - b.seq);
			}
			return { ...d, dartsByMatch: { ...d.dartsByMatch, [r.match_id]: next } };
		}
		case 'tournament_settings':
			if (c.kind === 'delete') return d;
			return { ...d, settings: { ...d.settings, ...(row as unknown as TournamentSettingsRow) } };
		case 'group_overrides': {
			const r = row as unknown as GroupOverrideRow;
			const overrides =
				c.kind === 'delete'
					? d.overrides.filter((o) => o.group_id !== r.group_id)
					: upsertBy(d.overrides, r, (o) => o.group_id === r.group_id);
			return { ...d, overrides };
		}
	}
	return d;
}
