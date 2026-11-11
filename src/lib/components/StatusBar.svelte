<script lang="ts">
	import { store } from '$lib/data/store.svelte';
</script>

{#if store.demo}
	<div class="bar demo">
		<span>Demo-Modus: Daten nur in diesem Browser</span>
		<span>Board-Schlüssel: <strong>demo</strong></span>
	</div>
{/if}
{#if store.status === 'error'}
	<div class="bar error">
		Turnierdaten konnten nicht geladen werden: {store.error}
		<button class="btn small" onclick={() => store.reload()}>Erneut laden</button>
	</div>
{:else if store.status === 'ready' && !store.connected}
	<div class="bar warn">Verbindung unterbrochen, die Anzeige aktualisiert sich wieder, sobald das Netz zurück ist.</div>
{/if}

<style>
	.bar {
		padding: 0.45rem 1rem;
		font-size: 0.9rem;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.demo {
		gap: 0.25rem 1rem;
		background: rgba(242, 193, 78, 0.14);
		color: var(--gold);
	}
	.error {
		background: rgba(236, 35, 48, 0.18);
		color: #ffb3b8;
	}
	.warn {
		background: rgba(242, 193, 78, 0.14);
		color: var(--gold);
	}
</style>
