<script lang="ts">
	import StandingsTable from '$lib/components/StandingsTable.svelte';
	import { store } from '$lib/data/store.svelte';
</script>

<h2>Gruppenphase</h2>
<p class="muted intro">
	Die ersten beiden jeder Gruppe kommen ins Achtelfinale. Bei Punktgleichheit entscheidet zuerst der direkte Vergleich.
</p>

{#if store.view.standings.length === 0}
	<p class="muted">Die Gruppen sind noch nicht eingeteilt.</p>
{:else}
	<div class="grid">
		{#each store.view.standings as s (s.group.id)}
			<StandingsTable standings={s} />
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
		grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr));
		gap: 1rem;
	}
	@media (max-width: 400px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
