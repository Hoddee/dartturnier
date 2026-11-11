<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import Logos from '$lib/components/Logos.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import Keypad from '$lib/board/Keypad.svelte';
	import Scoreboard from '$lib/board/Scoreboard.svelte';
	import { BoardSync } from '$lib/board/sync.svelte';
	import { clearBoardKey, loadBoardKey } from '$lib/board/config';
	import { BackendError } from '$lib/data/backend';
	import { store } from '$lib/data/store.svelte';
	import { currentMatchForBoard, nameOf, roundLabel, upcomingForBoard } from '$lib/logic/derive';
	import type { Dart } from '$lib/engine/types';

	const board = $derived(Number(page.params.nr));
	let key = $state<string | null>(null);

	onMount(() => {
		key = loadBoardKey();
		if (!key) void goto('/board');
		// Bildschirm wach halten
		let lock: { release: () => Promise<void> } | null = null;
		const requestLock = async () => {
			try {
				lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request(
					'screen'
				) ?? null;
			} catch {
				/* nicht unterstützt */
			}
		};
		void requestLock();
		const onVis = () => document.visibilityState === 'visible' && requestLock();
		document.addEventListener('visibilitychange', onVis);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			void lock?.release();
		};
	});

	const players = $derived(store.view.players);
	const current = $derived(currentMatchForBoard(store.data.matches, board));
	const upcoming = $derived(upcomingForBoard(store.data.matches, board, 3));

	/** Beendetes Match bleibt sichtbar, bis "Weiter" gedrückt wird (Undo bleibt so möglich). */
	let heldId = $state<string | null>(null);
	const match = $derived(
		heldId ? (store.data.matches.find((m) => m.id === heldId) ?? current) : current
	);

	let sync = $state<BoardSync | null>(null);
	const scoring = $derived(!!match && match.first_thrower_set && match.status !== 'scheduled');

	// Eingabe-Warteschlange pro Match
	$effect(() => {
		const id = scoring && match ? match.id : null;
		const k = key;
		untrack(() => {
			if (sync && sync.matchId !== id) {
				sync.dispose();
				sync = null;
			}
			if (id && k && !sync) sync = new BoardSync(id, k, () => store.data.matches.find((m) => m.id === id));
		});
	});

	// Match von der Turnierleitung zurückgesetzt: Warteschlange neu aufbauen
	$effect(() => {
		if (sync && match && match.status === 'scheduled') {
			untrack(() => {
				sync?.dispose();
				sync = null;
			});
		}
	});

	// Sieg erkannt: Match festhalten
	$effect(() => {
		if (sync?.state.finished && match && sync.matchId === match.id && !heldId) heldId = match.id;
	});

	const names = $derived<[string, string]>([nameOf(players, match?.player_a), nameOf(players, match?.player_b)]);

	let busy = $state(false);
	let actionError = $state<string | null>(null);

	async function act(fn: () => Promise<unknown>) {
		busy = true;
		actionError = null;
		try {
			const row = await fn();
			if (row && typeof row === 'object') store.applyLocal({ kind: 'upsert', table: 'matches', row: { ...(row as object) } });
		} catch (e) {
			actionError =
				e instanceof BackendError && e.code === 'badKey'
					? 'Board-Schlüssel ungültig. Bitte die Scheibe neu einrichten.'
					: e instanceof Error
						? e.message
						: String(e);
			await store.reload();
		} finally {
			busy = false;
		}
	}

	const ready = (slot: 0 | 1) => match && key && act(() => store.backend.boardReady(key!, match!.id, slot));
	const firstThrower = (slot: 0 | 1) =>
		match && key && act(() => store.backend.boardSetFirstThrower(key!, match!.id, slot));

	// Kurze Rückmeldungen (Bust, Leg gewonnen)
	let flash = $state<{ text: string; tone: 'bust' | 'leg' } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function showFlash(text: string, tone: 'bust' | 'leg') {
		flash = { text, tone };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), tone === 'leg' ? 2200 : 1300);
	}

	function onDart(d: Dart) {
		if (!sync) return;
		const before = sync.state;
		if (!sync.add(d)) return;
		const after = sync.state;
		if (after.visits.length > before.visits.length && after.visits[after.visits.length - 1].bust) {
			showFlash('Bust', 'bust');
		} else if (after.legResults.length > before.legResults.length && !after.finished) {
			const w = after.legResults[after.legResults.length - 1].winner;
			showFlash(`Leg an ${names[w]}`, 'leg');
		}
	}

	function onUndo() {
		sync?.undo();
		if (heldId && sync && !sync.state.finished) heldId = null;
	}

	function next() {
		heldId = null;
	}

	function leave() {
		if (confirm('Scheibe verlassen? Die Eingabe auf diesem iPad wird beendet.')) {
			void goto('/board');
		}
	}

	function resetKey() {
		clearBoardKey();
		void goto('/board');
	}

	const pendingCount = $derived(sync?.pending.length ?? 0);
	const winnerSlot = $derived(sync?.state.finished ? sync.state.winner : null);
