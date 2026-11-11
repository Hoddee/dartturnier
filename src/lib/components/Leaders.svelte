<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { formatAverage, nameOf, type LeaderEntry } from '$lib/logic/derive';

	interface Props {
		limit?: number;
	}
	let { limit = 5 }: Props = $props();

	const L = $derived(store.view.leaders);
	const players = $derived(store.view.players);

	const lists = $derived([
		{ title: 'Höchste Aufnahme', items: L.highestVisit, fmt: (v: number) => String(v) },
		{ title: 'Höchstes Finish', items: L.highestFinish, fmt: (v: number) => String(v) },
		{ title: 'Bester Average', items: L.bestAverage, fmt: formatAverage },
		{ title: 'Meiste 180er', items: L.most180, fmt: (v: number) => String(v) },
		{ title: 'Kürzestes Leg', items: L.bestLeg, fmt: (v: number) => `${v} Darts` }
	] satisfies { title: string; items: LeaderEntry[]; fmt: (v: number) => string }[]);
</script>

<div class="leaders">
	{#each lists as list (list.title)}
		<section>
			<h3>{list.title}</h3>
			{#if list.items.length === 0}
				<p class="muted">Noch keine Werte</p>
			{:else}
				<ol>
					{#each list.items.slice(0, limit) as e, i (e.playerId)}
						<li class:first={i === 0}>
							<a href="/spieler/{e.playerId}">{nameOf(players, e.playerId)}</a>
							<span class="num">{list.fmt(e.value)}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/each}
</div>

<style>
	.leaders {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1rem;
	}
	section {
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		padding: 1rem;
	}
	h3 {
		color: var(--text-2);
		font-size: 0.95rem;
		font-weight: 600;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--line);
	}
	li:last-child {
		border-bottom: none;
	}
	li a {
		color: var(--text);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	li .num {
		font-size: 1.2rem;
		font-weight: 600;
	}
	li.first a {
		font-weight: 700;
	}
	li.first .num {
		font-size: 2rem;
		font-weight: 700;
		color: var(--gold);
		line-height: 1.1;
	}
	p {
		margin: 0;
	}
</style>
