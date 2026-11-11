<script lang="ts">
	import { untrack } from 'svelte';
	import { store } from '$lib/data/store.svelte';
	import { KO_ROUND_LABELS, type KoRound } from '$lib/tournament/knockout';
	import { DEFAULT_SETTINGS, type KoTimeKey } from '$lib/db-types';
	import { ui } from './ui.svelte';

	const ALL_TIEBREAKERS: { key: string; label: string }[] = [
		{ key: 'headToHead', label: 'Direkter Vergleich' },
		{ key: 'legDiff', label: 'Leg-Differenz' },
		{ key: 'legsWon', label: 'Gewonnene Legs' },
		{ key: 'average', label: 'Average' }
	];
	const ROUNDS: KoRound[] = ['R16', 'QF', 'SF', 'P3', 'F'];
	const TIME_KEYS: { key: KoTimeKey; label: string }[] = [
		{ key: 'R16a', label: 'Achtelfinale, 1. Welle' },
		{ key: 'R16b', label: 'Achtelfinale, 2. Welle' },
		{ key: 'QF', label: 'Viertelfinale' },
		{ key: 'SF', label: 'Halbfinale' },
		{ key: 'P3', label: 'Spiel um Platz 3' },
		{ key: 'F', label: 'Finale' }
	];

	const s = $derived(store.data.settings);
	let name = $state('');
	let groupLegs = $state(3);
	let pointsPerWin = $state(2);
	let koLegs = $state<Record<KoRound, number>>({ ...DEFAULT_SETTINGS.ko_legs_to_win });
	let eventDate = $state(DEFAULT_SETTINGS.event_date);
	let startTime = $state(DEFAULT_SETTINGS.start_time);
	let slotMinutes = $state(DEFAULT_SETTINGS.slot_minutes);
	let koTimes = $state<Record<KoTimeKey, string>>({ ...DEFAULT_SETTINGS.ko_times });
	let tiebreakers = $state<string[]>([]);
	let boardKey = $state('');
	let confirmText = $state('');

	// Formular mit gespeicherten Werten füllen; nur neu, wenn sich die Einstellungen wirklich ändern
	const saved = $derived(JSON.stringify(s));
	$effect(() => {
		void saved;
		untrack(() => fill());
	});

	function fill() {
		name = s.name;
		groupLegs = s.group_legs_to_win;
		pointsPerWin = s.points_per_win;
		koLegs = { ...DEFAULT_SETTINGS.ko_legs_to_win, ...s.ko_legs_to_win };
		eventDate = s.event_date ?? DEFAULT_SETTINGS.event_date;
		startTime = s.start_time ?? DEFAULT_SETTINGS.start_time;
		slotMinutes = s.slot_minutes ?? DEFAULT_SETTINGS.slot_minutes;
		koTimes = { ...DEFAULT_SETTINGS.ko_times, ...(s.ko_times ?? {}) };
		tiebreakers = [...s.tiebreakers];
	}

	const groupStarted = $derived(store.data.matches.some((m) => m.stage === 'group' && m.status !== 'scheduled'));
	const openKo = $derived(store.data.matches.filter((m) => m.stage === 'ko' && m.status === 'scheduled'));
	const openGroup = $derived(store.data.matches.filter((m) => m.stage === 'group' && m.status === 'scheduled'));

	function moveTb(i: number, dir: -1 | 1) {
		const list = [...tiebreakers];
		const j = i + dir;
		if (j < 0 || j >= list.length) return;
		[list[i], list[j]] = [list[j], list[i]];
		tiebreakers = list;
	}

	function toggleTb(key: string) {
		tiebreakers = tiebreakers.includes(key) ? tiebreakers.filter((k) => k !== key) : [...tiebreakers, key];
	}

	async function save() {
		await ui.run(async () => {
			await store.backend.updateSettings({
				name: name.trim() || 'Dart-Turnier',
				group_legs_to_win: groupLegs,
				points_per_win: pointsPerWin,
				ko_legs_to_win: koLegs,
				tiebreakers,
				event_date: eventDate,
				start_time: startTime,
				slot_minutes: slotMinutes,
				ko_times: koTimes
			});
			// Noch nicht begonnene Spiele übernehmen die neuen Leg-Zahlen
			for (const m of openGroup) {
				if (m.legs_to_win !== groupLegs) await store.backend.updateMatch(m.id, { legs_to_win: groupLegs });
			}
			for (const m of openKo) {
				const legs = koLegs[m.round as KoRound];
				if (legs && m.legs_to_win !== legs) await store.backend.updateMatch(m.id, { legs_to_win: legs });
			}
		}, 'Einstellungen gespeichert');
	}

	async function saveKey() {
		const ok = await ui.run(() => store.backend.setBoardKey(boardKey), 'Board-Schlüssel gespeichert');
		if (ok) boardKey = '';
	}

	function generateKey() {
		const words = ['bull', 'triple', 'double', 'check', 'oche', 'flight', 'shaft', 'tops', 'madhouse', 'maximum'];
		const pick = () => words[Math.floor(Math.random() * words.length)];
		boardKey = `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
	}

	async function resetAll() {
		if (confirmText !== 'LÖSCHEN') return;
		const ok = await ui.run(() => store.backend.resetTournament(), 'Turnier zurückgesetzt');
		if (ok) confirmText = '';
	}
</script>

<section class="panel">
	<h2>Turnier</h2>
	<div class="grid">
		<div>
			<label for="name">Name</label>
			<input id="name" type="text" bind:value={name} />
		</div>
		<div>
			<label for="gl">Legs zum Sieg in der Gruppenphase</label>
			<input id="gl" type="number" min="1" max="11" bind:value={groupLegs} />
		</div>
		<div>
			<label for="pw">Punkte pro Sieg</label>
			<input id="pw" type="number" min="1" max="3" bind:value={pointsPerWin} />
		</div>
	</div>

	<h3 class="sub">Legs zum Sieg in der KO-Runde</h3>
	<div class="grid four">
		{#each ROUNDS as r (r)}
			<div>
				<label for="ko-{r}">{KO_ROUND_LABELS[r]}</label>
				<input id="ko-{r}" type="number" min="1" max="15" bind:value={koLegs[r]} />
			</div>
		{/each}
	</div>

	<h3 class="sub">Zeitplan</h3>
	<p class="muted small">
		Gruppenspiele laufen pro Scheibe im festen Takt ab Turnierbeginn. Die KO-Runden starten zu den eingetragenen Uhrzeiten.
		Der Plan ist eine Richtschnur: Spiele starten trotzdem, sobald die Scheibe frei ist.
	</p>
	<div class="grid">
		<div>
			<label for="date">Turniertag</label>
			<input id="date" type="date" bind:value={eventDate} />
		</div>
		<div>
			<label for="start">Beginn Gruppenphase</label>
			<input id="start" type="time" bind:value={startTime} />
		</div>
		<div>
			<label for="slot">Minuten pro Gruppenspiel</label>
			<input id="slot" type="number" min="5" max="60" bind:value={slotMinutes} />
		</div>
	</div>
	<div class="grid times">
		{#each TIME_KEYS as t (t.key)}
			<div>
				<label for="t-{t.key}">{t.label}</label>
				<input id="t-{t.key}" type="time" bind:value={koTimes[t.key]} />
			</div>
		{/each}
	</div>

	<h3 class="sub">Reihenfolge bei Punktgleichheit</h3>
	<p class="muted small">Bleibt danach immer noch Gleichstand, entscheidet die Turnierleitung (Reiter Spielplan).</p>
	<ol class="tb">
		{#each tiebreakers as key, i (key)}
			<li>
				<span>{ALL_TIEBREAKERS.find((t) => t.key === key)?.label ?? key}</span>
				<button class="btn small" onclick={() => moveTb(i, -1)} disabled={i === 0} aria-label="nach oben">▲</button>
				<button class="btn small" onclick={() => moveTb(i, 1)} disabled={i === tiebreakers.length - 1} aria-label="nach unten">▼</button>
				<button class="btn small" onclick={() => toggleTb(key)}>Entfernen</button>
			</li>
		{/each}
	</ol>
	{#each ALL_TIEBREAKERS.filter((t) => !tiebreakers.includes(t.key)) as t (t.key)}
		<button class="btn small add" onclick={() => toggleTb(t.key)}>+ {t.label}</button>
	{/each}

	<div class="save">
		<button class="btn primary" onclick={save} disabled={ui.busy}>Einstellungen speichern</button>
		<span class="muted small">
			Neue Leg-Zahlen gelten für alle noch nicht begonnenen Spiele.
			{#if groupStarted}Laufende und beendete Spiele bleiben unverändert.{/if}
		</span>
	</div>
</section>

<section class="panel">
	<h2>Board-Schlüssel für die iPads</h2>
	{#if store.demo}
		<p class="muted">Im Demo-Modus lautet der Schlüssel immer <strong>demo</strong>.</p>
	{:else}
		<p class="muted">
			Damit melden sich die iPads an den Scheiben an. Aus Sicherheitsgründen wird der gespeicherte Schlüssel nicht angezeigt.
			Nach einer Änderung müssen alle iPads neu eingerichtet werden.
		</p>
		<div class="keyrow">
			<input type="text" bind:value={boardKey} placeholder="neuer Schlüssel (mind. 8 Zeichen)" autocomplete="off" />
			<button class="btn" onclick={generateKey}>Vorschlag</button>
			<button class="btn primary" onclick={saveKey} disabled={ui.busy || boardKey.trim().length < 8}>Speichern</button>
		</div>
	{/if}
</section>

<section class="panel danger-zone">
	<h2>Turnier zurücksetzen</h2>
	<p class="muted">Löscht alle Spieler, Gruppen, Spiele und Darts. Einstellungen und Board-Schlüssel bleiben erhalten.</p>
	<div class="keyrow">
		<input type="text" bind:value={confirmText} placeholder="zum Bestätigen LÖSCHEN eingeben" />
		<button class="btn danger" onclick={resetAll} disabled={ui.busy || confirmText !== 'LÖSCHEN'}>Alles löschen</button>
	</div>
</section>

<style>
	section + section {
		margin-top: 1rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: 1rem;
	}
	.grid.four {
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
	}
	.sub {
		margin-top: 1.5rem;
	}
	.times {
		margin-top: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
	}
	.small {
		font-size: 0.9rem;
	}
	.tb {
		padding-left: 1.5rem;
		margin: 0.5rem 0;
	}
	.tb li {
		margin: 0.35rem 0;
	}
	.tb li span {
		display: inline-block;
		min-width: 11rem;
	}
	.add {
		margin: 0.25rem 0.35rem 0 0;
	}
	.save {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}
	.keyrow {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.keyrow input {
		flex: 1;
		min-width: 14rem;
	}
	.danger-zone {
		border-color: rgba(236, 35, 48, 0.35);
	}
</style>
