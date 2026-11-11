<script lang="ts">
	import { page } from '$app/state';
	import Logos from '$lib/components/Logos.svelte';
</script>

<svelte:head><title>Seite nicht gefunden</title></svelte:head>

<main>
	<Logos size={4} />
	{#if page.status === 404}
		<h1>Diese Seite gibt es nicht</h1>
		<p class="muted">Die Adresse ist falsch geschrieben oder die Seite wurde verschoben.</p>
	{:else}
		<h1>Da ist etwas schiefgelaufen</h1>
		<p class="muted">{page.error?.message ?? 'Unbekannter Fehler'}</p>
	{/if}
	<div class="links">
		<a class="btn primary" href="/">Zur Live-Seite</a>
		<a class="btn" href="/spielplan">Spielplan</a>
	</div>
</main>

<style>
	main {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem 1rem;
		gap: 0.5rem;
	}
	h1 {
		margin-top: 1.5rem;
	}
	.links {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
