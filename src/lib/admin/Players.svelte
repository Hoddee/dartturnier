<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { ui } from './ui.svelte';

	const TARGET = 32;
	let input = $state('');

	const players = $derived(store.data.players);
	const planned = $derived(new Set(store.data.matches.flatMap((m) => [m.player_a, m.player_b])));
	const newNames = $derived(
		input
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	const duplicates = $derived.by(() => {
		const all = [...players.map((p) => p.name.toLowerCase()), ...newNames.map((n) => n.toLowerCase())];
		return [...new Set(all.filter((n, i) => all.indexOf(n) !== i))];
	});

	async function add() {
		const ok = await ui.run(() => store.backend.addPlayers(newNames), `${newNames.length} Spieler hinzugefügt`);
		if (ok) input = '';
	}

	function rename(id: string, old: string, e: Event) {
		const name = (e.target as HTMLInputElement).value.trim();
		if (!name || name === old) {
			(e.target as HTMLInputElement).value = old;
			return;
		}
		void ui.run(() => store.backend.renamePlayer(id, name), 'Name gespeichert');
	}

	function remove(id: string, name: string) {
		if (!confirm(`${name} löschen?`)) return;
		void ui.run(() => store.backend.deletePlayer(id), `${name} gelöscht`);
	}

	const SAMPLE = [
		'Anna Weber', 'Ben Krüger', 'Chris Maier', 'Dana Fischer', 'Elias Wolf', 'Finn Schäfer', 'Greta Koch', 'Hannes Bauer',
		'Ida Richter', 'Jonas Klein', 'Kai Neumann', 'Lena Schwarz', 'Max Zimmermann', 'Nora Braun', 'Ole Hofmann', 'Paul Hartmann',
		'Quirin Lange', 'Rosa Schmitt', 'Sven Werner', 'Tom Krause', 'Uli Meier', 'Vera Lehmann', 'Willi Schmid', 'Xaver Huber',
		'Yvonne Kaiser', 'Zoe Fuchs', 'Arne Peters', 'Bea Lang', 'Carl Scholz', 'Doris Jung', 'Emil Hahn', 'Frieda Vogel'
	];
</script>

<section class="panel">
	<h2>Spieler eintragen</h2>
	<p class="muted">Ein Name pro Zeile. Die Reihenfolge zählt, wenn du die Gruppen „der Reihe nach“ einteilst.</p>
	<textarea rows="8" bind:value={input} placeholder={'Anna Weber\nBen Krüger\n…'}></textarea>
	{#if duplicates.length}
		<p class="warn">Doppelte Namen: {duplicates.join(', ')}. Bitte unterscheidbar machen (z. B. mit Nachnamen).</p>
	{/if}
	<div class="row">
		<button class="btn primary" onclick={add} disabled={ui.busy || newNames.length === 0}>
			{newNames.length ? `${newNames.length} Spieler hinzufügen` : 'Spieler hinzufügen'}
		</button>
		{#if store.demo && players.length === 0}
			<button class="btn" onclick={() => (input = SAMPLE.join('\n'))}>32 Beispielnamen einfügen</button>
		{/if}
	</div>
</section>

<section class="panel">
	<div class="head">
		<h2>Angemeldet</h2>
		<span class="count num" class:full={players.length === TARGET}>{players.length} / {TARGET}</span>
	</div>
	{#if players.length === 0}
		<p class="muted">Noch keine Spieler eingetragen.</p>
	{:else}
		<ol class="list">
			{#each players as p (p.id)}
				<li>
					<input type="text" value={p.name} aria-label="Name" onchange={(e) => rename(p.id, p.name, e)} />
					<button
						class="btn small danger"
						onclick={() => remove(p.id, p.name)}
						disabled={ui.busy || planned.has(p.id)}
						title={planned.has(p.id) ? 'Bereits im Spielplan' : 'Löschen'}>Löschen</button
					>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	section + section {
		margin-top: 1rem;
	}
	.row {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.75rem;
		flex-wrap: wrap;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.count {
		font-size: 1.8rem;
		font-weight: 700;
		color: var(--muted);
	}
	.count.full {
		color: #6fe3a8;
	}
	.list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: 0.5rem 1.5rem;
		padding-left: 1.75rem;
		margin: 0;
	}
	.list li {
		padding-left: 0.25rem;
	}
	.list li::marker {
		color: var(--muted);
		font-family: var(--font-num);
	}
	.list li {
		display: list-item;
	}
	.list li > * {
		vertical-align: middle;
	}
	.list input {
		width: calc(100% - 5.5rem);
		margin-right: 0.4rem;
		padding: 0.4em 0.6em;
	}
	.warn {
		color: var(--gold);
		margin: 0.5rem 0 0;
	}
</style>
