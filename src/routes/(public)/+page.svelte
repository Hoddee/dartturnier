<script lang="ts">
	import BoardLive from '$lib/components/BoardLive.svelte';
	import { store } from '$lib/data/store.svelte';
	import { nameOf, roundLabel } from '$lib/logic/derive';
	import { BOARD_COUNT } from '$lib/logic/plans';

	const players = $derived(store.view.players);
	const recent = $derived(
		store.data.matches
			.filter((m) => m.status === 'finished')
			.sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))
			.slice(0, 8)
	);
	const total = $derived(store.data.matches.length);
	const done = $derived(store.data.matches.filter((m) => m.status === 'finished').length);
	const champion = $derived(store.data.matches.find((m) => m.id === 'F-1' && m.status === 'finished'));
</script>

{#if total === 0}
	<section class="panel empty">
		<h2>Das Turnier hat noch nicht begonnen</h2>
		<p class="muted">Sobald die Turnierleitung Gruppen und Spielplan angelegt hat, laufen hier die Spielstände live.</p>
	</section>
{:else}
	{#if champion}
		<section class="champion">
			<p class="muted">Turniersieger</p>
			<p class="who">{nameOf(players, champion.winner_id)}</p>
			<p class="num muted">Finale {champion.legs_a}:{champion.legs_b}</p>
		</section>
	{/if}

	<div class="boards">
		{#each Array.from({ length: BOARD_COUNT }, (_, i) => i + 1) as b (b)}
			<BoardLive board={b} />
		{/each}
	</div>

	<div class="below">
		<section>
			<h2>Letzte Ergebnisse</h2>
			{#if recent.length === 0}
				<p class="muted">Noch keine Spiele beendet.</p>
			{:else}
				<ul class="results">
					{#each recent as m (m.id)}
						<li>
							<span class="r muted">{roundLabel(m)}</span>
							<span class="p" class:w={m.winner_id === m.player_a}>{nameOf(players, m.player_a)}</span>
							<span class="score num">{m.legs_a}:{m.legs_b}</span>
							<span class="p" class:w={m.winner_id === m.player_b}>{nameOf(players, m.player_b)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
		<section class="progress">
			<h2>Fortschritt</h2>
			<p class="num big">{done}<span class="muted"> / {total}</span></p>
			<p class="muted">Spiele beendet</p>
			<div class="bar"><span style="width: {total ? (done / total) * 100 : 0}%"></span></div>
		</section>
	</div>
{/if}

<style>
	.boards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}
	@media (max-width: 820px) {
		.boards {
			grid-template-columns: 1fr;
		}
	}
	.below {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1.5rem;
		margin-top: 2rem;
	}
	@media (max-width: 820px) {
		.below {
			grid-template-columns: 1fr;
		}
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.results li {
		display: grid;
		grid-template-columns: 9.5rem 1fr auto 1fr;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--line);
	}
	.results .r {
		font-size: 0.85rem;
	}
	.results .p:last-child {
		text-align: left;
	}
	.results .p:nth-child(2) {
		text-align: right;
	}
	.results .w {
		font-weight: 700;
	}
	.score {
		font-size: 1.25rem;
		font-weight: 700;
	}
	@media (max-width: 560px) {
		.results li {
			grid-template-columns: 1fr auto 1fr;
		}
		.results .r {
			grid-column: 1 / -1;
		}
	}
	.big {
		font-size: 3.5rem;
		font-weight: 700;
		line-height: 1;
		margin: 0;
	}
	.big .muted {
		font-size: 2rem;
	}
	.progress p {
		margin: 0.2rem 0;
	}
	.bar {
		height: 0.5rem;
		background: var(--navy-800);
		border-radius: 99px;
		margin-top: 0.75rem;
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--blue);
	}
	.empty {
		text-align: center;
		padding: 3rem 1.5rem;
	}
	.champion {
		text-align: center;
		margin-bottom: 1.5rem;
		padding: 1.5rem;
		border-radius: var(--r-lg);
		background: radial-gradient(600px 200px at 50% 0%, rgba(242, 193, 78, 0.22), transparent 70%), var(--navy-850);
		border: 1px solid rgba(242, 193, 78, 0.4);
	}
	.champion p {
		margin: 0;
	}
	.who {
		font-size: 2.6rem;
		font-weight: 700;
		color: var(--gold);
		line-height: 1.2;
	}
</style>
