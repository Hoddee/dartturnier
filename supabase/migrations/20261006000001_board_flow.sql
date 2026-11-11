-- Update 2: Spielablauf an den Scheiben, KO-Baum, Admin-Funktionen
--
-- Einfach komplett im SQL-Editor von Supabase ausführen (nach der ersten Migration).
--
-- Neu:
--   * Anwurf wird am iPad nach dem Ausbullen gewählt (board_set_first_thrower).
--   * Jeder Dart trägt eine erwartete Laufnummer. Doppelte oder verspätete Eingaben
--     (z. B. bei wackligem WLAN) werden erkannt statt doppelt gezählt.
--   * KO-Baum: Sieger rücken automatisch ins nächste Match (Trigger).
--   * Turnierleitung kann den Board-Schlüssel im Admin-Panel setzen.

-- ---------------------------------------------------------------------------
-- Neue Spalten
-- ---------------------------------------------------------------------------

alter table matches add column if not exists next_match_id text references matches (id) on delete set null;
alter table matches add column if not exists next_slot smallint check (next_slot in (0, 1));
alter table matches add column if not exists first_thrower_set boolean not null default false;

/** Eingabereihenfolge der Spieler (für "Gruppen der Reihe nach einteilen"). */
alter table players add column if not exists position bigserial;

-- ---------------------------------------------------------------------------
-- Board-Funktionen (ersetzen die Versionen aus der ersten Migration)
-- ---------------------------------------------------------------------------

drop function if exists board_add_dart(text, text, smallint, smallint, smallint, smallint, smallint);
drop function if exists board_undo_dart(text, text, smallint, smallint);

/** Nach dem Ausbullen: wer wirft im ersten Leg an. Nur möglich, solange noch kein Dart geworfen wurde. */
create or replace function board_set_first_thrower(p_key text, p_match_id text, p_slot smallint)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
	m matches;
begin
	perform check_board_key(p_key);
	if p_slot not in (0, 1) then
		raise exception 'Ungültiger Spieler-Slot';
	end if;

	select * into m from matches where id = p_match_id for update;
	if not found then
		raise exception 'Match nicht gefunden';
	end if;
	if m.status <> 'live' then
		raise exception 'Das Match läuft nicht (Status: %)', m.status;
	end if;
	if exists (select 1 from darts where match_id = p_match_id) then
		raise exception 'Es wurden bereits Darts geworfen' using errcode = 'DT001';
	end if;

	update matches
	set first_thrower = p_slot, first_thrower_set = true
	where id = p_match_id
	returning * into m;
	return m;
end;
$$;

/**
 * Speichert einen Dart.
 * p_seq ist die Laufnummer, die dieser Dart bekommen soll (Anzahl bisheriger Darts + 1).
 * Passt sie nicht, wurde das Match zwischenzeitlich verändert: Fehler DT001 (Konflikt).
 * Kommt derselbe Dart mit derselben Nummer erneut an (Wiederholung nach Verbindungsabbruch),
 * wird er nicht doppelt gespeichert.
 * p_winner_slot ist gesetzt (0/1), wenn dieser Dart das Match beendet hat.
 */
create or replace function board_add_dart(
	p_key text,
	p_match_id text,
	p_seq int,
	p_segment smallint,
	p_multiplier smallint,
	p_legs_a smallint,
	p_legs_b smallint,
	p_winner_slot smallint default null
)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
	m matches;
	v_last int;
	v_existing darts;
begin
	perform check_board_key(p_key);

	select * into m from matches where id = p_match_id for update;
	if not found then
		raise exception 'Match nicht gefunden';
	end if;

	select * into v_existing from darts where match_id = p_match_id and seq = p_seq;
	if found then
		if v_existing.segment = p_segment and v_existing.multiplier = p_multiplier then
			return m; -- Wiederholung, bereits gespeichert
		end if;
		raise exception 'Konflikt: Dart % existiert bereits', p_seq using errcode = 'DT001';
	end if;

	if m.status <> 'live' or not m.first_thrower_set then
		raise exception 'Das Match läuft nicht (Status: %)', m.status using errcode = 'DT001';
	end if;

	select coalesce(max(seq), 0) into v_last from darts where match_id = p_match_id;
	if p_seq <> v_last + 1 then
		raise exception 'Konflikt: erwartet Dart %, erhalten %', v_last + 1, p_seq using errcode = 'DT001';
	end if;

	insert into darts (match_id, seq, segment, multiplier)
	values (p_match_id, p_seq, p_segment, p_multiplier);

	update matches
	set legs_a = p_legs_a,
		legs_b = p_legs_b,
		status = case when p_winner_slot is null then 'live'::match_status else 'finished'::match_status end,
		winner_id = case p_winner_slot when 0 then player_a when 1 then player_b else null end,
		finished_at = case when p_winner_slot is null then null else now() end
	where id = p_match_id
	returning * into m;
	return m;