</script>

<svelte:head><title>Scheibe {board}</title></svelte:head>

<div class="app">
	<StatusBar />
	<header class="bar">
		<Logos size={2.4} />
		<div class="where">
			<strong>Scheibe {board}</strong>
			{#if match}<span class="muted">{roundLabel(match)} · First to {match.legs_to_win}</span>{/if}
		</div>
		<div class="sync" aria-live="polite">
			{#if sync?.fatal}
				<button class="btn small danger" onclick={resetKey}>Neu einrichten</button>
			{:else if pendingCount}
				<span class="pending">{pendingCount} {pendingCount === 1 ? 'Eingabe wird' : 'Eingaben werden'} gesendet</span>
			{:else if sync}
				<span class="ok">Gespeichert</span>
			{/if}
		</div>
		<button class="exit" onclick={leave} aria-label="Scheibe verlassen">⋯</button>
	</header>

	{#if sync?.problem}
		<p class="problem" role="status">{sync.problem}</p>
	{/if}
	{#if actionError}
		<p class="problem" role="alert">{actionError}</p>
	{/if}

	<main>
		{#if store.status !== 'ready'}
			<div class="center muted">Lade Spiele …</div>
		{:else if !match}
			<div class="center">
				<h1>Gerade kein Spiel</h1>
				{#if upcoming.length}
					<p class="muted">Die nächsten Spiele warten noch auf ihre Spieler:</p>
					<ul class="queue">
						{#each upcoming as m (m.id)}
							<li>{roundLabel(m)}: {nameOf(players, m.player_a, 'offen')} – {nameOf(players, m.player_b, 'offen')}</li>
						{/each}
					</ul>
				{:else}
					<p class="muted">Auf dieser Scheibe sind alle Spiele gespielt. Danke!</p>
				{/if}
			</div>
		{:else if match.status === 'scheduled'}
			<div class="ready">
				<p class="muted lead">Nächstes Spiel · bitte zur Scheibe {board}</p>
				<div class="duo">
					{#each [0, 1] as const as slot (slot)}
						{@const isReady = slot === 0 ? match.ready_a : match.ready_b}
						<div class="who" class:isReady>
							<h2>{names[slot]}</h2>
							<button class="btn readybtn" class:primary={!isReady} disabled={isReady || busy} onclick={() => ready(slot)}>
								{isReady ? 'Bereit ✓' : 'Bereit'}
							</button>
						</div>
						{#if slot === 0}<span class="vs muted">gegen</span>{/if}
					{/each}
				</div>
				{#if upcoming.length}
					<p class="muted after">Danach: {nameOf(players, upcoming[0].player_a, 'offen')} – {nameOf(players, upcoming[0].player_b, 'offen')}</p>
				{/if}
			</div>
		{:else if !match.first_thrower_set}
			<div class="ready">
				<h1>Ausbullen</h1>
				<p class="muted lead">Wer hat das Ausbullen gewonnen und wirft im ersten Leg an?</p>
				<div class="duo">
					{#each [0, 1] as const as slot (slot)}
						<button class="btn primary bigpick" disabled={busy} onclick={() => firstThrower(slot)}>{names[slot]}</button>
						{#if slot === 0}<span class="vs muted">oder</span>{/if}
					{/each}
				</div>
				<p class="muted after">Danach wechselt der Anwurf jedes Leg automatisch.</p>
			</div>
		{:else if sync}
			<div class="play">
				<Scoreboard state={sync.state} {names} />
				<div class="pad">
					<Keypad onDart={onDart} onUndo={onUndo} canUndo={sync.darts.length > 0} disabled={sync.state.finished || sync.fatal} />
				</div>
			</div>

			{#if flash}
				<div class="flash {flash.tone}" role="status">{flash.text}</div>
			{/if}

			{#if winnerSlot !== null}
				<div class="overlay" role="dialog" aria-modal="true" aria-label="Spiel beendet">
					<div class="win">
						<p class="muted">Spiel beendet</p>
						<h1>{names[winnerSlot]} gewinnt</h1>
						<p class="result num">{sync.state.legsWon[0]} : {sync.state.legsWon[1]}</p>
						<div class="actions">
							<button class="btn" onclick={onUndo}>Letzten Dart rückgängig</button>
							<button class="btn primary" onclick={next} disabled={pendingCount > 0}>
								{pendingCount > 0 ? 'Wird gespeichert …' : 'Weiter zum nächsten Spiel'}
							</button>
						</div>
					</div>
				</div>
			{/if}
		{/if}
	</main>
</div>

<style>
	.app {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding-bottom: env(safe-area-inset-bottom);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0.9rem;
		padding-top: max(0.5rem, env(safe-area-inset-top));
		border-bottom: 1px solid var(--line);
		background: rgba(5, 13, 27, 0.5);
	}
	.where {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
		flex: 1;
		min-width: 0;
	}
	.where .muted {
		font-size: 0.9rem;
	}
	.sync {
		font-size: 0.9rem;
		font-weight: 600;
	}
	.ok {
		color: #6fe3a8;
	}
	.pending {
		color: var(--gold);
	}
	.exit {
		background: none;
		border: 1px solid var(--line);
		color: var(--muted);
		border-radius: var(--r-md);
		width: 2.6rem;
		height: 2.6rem;
		font-size: 1.4rem;
		cursor: pointer;
	}
	.problem {
		margin: 0;
		padding: 0.5rem 1rem;
		background: rgba(242, 193, 78, 0.15);
		color: var(--gold);
		text-align: center;
	}
	main {
		flex: 1;
		min-height: 0;
		position: relative;
		padding: 0.6rem;
	}
	.center {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.queue {
		list-style: none;
		padding: 0;
		color: var(--text-2);
	}
	.ready {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 0.5rem;
	}
	.lead {
		font-size: 1.15rem;
	}
	.duo {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin: 1.5rem 0;
		flex-wrap: wrap;
		justify-content: center;
	}
	.vs {
		font-size: 1.2rem;
	}
	.who {
		width: min(22rem, 40vw);
		padding: 1.5rem;
		border-radius: var(--r-lg);
		background: var(--navy-850);
		border: 2px solid var(--line-strong);
	}
	.who.isReady {
		border-color: var(--green);
	}
	.who h2 {
		font-size: 2rem;
		margin-bottom: 1rem;
		overflow-wrap: anywhere;
	}
	.readybtn {
		width: 100%;
		padding: 1.1rem;
		font-size: 1.5rem;
	}
	.who.isReady .readybtn {
		color: #6fe3a8;
		opacity: 1;
	}
	.bigpick {
		min-width: min(20rem, 38vw);
		padding: 1.5rem 1.25rem;
		font-size: 1.8rem;
	}
	.after {
		margin-top: 0.5rem;
	}
	.play {
		height: 100%;
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 0.6rem;
	}
	.pad {
		min-height: 0;
	}
	@media (orientation: landscape) and (min-width: 900px) {
		.play {
			grid-template-rows: none;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		}
		.play :global(.score) {
			grid-template-columns: 1fr;
			align-content: start;
		}
	}
	.flash {
		position: absolute;
		left: 50%;
		top: 30%;
		transform: translate(-50%, -50%);
		padding: 1rem 2.5rem;
		border-radius: var(--r-lg);
		font-size: 3rem;
		font-weight: 800;
		font-family: var(--font-num);
		pointer-events: none;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}
	.flash.bust {
		background: var(--red);
	}
	.flash.leg {
		background: var(--blue-strong);
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(5, 13, 27, 0.82);
		backdrop-filter: blur(4px);
	}
	.win {
		text-align: center;
		padding: 2rem;
	}
	.win h1 {
		font-size: 3rem;
		color: var(--gold);
		margin: 0.25rem 0;
	}
	.result {
		font-size: 4rem;
		font-weight: 800;
		margin: 0;
	}
	.actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}
	.actions .btn {
		padding: 1rem 1.5rem;
		font-size: 1.15rem;
	}
</style>
