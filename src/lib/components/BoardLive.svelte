<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { currentMatchForBoard, koPlaceholders, matchState, nameOf, roundLabel, upcomingForBoard, formatAverage } from '$lib/logic/derive';
	import { checkoutLabels } from '$lib/engine/checkout';
	import { formatDart } from '$lib/engine/dart';
	import { threeDartAverage } from '$lib/engine/match';

	interface Props {
		board: number;
		/** Große Darstellung für den Fernseher */
		large?: boolean;
	}
	let { board, large = false }: Props = $props();

	const match = $derived(currentMatchForBoard(store.data.matches, board));
	const next = $derived(upcomingForBoard(store.data.matches, board, 1)[0] ?? null);
	const state = $derived(match ? matchState(match, store.data.dartsByMatch[match.id]) : null);
	const players = $derived(store.view.players);
	const placeholders = $derived(koPlaceholders(store.view.groups.map((g) => g.id)));
	const live = $derived(match?.status === 'live' && match.first_thrower_set);

	function lastVisitText(slot: 0 | 1): string {
		if (!state) return '';
		const v = [...state.visits].reverse().find((x) => x.player === slot && x.leg === state!.currentLeg);
		if (!v) return '';
		return v.bust ? 'Bust' : String(v.points);
	}
</script>

<article class="board" class:large class:live>
	<header>
		<span class="label">Scheibe {board}</span>
		{#if match}
			<span class="round">{roundLabel(match)}</span>
			{#if live}
				<span class="status"><span class="live-dot"></span> Live</span>
			{:else}
				<span class="status muted">Gleich geht's los</span>
			{/if}
		{/if}
	</header>

	{#if match && state}
		<div class="players">
			{#each [0, 1] as const as slot (slot)}
				{@const pid = slot === 0 ? match.player_a : match.player_b}
				{@const active = live && !state.finished && state.currentPlayer === slot}
				{@const rest = state.remaining[slot]}
				{@const co = active && rest <= 170 ? checkoutLabels(rest, 3 - state.currentVisit.length) : null}
				<div class="player" class:active>
					<div class="name-row">
						<a class="name" href="/spieler/{pid}">{nameOf(players, pid)}</a>
						<span class="legs num" aria-label="Legs">{state.legsWon[slot]}</span>
					</div>
					<div class="rest num">{live ? rest : '501'}</div>
					<div class="meta">
						<span class="num">Ø {formatAverage(threeDartAverage(state.stats[slot]))}</span>
						{#if active && state.currentVisit.length}
							<span class="visit num">
								{#each state.currentVisit as d, i (i)}<span>{formatDart(d)}</span>{/each}
							</span>
						{:else if lastVisitText(slot)}
							<span class="muted">zuletzt {lastVisitText(slot)}</span>
						{/if}
					</div>
					{#if co}
						<div class="checkout num">{co.join(' · ')}</div>
					{/if}
				</div>
			{/each}
		</div>
		<footer class="muted">
			First to {match.legs_to_win} · Leg {state.currentLeg + 1}
		</footer>
	{:else}
		<div class="idle">
			{#if next}
				<p class="muted">Als Nächstes</p>
				<p class="next">
					{nameOf(players, next.player_a, placeholders[next.id]?.[0] ?? 'offen')} <span class="muted">gegen</span>
					{nameOf(players, next.player_b, placeholders[next.id]?.[1] ?? 'offen')}
				</p>
			{:else}
				<p class="muted">Keine Spiele mehr auf dieser Scheibe</p>
			{/if}
		</div>
	{/if}
</article>

<style>
	.board {
		display: flex;
		flex-direction: column;
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		overflow: hidden;
		min-height: 15rem;
	}
	.board.live {
		border-color: var(--line-strong);
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 1rem;
		background: var(--navy-800);
		font-size: 0.9rem;
	}
	.label {
		font-weight: 700;
	}
	.round {
		color: var(--text-2);
	}
	.status {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.4em;
		font-weight: 600;
	}
	.players {
		display: grid;
		grid-template-columns: 1fr 1fr;
		flex: 1;
	}
	.player {
		padding: 0.9rem 1rem 0.8rem;
		border-left: 4px solid transparent;
		min-width: 0;
	}
	.player + .player {
		border-left-color: transparent;
		box-shadow: inset 1px 0 0 var(--line);
	}
	.player.active {
		background: linear-gradient(180deg, rgba(59, 130, 240, 0.16), transparent 75%);
		border-left-color: var(--blue);
	}
	.player + .player.active {
		box-shadow: none;
	}
	.name-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.name {
		color: var(--text);
		text-decoration: none;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}
	.name:hover {
		text-decoration: underline;
	}
	.legs {
		font-size: 1.6rem;
		font-weight: 700;
		line-height: 1;
		min-width: 1.6rem;
		text-align: center;
		padding: 0.1rem 0.35rem;
		border-radius: var(--r-sm);
		background: var(--navy-950);
	}
	.rest {
		font-size: 4.2rem;
		font-weight: 700;
		line-height: 1;
		margin: 0.35rem 0 0.25rem;
		letter-spacing: -0.01em;
	}
	.player:not(.active) .rest {
		color: var(--text-2);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		font-size: 0.95rem;
		color: var(--text-2);
	}
	.visit {
		display: inline-flex;
		gap: 0.35rem;
		font-weight: 600;
		color: var(--text);
	}
	.checkout {
		margin-top: 0.45rem;
		display: inline-block;
		padding: 0.15rem 0.55rem;
		border-radius: var(--r-sm);
		background: rgba(34, 168, 101, 0.18);
		color: #6fe3a8;
		font-weight: 600;
		font-size: 1.05rem;
	}
	footer {
		padding: 0.45rem 1rem;
		font-size: 0.85rem;
		border-top: 1px solid var(--line);
	}
	.idle {
		flex: 1;
		display: grid;
		place-content: center;
		text-align: center;
		padding: 1rem;
	}
	.idle p {
		margin: 0.15rem 0;
	}
	.next {
		font-size: 1.15rem;
		font-weight: 600;
	}

	.large .rest {
		font-size: 6.5rem;
	}
	.large .name {
		font-size: 1.5rem;
	}
	.large .legs {
		font-size: 2.2rem;
	}
	.large .meta {
		font-size: 1.15rem;
	}
	.large header {
		font-size: 1.1rem;
	}
	.large .checkout {
		font-size: 1.35rem;
	}

	@media (max-width: 480px) {
		.rest {
			font-size: 3.2rem;
		}
		.player {
			padding: 0.75rem 0.7rem;
		}
	}
</style>
