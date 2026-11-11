-- Update 4: Zähler, Spiel um Platz 3, Spielerfotos, Zeitplan
--
--   * matches.scorer_id: wer an der Scheibe zählt (null = offen).
--   * matches.scorer_from_loser_of: Der Verlierer dieses Matches wird automatisch Zähler
--     (Achtelfinale: Verlierer der ersten Welle zählen die zweite Welle).
--   * matches.loser_next_match_id/_slot: Halbfinal-Verlierer rücken ins Spiel um Platz 3.
--   * players.photo_url + Storage-Bucket player-photos (kleine, komprimierte Bilder).
--   * Zeitplan-Einstellungen (Turniertag, Beginn, Minuten pro Gruppenspiel, KO-Uhrzeiten).

alter table matches add column if not exists loser_next_match_id text references matches (id) on delete set null;
alter table matches add column if not exists loser_next_slot smallint check (loser_next_slot in (0, 1));
alter table matches add column if not exists scorer_id uuid references players (id) on delete set null;
alter table matches add column if not exists scorer_from_loser_of text references matches (id) on delete set null;

alter table players add column if not exists photo_url text;

alter table tournament_settings add column if not exists event_date text not null default '2026-12-28';
alter table tournament_settings add column if not exists start_time text not null default '14:00';
alter table tournament_settings add column if not exists slot_minutes smallint not null default 20;
alter table tournament_settings add column if not exists ko_times jsonb not null
	default '{"R16a": "18:30", "R16b": "19:05", "QF": "19:45", "SF": "20:35", "P3": "21:15", "F": "22:00"}';

-- Festgelegte Leg-Zahlen: Gruppe 3, Achtelfinale 3, Viertelfinale 4, Halbfinale 5, Platz 3 5, Finale 6
alter table tournament_settings alter column ko_legs_to_win
	set default '{"R16": 3, "QF": 4, "SF": 5, "P3": 5, "F": 6}';
update tournament_settings
set group_legs_to_win = 3, ko_legs_to_win = '{"R16": 3, "QF": 4, "SF": 5, "P3": 5, "F": 6}'
where id = 1;

-- ---------------------------------------------------------------------------
-- Sieger, Verlierer und Zähler automatisch weitergeben
-- ---------------------------------------------------------------------------

create or replace function advance_winner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	v_loser uuid;
begin
	if new.winner_id is not distinct from old.winner_id then
		return new;
	end if;

	v_loser := case
		when new.winner_id is null then null
		when new.winner_id = new.player_a then new.player_b
		else new.player_a
	end;

	-- Nur Folgematches ändern, die noch nicht begonnen haben.
	if new.next_match_id is not null then
		update matches
		set player_a = case when new.next_slot = 0 then new.winner_id else player_a end,
			player_b = case when new.next_slot = 1 then new.winner_id else player_b end,
			ready_a = false,
			ready_b = false
		where id = new.next_match_id and status = 'scheduled';
	end if;

	if new.loser_next_match_id is not null then
		update matches
		set player_a = case when new.loser_next_slot = 0 then v_loser else player_a end,
			player_b = case when new.loser_next_slot = 1 then v_loser else player_b end,
			ready_a = false,
			ready_b = false
		where id = new.loser_next_match_id and status = 'scheduled';
	end if;

	update matches
	set scorer_id = v_loser
	where scorer_from_loser_of = new.id and status = 'scheduled';

	return new;
end;
$$;

revoke all on function advance_winner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spielerfotos (Supabase Storage). Nur ausführen, wo es Storage gibt.
-- ---------------------------------------------------------------------------

do $$
begin
	if to_regclass('storage.buckets') is null then
		return;
	end if;

	insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
	values ('player-photos', 'player-photos', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
	on conflict (id) do update
	set public = true, file_size_limit = 524288, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

	drop policy if exists "player photos admin read" on storage.objects;
	drop policy if exists "player photos admin insert" on storage.objects;
	drop policy if exists "player photos admin update" on storage.objects;
	drop policy if exists "player photos admin delete" on storage.objects;

	create policy "player photos admin read" on storage.objects
		for select to authenticated using (bucket_id = 'player-photos');
	create policy "player photos admin insert" on storage.objects
		for insert to authenticated with check (bucket_id = 'player-photos');
	create policy "player photos admin update" on storage.objects
		for update to authenticated using (bucket_id = 'player-photos') with check (bucket_id = 'player-photos');
	create policy "player photos admin delete" on storage.objects
		for delete to authenticated using (bucket_id = 'player-photos');
end $$;
