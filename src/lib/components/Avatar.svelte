<script lang="ts">
	import { store } from '$lib/data/store.svelte';

	interface Props {
		playerId: string | null | undefined;
		/** Größe in rem */
		size?: number;
		ring?: boolean;
	}
	let { playerId, size = 2.5, ring = false }: Props = $props();

	const player = $derived(playerId ? store.view.players[playerId] : undefined);
	const initials = $derived(
		(player?.name ?? '?')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase())
			.join('')
	);
	let failed = $state(false);
	$effect(() => {
		void player?.photo_url;
		failed = false;
	});
</script>

<span class="avatar" class:ring style="--s: {size}rem" aria-hidden="true">
	{#if player?.photo_url && !failed}
		<img src={player.photo_url} alt="" loading="lazy" onerror={() => (failed = true)} />
	{:else}
		<span class="init">{initials}</span>
	{/if}
</span>

<style>
	.avatar {
		display: inline-grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		background: linear-gradient(135deg, var(--navy-700), var(--navy-800));
		border: 1px solid var(--line-strong);
	}
	.ring {
		border: 3px solid var(--blue);
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.init {
		font-weight: 700;
		font-size: calc(var(--s) * 0.38);
		color: var(--text-2);
	}
</style>
