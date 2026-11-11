<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { drawGroups, splitIntoGroups } from '$lib/tournament/groups';
	import { nameOf } from '$lib/logic/derive';
	import { groupMatchRows, koMatchRows } from '$lib/logic/plans';
	import { ui } from './ui.svelte';

	const GROUP_SIZE = 4;

	const players = $derived(store.data.players);
	const groups = $derived(store.view.groups);
	const names = $derived(store.view.players);
	const started = $derived(store.data.matches.some((m) => m.stage === 'group' && m.status !== 'scheduled'));
	const hasSchedule = $derived(store.data.matches.some((m) => m.stage === 'group'));
	const ungrouped = $derived(players.filter((p) => !groups.some((g) => g.playerIds.includes(p.id))));
	const valid = $derived(players.length > 0 && players.length % GROUP_SIZE === 0);

	let selected = $state<string | null>(null);

	function confirmReplace(): boolean {
		if (!groups.length) return true;
		return confirm(
			hasSchedule
				? 'Gruppen neu einteilen? Der Spielplan muss danach neu erstellt werden.'
				: 'Die bisherige Einteilung wird ersetzt. Fortfahren?'
		);
	}

	async function assign(mode: 'order' | 'draw') {
		if (!confirmReplace()) return;
		const ids = players.map((p) => p.id);
		const next = mode === 'order' ? splitIntoGroups(ids, GROUP_SIZE) : drawGroups(ids, GROUP_SIZE);
		await ui.run(async () => {
			if (hasSchedule) {
				await store.backend.replaceMatches('ko', []);
				await store.backend.replaceMatches('group', []);
			}
			await store.backend.saveGroups(next);
		}, mode === 'order' ? 'Gruppen der Reihe nach eingeteilt' : 'Gruppen ausgelost');
	}

	/** Zwei Spieler antippen tauscht ihre Plätze. */
	async function pick(id: string) {
		if (started) return;
		if (!selected) {
			selected = id;
			return;
		}
		if (selected === id) {
			selected = null;
			return;
		}
		const a = selected;
		selected = null;
		const next = groups.map((g) => ({
			id: g.id,
			playerIds: g.playerIds.map((p) => (p === a ? id : p === id ? a : p))
		}));
		await ui.run(async () => {
			await store.backend.saveGroups(next);
			// Spielplan steht schon, aber hat noch nicht begonnen: mit neuer Einteilung neu erzeugen
			if (hasSchedule) {
				const settings = store.data.settings;
				await store.backend.replaceMatches('ko', []);
				await store.backend.replaceMatches('group', groupMatchRows(next, settings));
				if (next.length === 8) await store.backend.replaceMatches('ko', koMatchRows(next.map((g) => g.id), settings));
			}
		}, hasSchedule ? 'Spieler getauscht, Spielplan aktualisiert' : 'Spieler getauscht');
	}
</script>

<section class="panel">
	<h2>Gruppen einteilen</h2>
	{#if !valid}
		<p class="warn">
			Für Gruppen à {GROUP_SIZE} muss die Spielerzahl durch {GROUP_SIZE} teilbar sein (aktuell {players.length}). Für den
			KO-Baum werden genau 32 Spieler (8 Gruppen) gebraucht.
		</p>
	{:else if players.length !== 32}
		<p class="warn">Aktuell {players.length} Spieler. Der KO-Baum ist für genau 32 Spieler (8 Gruppen) ausgelegt.</p>
	{/if}
	{#if started}
		<p class="muted">Die Gruppenphase läuft bereits, die Einteilung ist gesperrt.</p>
	{:else}
		<div class="row">
			<button class="btn primary" disabled={!valid || ui.busy} onclick={() => assign('draw')}>Gruppen auslosen</button>
			<button class="btn" disabled={!valid || ui.busy} onclick={() => assign('order')}>Der Reihe nach einteilen</button>
		</div>
		<p class="muted hint">
			Der Reihe nach: die ersten vier Spieler aus der Liste bilden Gruppe A usw.
			{#if groups.length}Zum Tauschen zwei Spieler nacheinander antippen.{/if}
			{#if hasSchedule}Der Spielplan wird dabei automatisch angepasst.{/if}
		</p>
	{/if}
</section>

{#if groups.length}
	<div class="grid">
		{#each groups as g (g.id)}
			<section class="group">
				<h3>Gruppe {g.id} <span class="muted">Scheibe {((g.id.charCodeAt(0) - 65) % 4) + 1}</span></h3>
				<ul>
					{#each g.playerIds as pid (pid)}
						<li>
							<button class="pl" class:sel={selected === pid} disabled={started || ui.busy} onclick={() => pick(pid)}>
								{nameOf(names, pid)}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
	{#if ungrouped.length}
		<p class="warn">Noch ohne Gruppe: {ungrouped.map((p) => p.name).join(', ')}. Bitte neu einteilen.</p>
	{/if}
{/if}

<style>
	.row {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.hint {
		font-size: 0.9rem;
		margin-bottom: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.group {
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		padding: 0.8rem;
	}
	h3 {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	h3 .muted {
		font-size: 0.8rem;
		font-weight: 500;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.pl {
		width: 100%;
		text-align: left;
		padding: 0.4rem 0.6rem;
		border-radius: var(--r-sm);
		border: 1px solid transparent;
		background: var(--navy-800);
		color: var(--text);
		cursor: pointer;
	}
	.pl:disabled {
		cursor: default;
	}
	.pl.sel {
		border-color: var(--gold);
		background: rgba(242, 193, 78, 0.15);
	}
	.warn {
		color: var(--gold);
	}
</style>
