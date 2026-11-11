<script lang="ts">
	import Bracket from '$lib/components/Bracket.svelte';
</script>

<h2>KO-Runde</h2>
<p class="muted intro">Spieler aus derselben Gruppe können sich frühestens im Finale wieder begegnen.</p>
<Bracket />

<style>
	.intro {
		margin-top: -0.25rem;
		margin-bottom: 1.25rem;
	}
</style>