end;
$$;

/**
 * Löscht den Dart mit Laufnummer p_seq, sofern er der letzte ist (Undo, auch nach Matchende).
 * Ist er schon gelöscht (Wiederholung), passiert nichts.
 */
create or replace function board_undo_dart(
	p_key text,
	p_match_id text,
	p_seq int,
	p_legs_a smallint,
	p_legs_b smallint
)
returns matches
language plpgsql
security definer
set search_path = public
as $$
declare
	m matches;
	v_last int;
begin
	perform check_board_key(p_key);

	select * into m from matches where id = p_match_id for update;
	if not found then
		raise exception 'Match nicht gefunden';
	end if;

	select coalesce(max(seq), 0) into v_last from darts where match_id = p_match_id;
	if v_last = p_seq - 1 then
		return m; -- Wiederholung, bereits gelöscht
	end if;
	if v_last <> p_seq or m.status = 'scheduled' then
		raise exception 'Konflikt: letzter Dart ist %, nicht %', v_last, p_seq using errcode = 'DT001';
	end if;

	delete from darts where match_id = p_match_id and seq = p_seq;

	update matches
	set legs_a = p_legs_a,
		legs_b = p_legs_b,
		status = 'live',
		winner_id = null,
		finished_at = null
	where id = p_match_id
	returning * into m;
	return m;
end;
$$;

revoke all on function board_set_first_thrower(text, text, smallint) from public;
revoke all on function board_add_dart(text, text, int, smallint, smallint, smallint, smallint, smallint) from public;
revoke all on function board_undo_dart(text, text, int, smallint, smallint) from public;
grant execute on function board_set_first_thrower(text, text, smallint) to anon, authenticated;
grant execute on function board_add_dart(text, text, int, smallint, smallint, smallint, smallint, smallint)
	to anon, authenticated;
grant execute on function board_undo_dart(text, text, int, smallint, smallint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Turnierleitung
-- ---------------------------------------------------------------------------

create or replace function reset_match(p_match_id text)
returns void
language sql
security invoker
as $$
	delete from darts where match_id = p_match_id;
	update matches
	set status = 'scheduled', ready_a = false, ready_b = false, legs_a = 0, legs_b = 0,
		winner_id = null, started_at = null, finished_at = null,
		first_thrower = 0, first_thrower_set = false
	where id = p_match_id;
$$;

revoke all on function reset_match(text) from public, anon;
grant execute on function reset_match(text) to authenticated;

/** Board-Schlüssel setzen oder ändern (nur eingeloggte Turnierleitung). */
create or replace function admin_set_board_key(p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if p_value is null or length(trim(p_value)) < 8 then
		raise exception 'Der Schlüssel muss mindestens 8 Zeichen lang sein';
	end if;
	insert into app_secrets (key, value) values ('board_key', trim(p_value))
	on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function admin_set_board_key(text) from public, anon;
grant execute on function admin_set_board_key(text) to authenticated;

/** Prüft einen Board-Schlüssel, ohne etwas zu verändern (für die Einrichtung am iPad). */
create or replace function board_check_key(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
	return exists (select 1 from app_secrets where key = 'board_key' and value = p_key);
end;
$$;

revoke all on function board_check_key(text) from public;
grant execute on function board_check_key(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- KO-Baum: Sieger automatisch ins nächste Match eintragen
-- ---------------------------------------------------------------------------

create or replace function advance_winner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if new.next_match_id is null or new.winner_id is not distinct from old.winner_id then
		return new;
	end if;

	-- Nur ändern, solange das Folgematch noch nicht begonnen hat.
	update matches
	set player_a = case when new.next_slot = 0 then new.winner_id else player_a end,
		player_b = case when new.next_slot = 1 then new.winner_id else player_b end,
		ready_a = false,
		ready_b = false
	where id = new.next_match_id and status = 'scheduled';

	return new;
end;
$$;

drop trigger if exists matches_advance_winner on matches;
create trigger matches_advance_winner
after update of winner_id on matches
for each row execute function advance_winner();
