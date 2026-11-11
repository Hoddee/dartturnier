<script lang="ts">
	import { onMount } from 'svelte';
	import Logos from '$lib/components/Logos.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import Groups from '$lib/admin/Groups.svelte';
	import Matches from '$lib/admin/Matches.svelte';
	import Players from '$lib/admin/Players.svelte';
	import Schedule from '$lib/admin/Schedule.svelte';
	import Settings from '$lib/admin/Settings.svelte';
	import { ui } from '$lib/admin/ui.svelte';
	import { store } from '$lib/data/store.svelte';
	import type { Session } from '$lib/data/backend';

	type Tab = 'players' | 'groups' | 'schedule' | 'matches' | 'settings';
	const TABS: { key: Tab; label: string }[] = [
		{ key: 'players', label: 'Spieler' },
		{ key: 'groups', label: 'Gruppen' },
		{ key: 'schedule', label: 'Spielplan' },
		{ key: 'matches', label: 'Spiele' },
		{ key: 'settings', label: 'Einstellungen' }
	];

	let session = $state<Session | null>(null);
	let checked = $state(false);
	let email = $state('');
	let password = $state('');
	let loginError = $state<string | null>(null);
	let loggingIn = $state(false);
	let tab = $state<Tab | null>(null);

	onMount(() => {
		void store.backend.getSession().then((s) => {
			session = s;
			checked = true;
		});
		return store.backend.onAuthChange((s) => (session = s));
	});

	/** Startet im Reiter, der als Nächstes dran ist. */
	const suggested = $derived.by((): Tab => {
		if (store.data.players.length < 32) return 'players';
		if (store.view.groups.length === 0) return 'groups';
		if (!store.data.matches.length) return 'schedule';
		return 'matches';
	});
	const active = $derived(tab ?? suggested);

	// Den vorgeschlagenen Reiter nur beim Öffnen wählen, danach nicht mehr wegspringen
	$effect(() => {
		if (session && tab === null && store.status === 'ready') tab = suggested;
	});

	async function login(e: SubmitEvent) {
		e.preventDefault();
		loggingIn = true;
		loginError = null;
		try {
			await store.backend.signIn(email, password);
			session = await store.backend.getSession();
			password = '';
			await store.reload();
		} catch (err) {
			loginError = err instanceof Error ? err.message : String(err);
		} finally {
			loggingIn = false;
		}
	}

	const live = $derived(store.data.matches.filter((m) => m.status === 'live').length);
	const finished = $derived(store.data.matches.filter((m) => m.status === 'finished').length);
</script>

<svelte:head><title>Turnierleitung</title></svelte:head>

<StatusBar />
<header class="top">
	<div class="inner">
		<a href="/" class="brand"><Logos size={2.6} /> <strong>Turnierleitung</strong></a>
		{#if session}
			<span class="who muted">{session.email}</span>
			<button class="btn small" onclick={() => store.backend.signOut()}>Abmelden</button>
		{/if}
	</div>
</header>

<main class="inner">
	{#if !checked}
		<p class="muted">…</p>
	{:else if !session}
		<form class="panel login" onsubmit={login}>
			<h1>Anmelden</h1>
			<p class="muted">
				{#if store.demo}Demo-Modus: beliebige E-Mail und beliebiges Passwort.{:else}Mit dem Account, den du in Supabase unter
					Authentication → Users angelegt hast.{/if}
			</p>
			<label for="email">E-Mail</label>
			<input id="email" type="email" autocomplete="username" bind:value={email} required={!store.demo} />
			<label for="pw" class="pw">Passwort</label>
			<input id="pw" type="password" autocomplete="current-password" bind:value={password} required={!store.demo} />
			{#if loginError}<p class="error" role="alert">{loginError}</p>{/if}
			<button class="btn primary go" type="submit" disabled={loggingIn}>{loggingIn ? 'Anmelden …' : 'Anmelden'}</button>
		</form>
	{:else}
		<div class="summary">
			<span><strong class="num">{store.data.players.length}</strong> Spieler</span>
			<span><strong class="num">{store.view.groups.length}</strong> Gruppen</span>
			<span><strong class="num">{finished}</strong> / <span class="num">{store.data.matches.length}</span> Spiele beendet</span>
			<span>{#if live}<span class="live-dot"></span>{/if} <strong class="num">{live}</strong> laufend</span>
		</div>

		<nav class="tabs" aria-label="Bereiche">
			{#each TABS as t (t.key)}
				<button class:on={active === t.key} aria-current={active === t.key ? 'page' : undefined} onclick={() => (tab = t.key)}>
					{t.label}
				</button>
			{/each}
		</nav>

		{#if active === 'players'}<Players />
		{:else if active === 'groups'}<Groups />
		{:else if active === 'schedule'}<Schedule />
		{:else if active === 'matches'}<Matches />
		{:else}<Settings />{/if}
	{/if}
</main>

{#if ui.message}
	<div class="toast {ui.message.tone}" role="status">{ui.message.text}</div>
{/if}

<style>
	.inner {
		max-width: 70rem;
		margin: 0 auto;
		padding: 0 1rem;
	}
	.top {
		border-bottom: 1px solid var(--line);
		background: rgba(5, 13, 27, 0.5);
	}
	.top .inner {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding-top: 0.75rem;
		padding-bottom: 0.75rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		color: var(--text);
		text-decoration: none;
		flex: 1;
		font-size: 1.2rem;
	}
	.who {
		font-size: 0.9rem;
	}
	main.inner {
		padding-top: 1.5rem;
		padding-bottom: 4rem;
	}
	.login {
		max-width: 26rem;
		margin: 2rem auto;
	}
	.pw {
		margin-top: 0.75rem;
	}
	.go {
		width: 100%;
		margin-top: 1.25rem;
	}
	.error {
		color: #ff9aa0;
	}
	.summary {
		display: flex;
		gap: 1.75rem;
		flex-wrap: wrap;
		color: var(--text-2);
		margin-bottom: 1rem;
	}
	.summary strong {
		color: var(--text);
		font-size: 1.4rem;
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		border-bottom: 1px solid var(--line);
		margin-bottom: 1.25rem;
		overflow-x: auto;
	}
	.tabs button {
		background: none;
		border: 0;
		border-bottom: 3px solid transparent;
		padding: 0.6rem 1rem;
		color: var(--text-2);
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.tabs button.on {
		color: var(--text);
		border-bottom-color: var(--blue);
	}
	.toast {
		position: fixed;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.75rem 1.25rem;
		border-radius: var(--r-md);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
		max-width: calc(100vw - 2rem);
		font-weight: 600;
	}
	.toast.ok {
		background: #14593a;
	}
	.toast.error {
		background: #8d1820;
	}
</style>
