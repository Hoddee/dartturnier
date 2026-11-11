-- Dart-Turnier: Datenbankschema für Supabase (Postgres)
--
-- Prinzip: Jeder geworfene Dart ist ein Ereignis (Tabelle darts). Spielstand, Average,
-- 180er, High Finish usw. werden im Client aus diesen Ereignissen berechnet
-- (src/lib/engine). Die Tabelle matches hält nur den Zusammenfassungsstand
-- (Legs, Status, Sieger), damit Tabellen und Live-Seite schnell laden.
--
-- Zugriff:
--   * Lesen: öffentlich (anon), für die Live-Seite.
--   * Schreiben als Turnierleitung: eingeloggter Supabase-Auth-User (Rolle authenticated).
--     WICHTIG: In den Auth-Einstellungen "Allow new users to sign up" ausschalten und
--     den Admin-Account manuell anlegen.
--   * Schreiben von den iPads: nur über die board_*-Funktionen unten, geschützt durch
--     einen geheimen Board-Schlüssel (Tabelle app_secrets, siehe README).

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table players (
	id uuid primary key default gen_random_uuid(),
	name text not null check (length(trim(name)) > 0),
	created_at timestamptz not null default now()
);

create table groups (
	id text primary key check (id ~ '^[A-Z]$')
);

create table group_players (
	group_id text not null references groups (id) on delete cascade,
	player_id uuid not null references players (id) on delete cascade,
	/** Setzreihenfolge in der Gruppe (1-basiert), letzter Fallback bei Gleichstand. */
	seed smallint not null check (seed >= 1),
	primary key (group_id, player_id),
	unique (player_id),
	unique (group_id, seed)
);

create table boards (
	id smallint primary key check (id between 1 and 8),
	label text not null
);

create type match_stage as enum ('group', 'ko');
create type match_status as enum ('scheduled', 'live', 'finished');

create table matches (
	/** Gruppe: "A-2-1" (Gruppe-Runde-Spiel). KO: "R16-3", "QF-1", "SF-2", "F-1". */
	id text primary key,
	stage match_stage not null,
	group_id text references groups (id),
	/** Gruppe: "1".."3"; KO: "R16", "QF", "SF", "F". */
	round text not null,
	/** Bei KO-Spielen null, bis die Teilnehmer feststehen. */
	player_a uuid references players (id),
	player_b uuid references players (id),
	board smallint references boards (id),
	/** Reihenfolge in der Warteschlange der Scheibe. */
	queue_index int,
	legs_to_win smallint not null check (legs_to_win >= 1),
	/** 0 = Spieler A wirft im ersten Leg an, 1 = Spieler B. */
	first_thrower smallint not null default 0 check (first_thrower in (0, 1)),
	status match_status not null default 'scheduled',
	ready_a boolean not null default false,
	ready_b boolean not null default false,
	legs_a smallint not null default 0,
	legs_b smallint not null default 0,
	winner_id uuid references players (id),
	started_at timestamptz,
	finished_at timestamptz,
	check (player_a is null or player_b is null or player_a <> player_b),
	check (stage <> 'group' or group_id is not null)
);

create index matches_board_queue_idx on matches (board, queue_index);
create index matches_status_idx on matches (status);

create table darts (
	match_id text not null references matches (id) on delete cascade,
	/** Laufende Nummer innerhalb des Matches (1-basiert). Undo löscht den höchsten Eintrag. */
	seq int not null check (seq >= 1),
	/** 0 = Fehlwurf, 1..20, 25 = Bull. */
	segment smallint not null,
	/** 1 = Single, 2 = Double, 3 = Triple. */
	multiplier smallint not null,
	created_at timestamptz not null default now(),
	primary key (match_id, seq),
	constraint valid_dart check (
		(segment = 0 and multiplier = 1)
		or (segment between 1 and 20 and multiplier between 1 and 3)
		or (segment = 25 and multiplier in (1, 2))
	)
);

create table tournament_settings (
	id smallint primary key default 1 check (id = 1),
	name text not null default 'Dart-Turnier',
	points_per_win smallint not null default 2,
	/** Reihenfolge der Kriterien bei Punktgleichheit: headToHead, legDiff, legsWon, average */
	tiebreakers text[] not null default array['headToHead', 'legDiff', 'legsWon'],
	group_legs_to_win smallint not null default 3,
	ko_legs_to_win jsonb not null default '{"R16": 4, "QF": 4, "SF": 5, "F": 6}'
);

insert into tournament_settings default values;

/** Manuelle Entscheidung der Turnierleitung bei nicht auflösbarem Gleichstand. */
create table group_overrides (
	group_id text primary key references groups (id) on delete cascade,
	manual_order uuid[] not null
);

