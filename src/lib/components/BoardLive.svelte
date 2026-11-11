<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { currentMatchForBoard, koPlaceholders, matchState, nameOf, roundLabel, upcomingForBoard, formatAverage } from '$lib/logic/derive';
	import { checkoutLabels } from '$lib/engine/checkout';
	import { formatDart } from '$lib/engine/dart';
	import { threeDartAverage } from '$lib/engine/match';
	import { onDestroy } from 'svelte';
	import Avatar from './Avatar.svelte';

	interface Props {
		board: number;
		/** Große Darstellung für den Fernseher */
		large?: boolean;
		/** So lange bleibt ein gerade beendetes Spiel mit Ergebnis stehen (Sekunden) */
		holdSeconds?: number;
	}
	let { board, large = false, holdSeconds = 20 }: Props = $props();

	const current = $derived(currentMatchForBoard(store.data.matches, board));

	// Gerade beendetes Spiel eine Weile stehen lassen, damit alle das Ergebnis sehen
	const prevStatus = new Map<string, string>();
	let heldId = $state<string | null>(null);
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		for (const m of store.data.matches) {
			if (m.board !== board) continue;
			const before = prevStatus.get(m.id);
			if (before === 'live' && m.status === 'finished') {
				heldId = m.id;
				clearTimeout(holdTimer);
				holdTimer = setTimeout(() => (heldId = null), holdSeconds * 1000);
			}
			if (heldId === m.id && m.status !== 'finished') heldId = null; // Undo am iPad
			prevStatus.set(m.id, m.status);
		}
	});
	onDestroy(() => {
		clearTimeout(holdTimer);
		clearTimeout(legTimer);
	});

	const held = $derived(heldId ? (store.data.matches.find((m) => m.id === heldId) ?? null) : null);
	const match = $derived(held ?? current);
	const finishedHold = $derived(!!held && held.status === 'finished');
	const next = $derived(upcomingForBoard(store.data.matches, board, 1)[0] ?? null);
	const state = $derived(match ? matchState(match, store.data.dartsByMatch[match.id]) : null);
	const players = $derived(store.view.players);
	const placeholders = $derived(koPlaceholders(store.view.groups.map((g) => g.id)));
	const live = $derived(match?.status === 'live' && match.first_thrower_set);

	// Leg gewonnen: Spielerfeld kurz aufleuchten lassen
	let legFlash = $state<0 | 1 | null>(null);
	let legTimer: ReturnType<typeof setTimeout> | undefined;
	let lastLegs: { id: string; legs: [number, number] } | null = null;
	$effect(() => {
		if (!match || !state) return;
		const legs: [number, number] = [state.legsWon[0], state.legsWon[1]];
		if (lastLegs && lastLegs.id === match.id) {
			const slot = legs[0] > lastLegs.legs[0] ? 0 : legs[1] > lastLegs.legs[1] ? 1 : null;
			if (slot !== null && !state.finished) {
				legFlash = slot;
				clearTimeout(legTimer);
				legTimer = setTimeout(() => (legFlash = null), 2600);
			}
		}
		lastLegs = { id: match.id, legs };
	});

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
			{#if finishedHold}
				<span class="status done">Beendet</span>
			{:else if live}
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
				{@const won = finishedHold && match.winner_id === pid}
				<div class="player" class:active class:legwon={legFlash === slot} class:won class:lost={finishedHold && !won}>
					<div class="name-row">
						<Avatar playerId={pid} size={large ? 3 : 2.2} />
						<a class="name" href="/spieler/{pid}">{nameOf(players, pid)}</a>
						<span class="legs num" aria-label="Legs">{state.legsWon[slot]}</span>
					</div>
					{#if finishedHold}
						<div class="rest num result">{won ? 'Sieg' : ''}</div>
					{:else}
						<div class="rest num">{live ? rest : '501'}</div>
					{/if}
					{#if legFlash === slot}<div class="legbadge num">Leg gewonnen</div>{/if}
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
			<span>First to {match.legs_to_win}{#if !finishedHold} · Leg {state.currentLeg + 1}{/if}</span>
			<span class="scorer">Zähler: {match.scorer_id ? nameOf(players, match.scorer_id) : 'offen'}</span>
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
		align-items: center;
		gap: 0.5rem;
	}
	.player {
		position: relative;
	}
	.player.legwon {
		animation: legglow 2.6s ease-out;
	}
	.player.legwon .legs {
		animation: legpop 0.7s cubic-bezier(0.2, 1.6, 0.4, 1);
		background: var(--gold);
		color: var(--navy-950);
	}
	.legbadge {
		position: absolute;
		right: 0.8rem;
		bottom: 0.7rem;
		padding: 0.15rem 0.6rem;
		border-radius: var(--r-sm);
		background: var(--gold);
		color: var(--navy-950);
		font-weight: 700;
		animation: legpop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1);
	}
	@keyframes legglow {
		0% {
			box-shadow: inset 0 0 0 3px var(--gold), inset 0 0 60px rgba(242, 193, 78, 0.5);
		}
		100% {
			box-shadow: inset 0 0 0 0 transparent;
		}
	}
	@keyframes legpop {
		0% {
			transform: scale(0.3);
		}
		60% {
			transform: scale(1.35);
		}
		100% {
			transform: scale(1);
		}
	}
	.player.won {
		background: linear-gradient(180deg, rgba(242, 193, 78, 0.22), transparent 80%);
	}
	.player.won .name,
	.player.won .result {
		color: var(--gold);
	}
	.player.lost {
		opacity: 0.55;
	}
	.result {
		min-height: 1em;
	}
	.status.done {
		color: var(--gold);
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
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
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
