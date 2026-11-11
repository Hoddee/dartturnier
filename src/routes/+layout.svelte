<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { store } from '$lib/data/store.svelte';

	let { children } = $props();

	onMount(() => store.start());
</script>

<svelte:head>
	<title>{store.data.settings.name} · SC Fornsbach × Milchhäusle</title>
</svelte:head>

{@render children()}