/** Geheimnisse (z. B. board_key). Keine Policy: nur Funktionen und Service-Rolle kommen heran. */
create table app_secrets (
	key text primary key,
	value text not null
);

insert into boards (id, label)
values (1, 'Scheibe 1'), (2, 'Scheibe 2'), (3, 'Scheibe 3'), (4, 'Scheibe 4');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table players enable row level security;
alter table groups enable row level security;
alter table group_players enable row level security;
alter table boards enable row level security;
alter table matches enable row level security;
alter table darts enable row level security;
alter table tournament_settings enable row level security;
alter table group_overrides enable row level security;
alter table app_secrets enable row level security;

do $$
declare
	t text;
begin
	foreach t in array array[
		'players', 'groups', 'group_players', 'boards', 'matches', 'darts',
		'tournament_settings', 'group_overrides'
	]
	loop
		execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
		execute format(
			'create policy "admin write" on %I for all to authenticated using (true) with check (true)', t
		);
	end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funktionen für die iPads (Board-App)
-- ---------------------------------------------------------------------------

create or replace function check_board_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
	if p_key is null or not exists (
		select 1 from app_secrets where key = 'board_key' and value = p_key
	) then
		raise exception 'Ungültiger Board-Schlüssel' using errcode = '28000';
	end if;
end;
$$;

/** Ein Spieler drückt "Ready". Sind beide bereit, startet das Match (Status live). */
create or replace function board_ready(p_key text, p_match_id text, p_slot smallint)
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
	if m.status <> 'scheduled' then
		return m;
	end if;
	if m.player_a is null or m.player_b is null then
		raise exception 'Die Spieler dieses Matches stehen noch nicht fest';
	end if;

	update matches
	set ready_a = ready_a or p_slot = 0,
		ready_b = ready_b or p_slot = 1
	where id = p_match_id
	returning * into m;

	if m.ready_a and m.ready_b then
		update matches
		set status = 'live', started_at = now()
		where id = p_match_id
		returning * into m;
	end if;
	return m;
end;
$$;

/**
 * Speichert einen Dart und den vom Client berechneten Zwischenstand.
 * p_winner_slot ist gesetzt (0/1), wenn dieser Dart das Match beendet hat.
 */
create or replace function board_add_dart(
	p_key text,
	p_match_id text,
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
	v_seq int;
begin
	perform check_board_key(p_key);

	select * into m from matches where id = p_match_id for update;
	if not found then
		raise exception 'Match nicht gefunden';
	end if;
	if m.status <> 'live' then
		raise exception 'Das Match läuft nicht (Status: %)', m.status;
	end if;

	select coalesce(max(seq), 0) + 1 into v_seq from darts where match_id = p_match_id;
	insert into darts (match_id, seq, segment, multiplier)
	values (p_match_id, v_seq, p_segment, p_multiplier);

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

/** Macht den letzten Dart rückgängig (auch nach Matchende) und setzt den Zwischenstand neu. */
create or replace function board_undo_dart(
	p_key text,
	p_match_id text,
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
	v_deleted int;
begin
	perform check_board_key(p_key);

	select * into m from matches where id = p_match_id for update;
	if not found then
		raise exception 'Match nicht gefunden';
	end if;
	if m.status = 'scheduled' then
		raise exception 'Das Match hat noch nicht begonnen';
	end if;

	delete from darts
	where match_id = p_match_id
		and seq = (select max(seq) from darts where match_id = p_match_id);
	get diagnostics v_deleted = row_count;
	if v_deleted = 0 then
		raise exception 'Kein Dart zum Rückgängigmachen vorhanden';
	end if;

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

revoke all on function check_board_key(text) from public, anon, authenticated;
revoke all on function board_ready(text, text, smallint) from public;
revoke all on function board_add_dart(text, text, smallint, smallint, smallint, smallint, smallint) from public;
revoke all on function board_undo_dart(text, text, smallint, smallint) from public;
grant execute on function board_ready(text, text, smallint) to anon, authenticated;
grant execute on function board_add_dart(text, text, smallint, smallint, smallint, smallint, smallint)
	to anon, authenticated;
grant execute on function board_undo_dart(text, text, smallint, smallint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funktion für die Turnierleitung
-- ---------------------------------------------------------------------------

/** Setzt ein Match komplett zurück (Darts löschen, Ready/Legs/Status zurücksetzen). */
create or replace function reset_match(p_match_id text)
returns void
language sql
security invoker
as $$
	delete from darts where match_id = p_match_id;
	update matches
	set status = 'scheduled', ready_a = false, ready_b = false, legs_a = 0, legs_b = 0,
		winner_id = null, started_at = null, finished_at = null
	where id = p_match_id;
$$;

revoke all on function reset_match(text) from public, anon;
grant execute on function reset_match(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
	matches, darts, players, group_players, group_overrides, tournament_settings;
