<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { MemoryBackend } from '$lib/data/memory-backend';
	import { matchConfig, nameOf, type GroupStandings } from '$lib/logic/derive';
	import { groupMatchRows, koMatchRows, r16Assignments } from '$lib/logic/plans';
	import { simulateMatch } from '$lib/logic/simulate';
	import { ui } from './ui.svelte';

	const groups = $derived(store.view.groups);
	const standings = $derived(store.view.standings);
	const names = $derived(store.view.players);
	const groupMatches = $derived(store.data.matches.filter((m) => m.stage === 'group'));
	const koMatches = $derived(store.data.matches.filter((m) => m.stage === 'ko'));
	const groupStarted = $derived(groupMatches.some((m) => m.status !== 'scheduled'));
	const koStarted = $derived(koMatches.some((m) => m.status !== 'scheduled'));
	const eightGroups = $derived(groups.length === 8);
	const assignments = $derived(
		eightGroups ? r16Assignments(groups.map((g) => g.id), standings, koMatches) : []
	);
	const groupsDone = $derived(standings.filter((s) => s.complete).length);

	async function createSchedule() {
		if (groupMatches.length && !confirm('Spielplan neu erstellen? Der bisherige Plan wird ersetzt.')) return;
		const settings = store.data.settings;
		await ui.run(async () => {
			await store.backend.replaceMatches('ko', []);
			await store.backend.replaceMatches('group', groupMatchRows(groups, settings));
			if (eightGroups) await store.backend.replaceMatches('ko', koMatchRows(groups.map((g) => g.id), settings));
		}, 'Spielplan erstellt');
	}

	async function fillR16() {
		await ui.run(async () => {
			for (const a of assignments) {
				const patch: Record<string, string> = {};
				if (a.player_a) patch.player_a = a.player_a;
				if (a.player_b) patch.player_b = a.player_b;
				if (a.scorer_id) patch.scorer_id = a.scorer_id;
				await store.backend.updateMatch(a.matchId, patch);
			}
		}, 'Achtelfinale befüllt');
	}

	// ---- Gleichstand entscheiden ----
	let order = $state<Record<string, string[]>>({});

	function tiedOrder(s: GroupStandings): string[] {
		return order[s.group.id] ?? s.rows.map((r) => r.playerId);
	}

	function move(s: GroupStandings, i: number, dir: -1 | 1) {
		const list = [...tiedOrder(s)];
		const j = i + dir;
		if (j < 0 || j >= list.length) return;
		[list[i], list[j]] = [list[j], list[i]];
		order = { ...order, [s.group.id]: list };
	}

	async function saveOrder(s: GroupStandings) {
		await ui.run(() => store.backend.setOverride(s.group.id, tiedOrder(s)), `Reihenfolge Gruppe ${s.group.id} gespeichert`);
	}

	async function clearOrder(groupId: string) {
		const { [groupId]: _drop, ...rest } = order;
		order = rest;
		await ui.run(() => store.backend.setOverride(groupId, null), 'Manuelle Entscheidung entfernt');
	}

	const overridden = $derived(new Set(store.data.overrides.map((o) => o.group_id)));

	// ---- nur Demo: Spiele simulieren ----
	async function simulate(stage: 'group' | 'ko') {
		const be = store.backend;
		if (!(be instanceof MemoryBackend)) return;
		await ui.run(async () => {
			const list = store.data.matches.filter(
				(m) => m.stage === stage && m.status === 'scheduled' && m.player_a && m.player_b
			);
			for (const m of list) {
				const first = Math.random() < 0.5 ? 0 : 1;
				const { darts, state } = simulateMatch(matchConfig({ legs_to_win: m.legs_to_win, first_thrower: first }), [
					0.35 + Math.random() * 0.55,
					0.35 + Math.random() * 0.55
				]);
				await be.demoPlayMatch(m.id, first, darts, state.legsWon[0], state.legsWon[1]);
			}
		}, 'Spiele simuliert');
	}
</script>

