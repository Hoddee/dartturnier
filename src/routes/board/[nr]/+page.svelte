<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import Logos from '$lib/components/Logos.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import Keypad from '$lib/board/Keypad.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Scoreboard from '$lib/board/Scoreboard.svelte';
	import { BoardSync } from '$lib/board/sync.svelte';
	import { clearBoardKey, loadBoardKey } from '$lib/board/config';
	import { BackendError } from '$lib/data/backend';
	import { store } from '$lib/data/store.svelte';
	import { currentMatchForBoard, koPlaceholders, nameOf, roundLabel, upcomingForBoard } from '$lib/logic/derive';
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

	// Kurze Rückmeldungen (Bust, 180)
	let flash = $state<{ text: string; tone: 'bust' | 'max' } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function showFlash(text: string, tone: 'bust' | 'max') {
		flash = { text, tone };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), tone === 'max' ? 2000 : 1300);
	}

	// Leg gewonnen: große Animation
	let legWin = $state<{ slot: 0 | 1; legs: [number, number]; key: number } | null>(null);
	let legTimer: ReturnType<typeof setTimeout> | undefined;
	function showLegWin(slot: 0 | 1, legs: [number, number]) {
		legWin = { slot, legs, key: Date.now() };
		flash = null;
		clearTimeout(legTimer);
		legTimer = setTimeout(() => (legWin = null), 2800);
	}

	// Siegerbildschirm: nach 30 Sekunden automatisch zum nächsten Spiel
	const AUTO_NEXT_S = 30;
	let countdown = $state(AUTO_NEXT_S);
	$effect(() => {
		const waiting = winnerSlot !== null && pendingCount === 0;
		if (!waiting) {
			countdown = AUTO_NEXT_S;
			return;
		}
		const started = Date.now();
		const t = setInterval(() => {
			countdown = Math.max(0, AUTO_NEXT_S - Math.floor((Date.now() - started) / 1000));
			if (countdown === 0) next();
		}, 250);
		return () => clearInterval(t);
	});

	const placeholders = $derived(koPlaceholders(store.view.groups.map((g) => g.id)));
	const pairName = (m: { id: string; player_a: string | null; player_b: string | null }) =>
		`${nameOf(players, m.player_a, placeholders[m.id]?.[0] ?? 'offen')} – ${nameOf(players, m.player_b, placeholders[m.id]?.[1] ?? 'offen')}`;

	const scorerName = $derived(match?.scorer_id ? nameOf(players, match.scorer_id) : null);

	function onDart(d: Dart) {
		if (!sync) return;
		const before = sync.state;
		if (!sync.add(d)) return;
		const after = sync.state;
		const lastVisit = after.visits.length > before.visits.length ? after.visits[after.visits.length - 1] : null;
		if (after.legResults.length > before.legResults.length && !after.finished) {
			const w = after.legResults[after.legResults.length - 1].winner;
			showLegWin(w, [after.legsWon[0], after.legsWon[1]]);
		} else if (lastVisit?.bust) {
			showFlash('Bust', 'bust');
		} else if (lastVisit?.points === 180) {
			showFlash('180!', 'max');
		}
	}

	function onUndo() {
		sync?.undo();
		if (heldId && sync && !sync.state.finished) heldId = null;
	}

	function next() {
		heldId = null;
	}

	let menuOpen = $state(false);
	function leave() {
		menuOpen = true;
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
		{#if match}
			<div class="scorer" class:open={!scorerName}>
				<span class="muted">Zähler</span>
				<strong>{scorerName ?? 'offen'}</strong>
			</div>
		{/if}
		<div class="sync" aria-live="polite">
			{#if sync?.fatal}
				<button class="btn small danger" onclick={resetKey}>Neu einrichten</button>
			{:else if pendingCount}
				<span class="pending">{pendingCount} {pendingCount === 1 ? 'Eingabe wird' : 'Eingaben werden'} gesendet</span>
			{:else if sync}
				<span class="ok">Gespeichert</span>
			{/if}
		</div>
		<button class="exit" onclick={leave} aria-label="Menü öffnen" aria-expanded={menuOpen}>⋯</button>
	</header>

	{#if menuOpen}
		<div class="menu-backdrop" role="presentation" onclick={() => (menuOpen = false)}></div>
		<div class="menu" role="dialog" aria-label="Menü">
			<p class="muted">Scheibe {board}</p>
			{#if pendingCount}
				<p class="warn">Noch {pendingCount} Eingabe(n) nicht gesendet. Bitte erst warten, bis „Gespeichert“ erscheint.</p>
			{/if}
			<a class="btn" href="/">Zur Live-Seite</a>
			<a class="btn" href="/board">Andere Scheibe wählen</a>
			<button class="btn" onclick={resetKey}>Board-Schlüssel neu eingeben</button>
			<button class="btn primary" onclick={() => (menuOpen = false)}>Zurück zum Spiel</button>
		</div>
	{/if}

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
							<li>{roundLabel(m)}: {pairName(m)}</li>
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
						{@const pid = slot === 0 ? match.player_a : match.player_b}
						<div class="who" class:isReady>
							<Avatar playerId={pid} size={6.5} ring={isReady} />
							<h2>{names[slot]}</h2>
							<button class="btn readybtn" class:primary={!isReady} disabled={isReady || busy} onclick={() => ready(slot)}>
								{isReady ? 'Bereit ✓' : 'Bereit'}
							</button>
						</div>
						{#if slot === 0}<span class="vs muted">gegen</span>{/if}
					{/each}
				</div>
				<p class="scorer-note">
					{#if scorerName}<strong>{scorerName}</strong> zählt dieses Spiel und gibt die Darts ein.{:else}Zähler offen: Bitte jemanden
						suchen, der die Darts eingibt.{/if}
				</p>
				{#if upcoming.length}
					<p class="muted after">Danach: {pairName(upcoming[0])}</p>
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
				<div class="left">
					<Scoreboard state={sync.state} {names} ids={[match.player_a, match.player_b]} />
					<div class="info">
						<div><span class="muted">Leg</span> <strong class="num">{sync.state.currentLeg + 1}</strong></div>
						<div>
							<span class="muted">Anwurf</span>
							<strong>{names[(match.first_thrower + sync.state.currentLeg) % 2]}</strong>
						</div>
						<div><span class="muted">Zähler</span> <strong>{scorerName ?? 'offen'}</strong></div>
						{#if upcoming[0]}
							<div class="next">
								<span class="muted">Danach</span>
								<strong>{pairName(upcoming[0])}</strong>
							</div>
						{/if}
					</div>
				</div>
				<div class="pad">
					<Keypad onDart={onDart} onUndo={onUndo} canUndo={sync.darts.length > 0} disabled={sync.state.finished || sync.fatal} />
				</div>
			</div>

			{#if flash}
				<div class="flash {flash.tone}" role="status">{flash.text}</div>
			{/if}

			{#if legWin}
				{#key legWin.key}
					<button class="legwin" onclick={() => (legWin = null)} aria-label="Leg gewonnen, antippen zum Schließen">
						<span class="ring" aria-hidden="true"></span>
						<span class="card">
							<Avatar playerId={legWin.slot === 0 ? match.player_a : match.player_b} size={5.5} ring />
							<span class="t">Leg gewonnen</span>
							<span class="n">{names[legWin.slot]}</span>
							<span class="score num">
								<span class:hl={legWin.slot === 0}>{legWin.legs[0]}</span>
								<span class="sep">:</span>
								<span class:hl={legWin.slot === 1}>{legWin.legs[1]}</span>
							</span>
						</span>
					</button>
				{/key}
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
								{pendingCount > 0 ? 'Wird gespeichert …' : `Weiter zum nächsten Spiel (${countdown})`}
							</button>
						</div>
						<div class="countdown" aria-hidden="true"><span style="width: {(countdown / AUTO_NEXT_S) * 100}%"></span></div>
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
	.left {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-height: 0;
	}
	.info {
		display: none;
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
		.info {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.5rem 1rem;
			padding: 0.8rem 1rem;
			border-radius: var(--r-lg);
			border: 1px solid var(--line);
			background: var(--navy-900);
			font-size: 0.95rem;
		}
		.info div {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		.info strong {
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.info .next {
			grid-column: 1 / -1;
		}
	}
	.menu-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 13, 27, 0.6);
		z-index: 40;
	}
	.menu {
		position: fixed;
		top: 4rem;
		right: 0.9rem;
		z-index: 41;
		width: min(20rem, calc(100vw - 1.8rem));
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: var(--r-lg);
		background: var(--navy-850);
		border: 1px solid var(--line-strong);
		box-shadow: 0 16px 50px rgba(0, 0, 0, 0.5);
	}
	.menu p {
		margin: 0 0 0.25rem;
	}
	.menu .btn {
		padding: 0.85rem;
	}
	.menu .warn {
		color: var(--gold);
		font-size: 0.9rem;
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
	.flash.max {
		background: linear-gradient(135deg, var(--red), #a3161f);
		font-size: 4.5rem;
	}
	.scorer {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.15;
		font-size: 0.95rem;
	}
	.scorer .muted {
		font-size: 0.75rem;
	}
	.scorer.open strong {
		color: var(--gold);
	}
	.scorer-note {
		margin: 0.25rem 0 0;
		font-size: 1.1rem;
		color: var(--text-2);
	}
	.who {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.who h2 {
		margin-top: 0.75rem;
	}
	.legwin {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(5, 13, 27, 0.72);
		border: 0;
		color: var(--text);
		cursor: pointer;
		animation: lw-fade 2.8s ease forwards;
	}
	.legwin .ring {
		position: absolute;
		width: 34rem;
		height: 34rem;
		max-width: 90vw;
		max-height: 90vw;
		border-radius: 50%;
		border: 6px solid var(--gold);
		opacity: 0;
		animation: lw-ring 1.2s ease-out 0.1s;
	}
	.legwin .card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		padding: 2rem 3rem;
		border-radius: 24px;
		background: radial-gradient(400px 200px at 50% 0%, rgba(242, 193, 78, 0.35), transparent 70%), var(--navy-850);
		border: 2px solid var(--gold);
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
		animation: lw-pop 0.55s cubic-bezier(0.2, 1.5, 0.4, 1);
	}
	.legwin .t {
		color: var(--gold);
		font-weight: 700;
		font-size: 1.3rem;
		margin-top: 0.5rem;
	}
	.legwin .n {
		font-size: 2.6rem;
		font-weight: 800;
	}
	.legwin .score {
		display: flex;
		gap: 0.6rem;
		font-size: 4.5rem;
		font-weight: 800;
		line-height: 1;
		color: var(--text-2);
	}
	.legwin .score .hl {
		color: var(--gold);
		display: inline-block;
		animation: lw-count 0.7s cubic-bezier(0.2, 1.8, 0.4, 1) 0.35s both;
	}
	@keyframes lw-fade {
		0%,
		85% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes lw-pop {
		from {
			transform: scale(0.5) translateY(30px);
			opacity: 0;
		}
	}
	@keyframes lw-ring {
		0% {
			transform: scale(0.3);
			opacity: 0.9;
		}
		100% {
			transform: scale(1.2);
			opacity: 0;
		}
	}
	@keyframes lw-count {
		0% {
			transform: scale(0.2) rotate(-12deg);
		}
		100% {
			transform: scale(1);
		}
	}
	.countdown {
		margin: 1.25rem auto 0;
		width: min(26rem, 80%);
		height: 0.4rem;
		border-radius: 99px;
		background: var(--navy-800);
		overflow: hidden;
	}
	.countdown span {
		display: block;
		height: 100%;
		background: var(--blue);
		transition: width 0.25s linear;
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
