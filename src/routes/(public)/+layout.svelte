<script lang="ts">
	import { page } from '$app/state';
	import Logos from '$lib/components/Logos.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import { store } from '$lib/data/store.svelte';

	let { children } = $props();

	const links = [
		{ href: '/', label: 'Live' },
		{ href: '/tabellen', label: 'Gruppen' },
		{ href: '/ko', label: 'KO-Runde' },
		{ href: '/spielplan', label: 'Spielplan' },
		{ href: '/statistik', label: 'Statistik' }
	];

	const liveCount = $derived(store.data.matches.filter((m) => m.status === 'live').length);
</script>

<StatusBar />
<header class="top">
	<div class="inner">
		<a class="brand" href="/">
			<Logos size={3.2} />
			<span class="title">
				<strong>{store.data.settings.name}</strong>
				<span class="muted">SC Fornsbach × Milchhäusle</span>
			</span>
		</a>
		{#if liveCount}
			<span class="live-count"><span class="live-dot"></span> {liveCount} {liveCount === 1 ? 'Spiel' : 'Spiele'} live</span>
		{/if}
	</div>
	<nav aria-label="Bereiche">
		<div class="inner">
			{#each links as l (l.href)}
				<a href={l.href} aria-current={page.url.pathname === l.href ? 'page' : undefined}>{l.label}</a>
			{/each}
		</div>
	</nav>
</header>

<main class="inner">
	{#if store.status === 'loading' || store.status === 'idle'}
		<p class="muted loading">Turnierdaten werden geladen …</p>
	{:else}
		{@render children()}
	{/if}
</main>

<footer class="inner muted">
	<a href="/tv">TV-Ansicht</a>
	<a href="/board">Scheibe einrichten</a>
	<a href="/admin">Turnierleitung</a>
</footer>

<style>
	.inner {
		max-width: 76rem;
		margin: 0 auto;
		padding: 0 1rem;
	}
	.top {
		border-bottom: 1px solid var(--line);
		background: rgba(5, 13, 27, 0.5);
	}
	.top > .inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 0.9rem;
		padding-bottom: 0.9rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: var(--text);
		text-decoration: none;
		min-width: 0;
	}
	.title {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.title strong {
		font-size: 1.45rem;
		line-height: 1.15;
	}
	.title .muted {
		font-size: 0.9rem;
	}
	.live-count {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
		white-space: nowrap;
	}
	nav {
		overflow-x: auto;
	}
	nav .inner {
		display: flex;
		gap: 0.25rem;
	}
	nav a {
		padding: 0.6rem 0.9rem;
		color: var(--text-2);
		text-decoration: none;
		font-weight: 600;
		border-bottom: 3px solid transparent;
		white-space: nowrap;
	}
	nav a:hover {
		color: var(--text);
	}
	nav a[aria-current='page'] {
		color: var(--text);
		border-bottom-color: var(--blue);
	}
	main.inner {
		padding-top: 1.5rem;
		padding-bottom: 2.5rem;
	}
	.loading {
		padding: 3rem 0;
		text-align: center;
	}
	footer.inner {
		display: flex;
		gap: 1.25rem;
		padding-top: 1rem;
		padding-bottom: 2rem;
		border-top: 1px solid var(--line);
		font-size: 0.9rem;
	}
	footer a {
		color: var(--muted);
	}
	@media (max-width: 560px) {
		.title .muted {
			display: none;
		}
		.title strong {
			font-size: 1.15rem;
		}
		.live-count {
			font-size: 0.85rem;
		}
	}
</style>
