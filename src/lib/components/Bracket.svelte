<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { koPlaceholders, nameOf } from '$lib/logic/derive';
	import { buildKnockout, KO_ROUND_LABELS, type KoRound } from '$lib/tournament/knockout';
	import type { MatchRow } from '$lib/db-types';

	interface Props {
		/** Platzsparend für den Fernseher */
		compact?: boolean;
	}
	let { compact = false }: Props = $props();

	const ROUNDS: KoRound[] = ['R16', 'QF', 'SF', 'F'];
	const groupIds = $derived(store.view.groups.map((g) => g.id));
	const placeholders = $derived(koPlaceholders(groupIds.length === 8 ? groupIds : ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']));
	const byId = $derived(new Map(store.data.matches.filter((m) => m.stage === 'ko').map((m) => [m.id, m])));
	const defs = buildKnockout(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
	const players = $derived(store.view.players);

	function slot(m: MatchRow | undefined, id: string, s: 0 | 1) {
		const pid = m ? (s === 0 ? m.player_a : m.player_b) : null;
		return {
			pid,
			name: pid ? nameOf(players, pid) : (placeholders[id]?.[s] ?? 'offen'),
			legs: m && m.status !== 'scheduled' ? (s === 0 ? m.legs_a : m.legs_b) : null,
			won: !!m?.winner_id && m.winner_id === pid
		};
	}
</script>

<div class="bracket" class:compact>
	{#each ROUNDS as round (round)}
		<div class="round r-{round}">
			<h3>{KO_ROUND_LABELS[round]}</h3>
			<div class="matches">
				{#each defs.filter((d) => d.round === round) as d (d.id)}
					{@const m = byId.get(d.id)}
					<div class="match" class:live={m?.status === 'live'} class:done={m?.status === 'finished'}>
						{#each [0, 1] as const as s (s)}
							{@const x = slot(m, d.id, s)}
							<div class="line" class:won={x.won} class:empty={!x.pid}>
								{#if x.pid}
									<a href="/spieler/{x.pid}">{x.name}</a>
								{:else}
									<span>{x.name}</span>
								{/if}
								<span class="num legs">{x.legs ?? ''}</span>
							</div>
						{/each}
						<div class="info muted">
							{#if m?.status === 'live'}<span class="live-dot"></span> Scheibe {m.board}{:else}
								First to {m?.legs_to_win ?? d.legsToWin}{#if m?.board} · Scheibe {m.board}{/if}{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.bracket {
		display: grid;
		grid-template-columns: repeat(4, minmax(12.5rem, 1fr));
		gap: 1rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
	}
	.round {
		display: flex;
		flex-direction: column;
	}
	h3 {
		font-size: 1rem;
		color: var(--text-2);
	}
	.matches {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 0.6rem;
	}
	.match {
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		overflow: hidden;
	}
	.match.live {
		border-color: var(--red);
	}
	.line {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
	}
	.line + .line {
		border-top: 1px solid var(--line);
	}
	.line a {
		color: var(--text);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.line.empty span:first-child {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.line.won a {
		font-weight: 700;
		color: var(--gold);
	}
	.legs {
		font-size: 1.15rem;
		font-weight: 700;
	}
	.info {
		font-size: 0.78rem;
		padding: 0.2rem 0.6rem 0.35rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.compact {
		gap: 0.75rem;
	}
	.compact h3 {
		margin-bottom: 0.3rem;
	}
	.compact .matches {
		gap: 0.35rem;
	}
	.compact .line {
		padding: 0.18rem 0.6rem;
	}
	.compact .info {
		display: none;
	}
	.compact .match.live .info {
		display: flex;
	}
	.r-F .match {
		border-color: rgba(242, 193, 78, 0.45);
	}
</style>
