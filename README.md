# Dart-Turnier · SC Fornsbach × Milchhäusle

Turnier-Software für 32 Spieler und 4 Scheiben: iPad-Eingabe an jeder Scheibe, Live-Seite für alle, TV-Ansicht und Turnierleitung. Alles läuft im Browser, die Daten liegen in Supabase und aktualisieren sich live.

| Adresse | Für wen | Was |
|---|---|---|
| `/` | alle (öffentlich) | Live-Stände der 4 Scheiben, letzte Ergebnisse, Fortschritt |
| `/tabellen`, `/ko`, `/spielplan`, `/statistik` | alle | Gruppentabellen, Turnierbaum, Spielplan je Scheibe, Bestwerte und Statistik aller Spieler |
| `/spieler/…` | alle | Turnier-Statistik und Spiele eines Spielers |
| `/tv` | Fernseher | 4 Scheiben live plus wechselnde Ansicht (Gruppen, KO-Runde, Bestwerte) alle 15 Sekunden |
| `/board` | iPads | Scheibe einrichten, danach Eingabe unter `/board/1` bis `/board/4` |
| `/admin` | Turnierleitung | Spieler, Gruppen, Spielplan, Spiele, Einstellungen |

## 1. Supabase einrichten

Das Projekt **Dartturnier_Software** (`https://ukqddtrmxxughmtrcjqr.supabase.co`) ist eingerichtet: alle drei Migrationen aus `supabase/migrations/` sind ausgeführt, der Board-Schlüssel ist gesetzt.

Für ein neues Projekt die drei Dateien in `supabase/migrations/` der Reihe nach im **SQL Editor** ausführen.

Danach in Supabase von Hand (geht nicht per SQL):
1. **Authentication → Sign In / Providers:** „Allow new users to sign up“ ausschalten. Sonst kann sich jeder registrieren und hätte Admin-Rechte.
2. **Authentication → Users → Add user:** Admin-Account mit „Auto Confirm User“ anlegen.

## 2. Lokal starten

```bash
npm install
npm run dev
```

Dann `http://localhost:5173` öffnen. Mit deiner `.env` (Supabase-URL und anon-Key) arbeitet die App mit der echten Datenbank.

**Demo-Modus:** Ohne `.env`, oder mit `?demo=1` am Ende der Adresse, läuft alles nur im Browser (Board-Schlüssel `demo`, Login mit beliebigen Daten). Unter Admin → Spielplan gibt es dann Knöpfe, die Spiele automatisch durchsimulieren. Mit `?demo=0` geht es zurück zur echten Datenbank.

## 3. Online stellen (Vercel, kostenlos)

Damit iPads, Handys und der Fernseher die Seite erreichen, muss sie im Internet stehen.

1. Projekt in ein GitHub-Repository hochladen (die `.env` bleibt draußen, das regelt `.gitignore`).
2. Auf vercel.com mit GitHub anmelden, **Add New → Project**, das Repository auswählen. Vercel erkennt SvelteKit automatisch.
3. Unter **Environment Variables** eintragen:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. Nach ein bis zwei Minuten hast du eine Adresse wie `dart-turnier.vercel.app`. Jeder spätere Push auf GitHub wird automatisch veröffentlicht.

Andere Anbieter (Netlify, Cloudflare Pages) funktionieren genauso.

## 4. Vorbereitung vor dem Turnier

1. **Admin-Login:** `/admin` mit dem Account aus Supabase (Authentication → Users).
2. **Spieler:** 32 Namen einfügen, ein Name pro Zeile. Doppelte Namen werden angezeigt.
3. **Gruppen:** auslosen oder der Reihe nach einteilen. Zwei Spieler nacheinander antippen tauscht sie.
4. **Spielplan:** „Spielplan erstellen“ legt die 48 Gruppenspiele (12 pro Scheibe) und den KO-Baum an. Gruppen A+E spielen auf Scheibe 1, B+F auf 2, C+G auf 3, D+H auf 4. Kein Spieler hat zwei Spiele direkt hintereinander.
5. **Einstellungen:** Legs pro Runde (Gruppe: First to 3; KO-Runde aktuell 4/4/5/6), Reihenfolge der Tiebreaker, Turniername. Hier setzt du auch den **Board-Schlüssel**.
6. **iPads:** auf jedem iPad `/board` öffnen, Scheibe wählen, Board-Schlüssel eingeben. In Safari „Teilen → Zum Home-Bildschirm“, dann mit **Geführter Zugriff** (Einstellungen → Bedienungshilfen) sperren, damit niemand die App verlässt.
7. **Fernseher:** `/tv` im Browser öffnen, „Vollbild“ drücken.
8. **Probelauf:** ein, zwei Spiele mit echten iPads durchspielen und danach unter Admin → Spiele wieder zurücksetzen.

