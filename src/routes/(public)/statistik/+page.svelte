<script lang="ts">
	import Leaders from '$lib/components/Leaders.svelte';
	import { store } from '$lib/data/store.svelte';
	import { formatAverage } from '$lib/logic/derive';

	type SortKey = 'name' | 'average' | 'highestVisit' | 'highestFinish' | 'count180' | 'count140Plus' | 'bestLeg' | 'won';
	let sort = $state<SortKey>('average');

	const rows = $derived.by(() => {
		const totals = store.view.totals;
		const list = store.data.players.map((p) => {
			const t = totals[p.id];
			return {
				id: p.id,
				name: p.name,
				average: t?.average ?? 0,
				highestVisit: t?.stats.highestVisit ?? 0,
				highestFinish: t?.stats.highestFinish ?? 0,
				count180: t?.stats.count180 ?? 0,
				count140Plus: t?.stats.count140Plus ?? 0,
				bestLeg: t?.stats.bestLegDarts ?? null,
				won: t?.matchesWon ?? 0,
				played: t?.matchesPlayed ?? 0
			};
		});
		return list.sort((a, b) => {
			if (sort === 'name') return a.name.localeCompare(b.name, 'de');
			if (sort === 'bestLeg') return (a.bestLeg ?? 999) - (b.bestLeg ?? 999);
			return (b[sort] as number) - (a[sort] as number);
		});
	});

	const cols: { key: SortKey; label: string; title: string }[] = [
		{ key: 'average', label: 'Ø', title: '3-Dart-Average' },
		{ key: 'won', label: 'Siege', title: 'Gewonnene Spiele' },
		{ key: 'highestVisit', label: 'Max', title: 'Höchste Aufnahme' },
		{ key: 'highestFinish', label: 'Finish', title: 'Höchstes Finish' },
		{ key: 'count180', label: '180', title: '180er' },
		{ key: 'count140Plus', label: '140+', title: 'Aufnahmen ab 140' },
		{ key: 'bestLeg', label: 'Bestes Leg', title: 'Wenigste Darts in einem gewonnenen Leg' }
	];
</script>

<h2>Turnier-Bestwerte</h2>
<Leaders />

<h2 class="all">Alle Spieler</h2>
<div class="scroll">
	<table class="data">
		<thead>
			<tr>
				<th><button class="sort" onclick={() => (sort = 'name')} aria-pressed={sort === 'name'}>Spieler</button></th>
				{#each cols as c (c.key)}
					<th class="n" title={c.title}>
						<button class="sort" onclick={() => (sort = c.key)} aria-pressed={sort === c.key}>{c.label}</button>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				<tr>
					<td><a href="/spieler/{r.id}">{r.name}</a></td>
					<td class="n">{r.average ? formatAverage(r.average) : '–'}</td>
					<td class="n">{r.won}/{r.played}</td>
					<td class="n">{r.highestVisit || '–'}</td>
					<td class="n">{r.highestFinish || '–'}</td>
					<td class="n">{r.count180}</td>
					<td class="n">{r.count140Plus}</td>
					<td class="n">{r.bestLeg ?? '–'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.all {
		margin-top: 2rem;
	}
	.scroll {
		overflow-x: auto;
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		padding: 0.5rem 1rem;
	}
	td a {
		color: var(--text);
		text-decoration: none;
	}
	td a:hover {
		text-decoration: underline;
	}
	.sort {
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.sort[aria-pressed='true'] {
		color: var(--text);
		text-decoration: underline;
		text-underline-offset: 4px;
	}
</style>
