-- Update 3: Absicherung nach den Hinweisen des Supabase-Security-Advisors
--
--   * Trigger-Funktion advance_winner ist nicht mehr per API aufrufbar (der Trigger läuft trotzdem).
--   * reset_match mit festem search_path.
--   * Die öffentliche Rolle anon darf Tabellen nur noch lesen. Schreiben ohne Login geht
--     ausschließlich über die board_*-Funktionen mit Board-Schlüssel.

revoke all on function advance_winner() from public, anon, authenticated;

alter function reset_match(text) set search_path = public;

revoke insert, update, delete, truncate, references, trigger
	on all tables in schema public from anon;
