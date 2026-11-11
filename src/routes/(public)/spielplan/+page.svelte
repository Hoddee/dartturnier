<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { formatTime, koPlaceholders, nameOf, plannedStart, queueForBoard, roundLabel } from '$lib/logic/derive';
	import { BOARD_COUNT } from '$lib/logic/plans';
	import type { MatchRow } from '$lib/db-types';

	const players = $derived(store.view.players);
	const boards = Array.from({ length: BOARD_COUNT }, (_, i) => i + 1);
	const placeholders = $derived(koPlaceholders(store.view.groups.map((g) => g.id)));
	const dateLabel = $derived.by(() => {
		const d = store.data.settings.event_date;
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? '');
		return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : '';
	});

	function statusText(m: MatchRow) {
		if (m.status === 'finished') return `${m.legs_a}:${m.legs_b}`;
		if (m.status === 'live') return `${m.legs_a}:${m.legs_b}`;
		return '';
	}
</script>

<h2>Spielplan nach Scheiben</h2>
<p class="muted intro">
	{#if dateLabel}{dateLabel}, Beginn {store.data.settings.start_time} Uhr. {/if}Jede Scheibe spielt ihre Liste von oben nach unten
	ab. Die Uhrzeiten sind ein Richtwert: Gespielt wird, sobald die Scheibe frei ist.
</p>

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
							<span class="r muted">
								<span class="num time">{formatTime(plannedStart(m, store.data.settings, store.data.matches))}</span>
								{roundLabel(m)}
							</span>
							<span class="players">
								<span class:w={m.winner_id && m.winner_id === m.player_a}>{nameOf(players, m.player_a, placeholders[m.id]?.[0] ?? 'offen')}</span>
								<span class="muted">–</span>
								<span class:w={m.winner_id && m.winner_id === m.player_b}>{nameOf(players, m.player_b, placeholders[m.id]?.[1] ?? 'offen')}</span>
							</span>
							<span class="sc muted">Zähler: {m.scorer_id ? nameOf(players, m.scorer_id) : 'offen'}</span>
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
	.time {
		color: var(--text);
		font-size: 0.95rem;
		margin-right: 0.35rem;
	}
	.sc {
		grid-column: 1 / -1;
		font-size: 0.78rem;
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