<section class="panel step">
	<h2>Spielplan erstellen</h2>
	{#if groups.length === 0}
		<p class="muted">Zuerst die Gruppen einteilen.</p>
	{:else}
		<p class="muted">
			Jeder gegen jeden in jeder Gruppe, {store.data.settings.group_legs_to_win} gewonnene Legs pro Spiel. Gruppen A+E
			spielen auf Scheibe 1, B+F auf 2, C+G auf 3, D+H auf 4.
			{#if eightGroups}Der KO-Baum wird gleich mit angelegt.{/if}
		</p>
		{#if groupMatches.length}
			<p>
				<strong class="num">{groupMatches.length}</strong> Gruppenspiele{#if koMatches.length}, <strong class="num"
						>{koMatches.length}</strong
					> KO-Spiele{/if} angelegt.
			</p>
		{/if}
		{#if groupStarted}
			<p class="muted">Die Gruppenphase läuft, der Plan kann nicht mehr neu erstellt werden.</p>
		{:else}
			<button class="btn primary" onclick={createSchedule} disabled={ui.busy}>
				{groupMatches.length ? 'Spielplan neu erstellen' : 'Spielplan erstellen'}
			</button>
		{/if}
	{/if}
</section>

{#if groupMatches.length}
	<section class="panel step">
		<h2>Achtelfinale befüllen</h2>
		<p class="muted">
			{groupsDone} von {groups.length} Gruppen abgeschlossen. Sobald eine Gruppe fertig ist, können ihre beiden Aufsteiger
			eingetragen werden. Die Sieger der KO-Spiele rücken danach automatisch weiter.
		</p>
		{#if !eightGroups}
			<p class="warn">Der KO-Baum braucht genau 8 Gruppen.</p>
		{:else if assignments.length}
			<ul class="assign">
				{#each assignments as a (a.matchId)}
					{@const row = koMatches.find((m) => m.id === a.matchId)}
					<li>
						<span class="muted">{a.matchId.replace('R16-', 'Achtelfinale ')}:</span>
						{#if a.player_a || a.player_b}
							{nameOf(names, a.player_a ?? row?.player_a, '…')} – {nameOf(names, a.player_b ?? row?.player_b, '…')}
						{/if}
						{#if a.scorer_id}<span class="muted">· Zähler {nameOf(names, a.scorer_id)}</span>{/if}
					</li>
				{/each}
			</ul>
			<button class="btn primary" onclick={fillR16} disabled={ui.busy}>
				Achtelfinale eintragen
			</button>
		{:else}
			<p class="muted">Gerade gibt es nichts einzutragen.</p>
		{/if}

		{#each standings.filter((s) => s.blocked || overridden.has(s.group.id)) as s (s.group.id)}
			<div class="tie">
				<h3>Gruppe {s.group.id}: {s.blocked ? 'Gleichstand um den Aufstieg' : 'Reihenfolge manuell festgelegt'}</h3>
				{#if s.blocked}
					<p class="muted">
						Nach allen Kriterien gleichauf. Entscheidet vor Ort (z. B. per Ausbullen) und legt hier die Reihenfolge fest.
					</p>
					<ol>
						{#each tiedOrder(s) as pid, i (pid)}
							<li>
								<span>{nameOf(names, pid)}</span>
								<button class="btn small" onclick={() => move(s, i, -1)} disabled={i === 0} aria-label="nach oben">▲</button>
								<button class="btn small" onclick={() => move(s, i, 1)} disabled={i === tiedOrder(s).length - 1} aria-label="nach unten">▼</button>
							</li>
						{/each}
					</ol>
					<button class="btn primary" onclick={() => saveOrder(s)} disabled={ui.busy}>Reihenfolge übernehmen</button>
				{:else}
					<button class="btn small" onclick={() => clearOrder(s.group.id)} disabled={ui.busy || koStarted}>
						Manuelle Entscheidung entfernen
					</button>
				{/if}
			</div>
		{/each}
	</section>
{/if}

{#if store.demo && groupMatches.length}
	<section class="panel step demo">
		<h2>Demo: Spiele simulieren</h2>
		<p class="muted">Spielt offene Spiele mit zufälligen, realistischen Würfen durch. Nur im Demo-Modus verfügbar.</p>
		<div class="row">
			<button class="btn" onclick={() => simulate('group')} disabled={ui.busy}>Offene Gruppenspiele simulieren</button>
			<button class="btn" onclick={() => simulate('ko')} disabled={ui.busy}>Bereite KO-Spiele simulieren</button>
		</div>
	</section>
{/if}

<style>
	.step + .step {
		margin-top: 1rem;
	}
	.warn {
		color: var(--gold);
	}
	.assign {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: grid;
		gap: 0.25rem;
	}
	.tie {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}
	.tie ol {
		padding-left: 1.5rem;
	}
	.tie li {
		margin: 0.3rem 0;
	}
	.tie li span {
		display: inline-block;
		min-width: 12rem;
	}
	.row {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.demo {
		border-style: dashed;
	}
</style>
