<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { nameOf, queueForBoard, roundLabel } from '$lib/logic/derive';
	import { BOARD_COUNT } from '$lib/logic/plans';
	import type { MatchRow } from '$lib/db-types';

	const players = $derived(store.view.players);
	const boards = Array.from({ length: BOARD_COUNT }, (_, i) => i + 1);

	function statusText(m: MatchRow) {
		if (m.status === 'finished') return `${m.legs_a}:${m.legs_b}`;
		if (m.status === 'live') return `${m.legs_a}:${m.legs_b}`;
		return '';
	}
</script>

<h2>Spielplan nach Scheiben</h2>
<p class="muted intro">Jede Scheibe spielt ihre Liste von oben nach unten ab.</p>

{#if store.data.matches.length === 0}
	<p class="muted">Der Spielplan ist noch nicht erstellt.</p>
{:else}
	<div class="grid">
		{#each boards as b (b)}
			<section class="col">
				<h3>Scheibe {b}</h3>
				<ol>
					{#each queueForBoard(store.data.matches, b) as m (m.id)}
						<li class={m.status}>
							<span class="r muted">{roundLabel(m)}</span>
							<span class="players">
								<span class:w={m.winner_id && m.winner_id === m.player_a}>{nameOf(players, m.player_a, 'offen')}</span>
								<span class="muted">–</span>
								<span class:w={m.winner_id && m.winner_id === m.player_b}>{nameOf(players, m.player_b, 'offen')}</span>
							</span>
							<span class="s num">
								{#if m.status === 'live'}<span class="live-dot"></span>{/if}
								{statusText(m)}
							</span>
						</li>
					{/each}
				</ol>
			</section>
		{/each}
	</div>
{/if}

<style>
	.intro {
		margin-top: -0.25rem;
		margin-bottom: 1.25rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16.5rem, 1fr));
		gap: 1rem;
		align-items: start;
	}
	.col {
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		padding: 1rem;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 0.5rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	li:last-child {
		border-bottom: none;
	}
	.r {
		grid-column: 1 / -1;
		font-size: 0.8rem;
	}
	.players {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.w {
		font-weight: 700;
	}
	.s {
		font-size: 1.15rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	li.finished .players {
		color: var(--text-2);
	}
	li.live {
		background: linear-gradient(90deg, rgba(236, 35, 48, 0.12), transparent);
		margin: 0 -0.5rem;
		padding-left: 0.5rem;
		padding-right: 0.5rem;
		border-radius: var(--r-sm);
	}
</style>
