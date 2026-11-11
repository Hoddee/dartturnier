<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { ADVANCE_PER_GROUP, nameOf, type GroupStandings } from '$lib/logic/derive';

	interface Props {
		standings: GroupStandings;
		compact?: boolean;
	}
	let { standings, compact = false }: Props = $props();
	const players = $derived(store.view.players);
	const liveIds = $derived(
		new Set(
			store.data.matches
				.filter((m) => m.status === 'live' && m.group_id === standings.group.id)
				.flatMap((m) => [m.player_a, m.player_b])
		)
	);
</script>

<section class="group" class:compact>
	<h3>
		Gruppe {standings.group.id}
		{#if standings.complete}<span class="done muted">abgeschlossen</span>{/if}
	</h3>
	<table class="data">
		<thead>
			<tr>
				<th class="n" style="width:2rem"><span class="sr-only">Platz</span></th>
				<th>Spieler</th>
				<th class="n" title="Spiele">Sp</th>
				{#if !compact}<th class="n" title="Siege">S</th>{/if}
				<th class="n" title="Legs">Legs</th>
				<th class="n" title="Punkte">Pkt</th>
			</tr>
		</thead>
		<tbody>
			{#each standings.rows as r (r.playerId)}
				<tr class:q={r.rank <= ADVANCE_PER_GROUP} class:tie={standings.complete && r.tieKey !== null}>
					<td class="n">{r.rank}</td>
					<td class="pl">
						<a href="/spieler/{r.playerId}">{nameOf(players, r.playerId)}</a>
						{#if liveIds.has(r.playerId)}<span class="live-dot" title="spielt gerade"></span>{/if}
					</td>
					<td class="n">{r.played}</td>
					{#if !compact}<td class="n">{r.wins}</td>{/if}
					<td class="n">{r.legsFor}:{r.legsAgainst}</td>
					<td class="n strong">{r.points}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if standings.blocked}
		<p class="warn">Gleichstand um den Aufstieg, die Turnierleitung entscheidet.</p>
	{/if}
</section>

<style>
	.group {
		background: var(--navy-850);
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		padding: 1rem 1rem 0.5rem;
	}
	h3 {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: 1.15rem;
	}
	.done {
		font-size: 0.85rem;
		font-weight: 500;
	}
	tr.q td:first-child {
		box-shadow: inset 3px 0 0 var(--blue);
	}
	tr.q .pl a {
		font-weight: 600;
	}
	.pl a {
		color: var(--text);
		text-decoration: none;
	}
	.pl a:hover {
		text-decoration: underline;
	}
	.pl .live-dot {
		margin-left: 0.4rem;
		vertical-align: middle;
	}
	.strong {
		font-weight: 700;
	}
	tr.tie td {
		color: var(--gold);
	}
	.warn {
		color: var(--gold);
		font-size: 0.9rem;
		margin: 0.5rem 0;
	}
	tbody tr:last-child td {
		border-bottom: none;
	}
	.compact table.data td {
		padding: 0.35rem 0.4rem;
	}
</style>
