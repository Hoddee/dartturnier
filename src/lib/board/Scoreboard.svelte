<script lang="ts">
	import { checkoutLabels } from '$lib/engine/checkout';
	import { formatDart } from '$lib/engine/dart';
	import { threeDartAverage } from '$lib/engine/match';
	import type { MatchState, PlayerSlot } from '$lib/engine/types';
	import { formatAverage } from '$lib/logic/derive';
	import Avatar from '$lib/components/Avatar.svelte';

	interface Props {
		state: MatchState;
		names: [string, string];
		ids?: [string | null, string | null];
	}
	let { state, names, ids = [null, null] }: Props = $props();

	function lastVisit(slot: PlayerSlot) {
		return [...state.visits].reverse().find((v) => v.player === slot && v.leg === state.currentLeg) ?? null;
	}
</script>

<div class="score">
	{#each [0, 1] as const as slot (slot)}
		{@const active = !state.finished && state.currentPlayer === slot}
		{@const rest = state.remaining[slot]}
		{@const co = active ? checkoutLabels(rest, 3 - state.currentVisit.length) : null}
		{@const lv = lastVisit(slot)}
		<section class="p" class:active>
			<div class="top">
				{#if ids[slot]}<Avatar playerId={ids[slot]} size={2.4} />{/if}
				<h2>{names[slot]}</h2>
				<span class="legs num" title="Gewonnene Legs">{state.legsWon[slot]}</span>
			</div>
			<div class="rest num">{rest}</div>
			<div class="visit">
				{#if active}
					{#each [0, 1, 2] as i (i)}
						<span class="slot num" class:filled={state.currentVisit[i]}>
							{state.currentVisit[i] ? formatDart(state.currentVisit[i]) : ''}
						</span>
					{/each}
				{:else if lv}
					<span class="last muted">
						Letzte Aufnahme: <strong class="num" class:bust={lv.bust}>{lv.bust ? 'Bust' : lv.points}</strong>
						<span class="num">({lv.darts.map(formatDart).join(' ')})</span>
					</span>
				{/if}
			</div>
			<div class="foot">
				<span class="num">Ø {formatAverage(threeDartAverage(state.stats[slot]))}</span>
				{#if co}<span class="co num">{co.join(' · ')}</span>{/if}
			</div>
		</section>
	{/each}
</div>

<style>
	.score {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}
	.p {
		background: var(--navy-850);
		border: 2px solid var(--line);
		border-radius: var(--r-lg);
		padding: 0.7rem 1rem;
		opacity: 0.72;
		min-width: 0;
	}
	.p.active {
		opacity: 1;
		border-color: var(--blue);
		background: linear-gradient(180deg, rgba(59, 130, 240, 0.2), var(--navy-850) 70%);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	h2 {
		margin: 0;
		flex: 1;
		font-size: 1.35rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.legs {
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
		padding: 0.15rem 0.6rem;
		border-radius: var(--r-sm);
		background: var(--navy-950);
	}
	.rest {
		font-size: clamp(4rem, 11vh, 7.5rem);
		font-weight: 800;
		line-height: 1;
		margin: 0.2rem 0;
	}
	.visit {
		display: flex;
		gap: 0.4rem;
		min-height: 2.6rem;
		align-items: center;
	}
	.slot {
		flex: 1;
		max-width: 5.5rem;
		height: 2.5rem;
		display: grid;
		place-items: center;
		border-radius: var(--r-sm);
		border: 1px dashed var(--line-strong);
		font-size: 1.4rem;
		font-weight: 700;
	}
	.slot.filled {
		border-style: solid;
		background: var(--navy-800);
	}
	.last {
		font-size: 0.95rem;
	}
	.last strong {
		color: var(--text);
		font-size: 1.3rem;
	}
	.bust {
		color: #ff8a91 !important;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.3rem;
		color: var(--text-2);
		font-size: 1.05rem;
	}
	.co {
		padding: 0.1rem 0.55rem;
		border-radius: var(--r-sm);
		background: rgba(34, 168, 101, 0.2);
		color: #6fe3a8;
		font-weight: 700;
		font-size: 1.25rem;
	}
</style>
