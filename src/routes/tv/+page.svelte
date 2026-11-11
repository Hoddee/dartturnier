<script lang="ts">
	import { onMount } from 'svelte';
	import BoardLive from '$lib/components/BoardLive.svelte';
	import Bracket from '$lib/components/Bracket.svelte';
	import Leaders from '$lib/components/Leaders.svelte';
	import Logos from '$lib/components/Logos.svelte';
	import StandingsTable from '$lib/components/StandingsTable.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import HighlightOverlay from '$lib/components/HighlightOverlay.svelte';
	import { store } from '$lib/data/store.svelte';
	import { BOARD_COUNT } from '$lib/logic/plans';

	const ROTATE_MS = 15000;

	type Slide = { key: string; title: string; groups?: number[] };

	const koStarted = $derived(store.data.matches.some((m) => m.stage === 'ko' && (m.player_a || m.player_b)));
	const groupCount = $derived(store.view.standings.length);

	const slides = $derived.by((): Slide[] => {
		const out: Slide[] = [];
		const groupSlides: Slide[] = [];
		for (let i = 0; i < groupCount; i += 4) {
			const idx = [i, i + 1, i + 2, i + 3].filter((x) => x < groupCount);
			const ids = idx.map((x) => store.view.standings[x].group.id);
			groupSlides.push({ key: `g${i}`, title: `Gruppen ${ids[0]} bis ${ids[ids.length - 1]}`, groups: idx });
		}
		// In der KO-Phase zuerst der Turnierbaum
		if (koStarted) out.push({ key: 'ko', title: 'KO-Runde' }, ...groupSlides);
		else out.push(...groupSlides, { key: 'ko', title: 'KO-Runde' });
		out.push({ key: 'stats', title: 'Turnier-Bestwerte' });
		return out;
	});

	let index = $state(0);
	let now = $state(new Date());
	const slide = $derived(slides[index % Math.max(1, slides.length)]);

	// Die Ansicht ist für 1920 × 1080 gebaut und wird auf jede Bildschirmgröße skaliert,
	// damit sie auf jedem Fernseher/Beamer gleich aussieht.
	const STAGE_W = 1920;
	const STAGE_H = 1080;
	let scale = $state(1);
	function fit() {
		scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
	}

	onMount(() => {
		fit();
		window.addEventListener('resize', fit);
		const rot = setInterval(() => (index = (index + 1) % Math.max(1, slides.length)), ROTATE_MS);
		const clock = setInterval(() => (now = new Date()), 1000 * 15);
		return () => {
			window.removeEventListener('resize', fit);
			clearInterval(rot);
			clearInterval(clock);
		};
	});

	function fullscreen() {
		void document.documentElement.requestFullscreen?.();
	}
</script>

<div class="viewport">
<div class="tv" style="transform: translate(-50%, -50%) scale({scale})">
	<StatusBar />
	<header>
		<Logos size={4} />
		<h1>{store.data.settings.name}</h1>
		<div class="right">
			<a class="btn small fs" href="/">Zurück</a>
			<button class="btn small fs" onclick={fullscreen}>Vollbild</button>
			<span class="clock num">{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
		</div>
	</header>

	<section class="boards">
		{#each Array.from({ length: BOARD_COUNT }, (_, i) => i + 1) as b (b)}
			<BoardLive board={b} large />
		{/each}
	</section>

	<section class="rotator">
		{#if slide}
			<div class="slide-head">
				<h2>{slide.title}</h2>
				<div class="dots" aria-hidden="true">
					{#each slides as s, i (s.key)}<span class:on={i === index % slides.length}></span>{/each}
				</div>
			</div>
			{#key slide.key}
				<div class="slide">
					{#if slide.groups}
						<div class="groups">
							{#each slide.groups as gi (gi)}
								<StandingsTable standings={store.view.standings[gi]} compact />
							{/each}
						</div>
					{:else if slide.key === 'ko'}
						<Bracket compact />
					{:else}
						<Leaders limit={5} />
					{/if}
				</div>
			{/key}
		{/if}
	</section>
</div>
</div>

<HighlightOverlay variant="stage" />

<style>
	.viewport {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}
	.tv {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 1920px;
		height: 1080px;
		transform-origin: center;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 1.5rem 1rem;
		font-size: 1.1rem;
	}
	/* Logos links, Titel mittig, Uhr rechts */
	header {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 1.5rem;
		padding-top: 0.75rem;
	}
	.right {
		display: flex;
		align-items: center;
		gap: 1rem;
		justify-self: end;
	}
	h1 {
		margin: 0;
		font-size: 2.4rem;
		text-align: center;
	}
	.clock {
		font-size: 2.4rem;
		font-weight: 600;
		color: var(--text-2);
	}
	:global(:fullscreen) .fs {
		display: none;
	}
	.boards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
	}
	.boards :global(.board .rest) {
		font-size: 4.4rem;
	}
	.boards :global(.board footer) {
		padding-top: 0.25rem;
		padding-bottom: 0.25rem;
	}
	.boards :global(.board .player) {
		padding-top: 0.6rem;
		padding-bottom: 0.6rem;
	}
	.boards :global(.board) {
		min-height: 0;
	}
	.rotator {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.slide-head {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
	}
	.slide-head h2 {
		grid-column: 2;
		text-align: center;
	}
	.dots {
		justify-self: end;
	}
	.slide-head h2 {
		font-size: 1.4rem;
		margin: 0 0 0.4rem;
	}
	.dots {
		display: flex;
		gap: 0.4rem;
	}
	.dots span {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--navy-700);
	}
	.dots span.on {
		background: var(--blue);
	}
	.slide {
		animation: fade 0.6s ease;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	.groups {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
	}
	.groups :global(table.data) {
		font-size: 1.1rem;
	}
</style>