## 5. Ablauf am Turniertag

**An der Scheibe:** Das iPad zeigt automatisch das nächste Spiel. Beide Spieler drücken „Bereit“, danach wird nach dem Ausbullen gewählt, wer anwirft. Eingabe Dart für Dart: erst Double oder Triple antippen (falls nötig), dann die Zahl. „25“ ist Single-Bull, mit Double wird daraus Bull (50). „Rückgängig“ nimmt den letzten Dart zurück, auch nach Spielende. Bust, Legwechsel, Anwurfwechsel und Checkout-Vorschläge macht die App selbst. Nach dem Sieg „Weiter zum nächsten Spiel“.

**Wenn das WLAN wackelt:** Die Eingabe läuft weiter, oben steht „x Eingaben werden gesendet“. Sobald das Netz zurück ist, wird nachgesendet, nichts zählt doppelt. Ein Handy-Hotspot als Ersatz-WLAN ist trotzdem eine gute Idee.

**Achtelfinale:** Sobald eine Gruppe fertig ist, unter Admin → Spielplan „Achtelfinale eintragen“ drücken (geht auch gruppenweise). Ab da rücken Sieger automatisch weiter.

**Gleichstand:** Bleiben zwei Spieler nach allen Kriterien gleich (Punkte, direkter Vergleich, Leg-Differenz, gewonnene Legs), wird die Gruppe gelb markiert. Unter Admin → Spielplan legst du die Reihenfolge fest, z. B. nach einem Ausbullen.

**Notfälle (Admin → Spiele):**
- *Falsch eingegeben, Undo reicht nicht:* „Zurücksetzen“ startet das Spiel an der Scheibe neu.
- *iPad ausgefallen:* „Ergebnis eintragen“ zählt für die Tabelle, nur ohne Darts für die Statistik.
- *Scheibe kaputt:* noch nicht begonnenes Spiel per Auswahl auf eine andere Scheibe legen.

## Regeln im Code

- 501, Double Out (Double 1-20 oder Bullseye). Bust bei Überwerfen, Rest 1 oder Rest 0 ohne Double: Rest springt zurück, der Gegner ist dran.
- Average = Punkte pro Dart × 3, eine Bust-Aufnahme zählt als 3 Darts mit 0 Punkten. Die laufende Aufnahme fließt erst nach ihrem Ende ein.
- Anwurf wechselt jedes Leg.
- 2 Punkte pro Sieg. Die ersten zwei jeder Gruppe kommen weiter.
- Achtelfinale A1–B2, C1–D2, E1–F2, G1–H2 oben, B1–A2, D1–C2, F1–E2, H1–G2 unten: Spieler aus derselben Gruppe treffen frühestens im Finale wieder aufeinander.

## Entwicklung

```bash
npm test        # 80 Tests: Spielregeln, Checkouts, Tabellen, KO-Baum, komplettes Turnier, Datenbank-Funktionen
npm run check   # Typprüfung
npm run build   # Produktions-Build
```

Die Datenbank-Tests führen beide Migrationen in einem echten Postgres (PGlite) aus und prüfen Absicherung und Ablauf der Funktionen.

```
src/lib/engine/       Spielregeln: Dart, Bust, Legs, Statistik, Checkout-Vorschläge
src/lib/tournament/   Gruppen, Spielplan, Tabelle mit Tiebreakern, KO-Baum
src/lib/logic/        Abgeleitete Daten (Stände, Tabellen, Bestwerte), Pläne für die Turnierleitung, Simulation
src/lib/data/         Supabase-Anbindung, Demo-Speicher, Live-Store
src/lib/board/        iPad: Zahlenfeld, Anzeige, Sende-Warteschlange
src/lib/admin/        Bereiche der Turnierleitung
src/lib/components/   Logos, Live-Karte, Tabelle, Turnierbaum, Bestwerte
src/routes/           Seiten (öffentlich, /tv, /board, /admin)
supabase/migrations/  Datenbank
```

**Datenmodell:** Jeder Dart ist ein Eintrag in `darts`. Der Spielstand wird immer aus diesen Einträgen berechnet; Undo heißt, den letzten Eintrag zu löschen. Die Tabelle `matches` hält nur die Zusammenfassung (Legs, Status, Sieger) für schnelle Tabellen.

**Zugriff:** Lesen ist öffentlich. Schreiben darf nur die eingeloggte Turnierleitung. Die iPads schreiben ausschließlich über die Funktionen `board_*`, die den Board-Schlüssel prüfen.
