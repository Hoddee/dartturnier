<script lang="ts">
	import { onDestroy } from 'svelte';
	import Avatar from './Avatar.svelte';
	import { store } from '$lib/data/store.svelte';
	import { allHighlights, type Highlight } from '$lib/logic/highlights';
	import { nameOf } from '$lib/logic/derive';

	interface Props {
		/** 'stage' = großes Vollbild auf dem TV, 'toast' = kleine Einblendung auf der Live-Seite */
		variant?: 'stage' | 'toast';
		durationMs?: number;
	}
	let { variant = 'stage', durationMs = 5000 }: Props = $props();

	/** Ältere Einblendungen verfallen, damit sich bei vielen 180ern nichts ewig staut */
	const MAX_AGE_MS = 20000;

	let seen: Set<string> | null = null;
	let queue = $state<(Highlight & { at: number })[]>([]);
	let current = $state<Highlight | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Neue Höhepunkte erkennen; beim ersten Laden alles Bestehende als "schon gesehen" merken
	$effect(() => {
		if (store.status !== 'ready') return;
		const found = allHighlights(store.data);
		if (!seen) {
			seen = new Set(found.map((h) => h.key));
			return;
		}
		const fresh = found.filter((h) => !seen!.has(h.key));
		for (const h of fresh) seen.add(h.key);
		if (fresh.length) queue = [...queue, ...fresh.map((h) => ({ ...h, at: Date.now() }))];
	});

	$effect(() => {
		if (current || queue.length === 0) return;
		const valid = queue.filter((h) => Date.now() - h.at < MAX_AGE_MS);
		if (valid.length === 0) {
			queue = [];
			return;
		}
		current = valid[0];
		queue = valid.slice(1);
		clearTimeout(timer);
		timer = setTimeout(() => (current = null), durationMs);
	});

	onDestroy(() => clearTimeout(timer));

	const players = $derived(store.view.players);
</script>

{#if current}
	{#key current.key}
		{#if variant === 'stage'}
			<div class="stage {current.kind}" role="status" aria-live="polite">
				<div class="burst" aria-hidden="true"></div>
				<div class="content">
					<p class="kind">{current.kind === '180' ? 'Maximum' : 'High Finish'}</p>
					<p class="value num">{current.value}</p>
					<div class="who">
						<Avatar playerId={current.playerId} size={5} ring />
						<div>
							<p class="name">{nameOf(players, current.playerId)}</p>
							{#if current.board}<p class="board">Scheibe {current.board}</p>{/if}
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="toast {current.kind}" role="status" aria-live="polite">
				<Avatar playerId={current.playerId} size={2.6} />
				<div>
					<strong class="num">{current.kind === '180' ? '180!' : `High Finish ${current.value}`}</strong>
					<span>{nameOf(players, current.playerId)}{#if current.board} · Scheibe {current.board}{/if}</span>
				</div>
			</div>
		{/if}
	{/key}
{/if}

<style>
	.stage {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: rgba(5, 13, 27, 0.78);
		backdrop-filter: blur(6px);
		animation: fade-in 0.35s ease-out;
	}
	.burst {
		position: absolute;
		width: 70vmin;
		height: 70vmin;
		border-radius: 50%;
		background: radial-gradient(circle, var(--glow) 0%, transparent 62%);
		animation: burst 1.6s ease-out;
	}
	.stage.\31 80 {
		--glow: rgba(236, 35, 48, 0.55);
		--accent: #ff4f5a;
	}
	.stage.finish {
		--glow: rgba(34, 168, 101, 0.5);
		--accent: #5ee6a0;
	}
	.content {
		position: relative;
		text-align: center;
		animation: pop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1);
	}
	.kind {
		margin: 0;
		font-size: 2.6rem;
		font-weight: 700;
		color: var(--accent);
	}
	.value {
		margin: -0.5rem 0 0;
		font-size: 17rem;
		font-weight: 800;
		line-height: 1;
		color: #fff;
		text-shadow: 0 0 40px var(--glow);
	}
	.who {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		margin-top: 1rem;
		text-align: left;
	}
	.name {
		margin: 0;
		font-size: 3rem;
		font-weight: 700;
	}
	.board {
		margin: 0;
		font-size: 1.5rem;
		color: var(--text-2);
	}

	.toast {
		position: fixed;
		z-index: 50;
		right: 1rem;
		bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.1rem;
		border-radius: var(--r-lg);
		background: var(--navy-800);
		border: 2px solid var(--accent);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
		animation: slide-in 0.4s cubic-bezier(0.2, 1.3, 0.4, 1);
		max-width: calc(100vw - 2rem);
	}
	.toast.\31 80 {
		--accent: var(--red);
	}
	.toast.finish {
		--accent: var(--green);
	}
	.toast div {
		display: flex;
		flex-direction: column;
		line-height: 1.25;
	}
	.toast strong {
		font-size: 1.5rem;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
	}
	@keyframes burst {
		from {
			transform: scale(0.2);
			opacity: 1;
		}
		to {
			transform: scale(1.4);
			opacity: 0.6;
		}
	}
	@keyframes slide-in {
		from {
			transform: translateY(120%);
			opacity: 0;
		}
	}
</style>
