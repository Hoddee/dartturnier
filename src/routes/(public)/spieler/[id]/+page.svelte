<script lang="ts">
	import { page } from '$app/state';
	import { store } from '$lib/data/store.svelte';
	import { formatAverage, matchState, nameOf, roundLabel } from '$lib/logic/derive';
	import { threeDartAverage } from '$lib/engine/match';
	import Avatar from '$lib/components/Avatar.svelte';

	const id = $derived(page.params.id ?? '');
	const player = $derived(store.view.players[id]);
	const totals = $derived(store.view.totals[id]);
	const group = $derived(store.view.groups.find((g) => g.playerIds.includes(id)));
	const standing = $derived(
		store.view.standings.find((s) => s.group.id === group?.id)?.rows.find((r) => r.playerId === id)
	);
	const players = $derived(store.view.players);

	const matches = $derived(
		store.data.matches
			.filter((m) => m.player_a === id || m.player_b === id)
			.sort((a, b) => (a.stage === b.stage ? (a.queue_index ?? 0) - (b.queue_index ?? 0) : a.stage === 'group' ? -1 : 1))
	);

	const stats = $derived(totals?.stats);
	const tiles = $derived(
		stats
			? [
					{ label: '3-Dart-Average', value: formatAverage(totals!.average) },
					{ label: 'Höchste Aufnahme', value: stats.highestVisit || '–' },
					{ label: 'Höchstes Finish', value: stats.highestFinish || '–' },
					{ label: '180er', value: stats.count180 },
					{ label: '140+', value: stats.count140Plus },
					{ label: '100+', value: stats.count100Plus },
					{ label: 'Bestes Leg', value: stats.bestLegDarts ? `${stats.bestLegDarts} Darts` : '–' },
					{ label: 'Legs', value: `${stats.legsWon} / ${stats.legsPlayed}` }
				]
			: []
	);
</script>

{#if !player}
	<p class="muted">Spieler nicht gefunden. <a href="/statistik">Zur Spielerliste</a></p>
{:else}
	<header class="head">
		<Avatar playerId={id} size={7} ring />
		<div>
		<h2>{player.name}</h2>
		<p class="muted">
			{#if group}Gruppe {group.id}{#if standing} · Platz {standing.rank} · {standing.points} Punkte{/if}{/if}
			{#if totals}· {totals.matchesWon} von {totals.matchesPlayed} Spielen gewonnen{/if}
		</p>
		</div>
	</header>

	{#if tiles.length}
		<div class="tiles">
			{#each tiles as t (t.label)}
				<div class="tile">
					<span class="v num">{t.value}</span>
					<span class="l muted">{t.label}</span>
				</div>
			{/each}
		</div>
	{:else}
		<p class="muted">Noch keine geworfenen Darts.</p>
	{/if}

	<h3 class="mh">Spiele</h3>
	<div class="scroll">
		<table class="data">
			<thead>
				<tr>
					<th>Runde</th>
					<th>Gegner</th>
					<th class="n">Ergebnis</th>
					<th class="n">Ø</th>
					<th class="n">Max</th>
				</tr>
			</thead>
			<tbody>
				{#each matches as m (m.id)}
					{@const slot = m.player_a === id ? 0 : 1}
					{@const opp = slot === 0 ? m.player_b : m.player_a}
					{@const s = matchState(m, store.data.dartsByMatch[m.id])}
					<tr>
						<td>{roundLabel(m)}</td>
						<td>
							{#if opp}<a href="/spieler/{opp}">{nameOf(players, opp)}</a>{:else}<span class="muted">offen</span>{/if}
						</td>
						<td class="n">
							{#if m.status === 'scheduled'}
								<span class="muted">Scheibe {m.board ?? '–'}</span>
							{:else}
								<span class:win={m.winner_id === id} class:loss={m.winner_id && m.winner_id !== id}>
									{slot === 0 ? m.legs_a : m.legs_b}:{slot === 0 ? m.legs_b : m.legs_a}
								</span>
								{#if m.status === 'live'}<span class="live-dot"></span>{/if}
							{/if}
						</td>
						<td class="n">{s.stats[slot].dartsThrown ? formatAverage(threeDartAverage(s.stats[slot])) : '–'}</td>
						<td class="n">{s.stats[slot].highestVisit || '–'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		margin-bottom: 1.25rem;
	}
	.head h2 {
		font-size: 2rem;
		margin-bottom: 0.15rem;
	}
	.head p {
		margin: 0;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 0.75rem;
	}
	.tile {
		display: flex;
		flex-direction: column;
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-md);
		padding: 0.8rem 1rem;
	}
	.tile:first-child {
		border-color: var(--blue);
	}
	.v {
		font-size: 2.2rem;
		font-weight: 700;
		line-height: 1.1;
	}
	.l {
		font-size: 0.85rem;
	}
	.mh {
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
	}
	.win {
		color: #6fe3a8;
		font-weight: 700;
	}
	.loss {
		color: #ff9aa0;
	}
</style>
