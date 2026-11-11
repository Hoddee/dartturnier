<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import Logos from '$lib/components/Logos.svelte';
	import StatusBar from '$lib/components/StatusBar.svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import { loadBoardKey, saveBoardKey } from '$lib/board/config';
	import { store } from '$lib/data/store.svelte';
	import { BOARD_COUNT } from '$lib/logic/plans';

	let board = $state<number | null>(null);
	let key = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		key = loadBoardKey() ?? (store.demo ? 'demo' : '');
	});

	async function start(e: SubmitEvent) {
		e.preventDefault();
		if (!board) {
			error = 'Bitte zuerst die Scheibe auswählen.';
			return;
		}
		busy = true;
		error = null;
		try {
			const ok = await store.backend.checkBoardKey(key.trim());
			if (!ok) {
				error = 'Der Board-Schlüssel stimmt nicht. Die Turnierleitung findet ihn im Admin-Bereich unter Einstellungen.';
				return;
			}
			saveBoardKey(key.trim());
			await goto(`/board/${board}`);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<StatusBar />
<nav class="top"><BackLink fallback="/" label="Zur Live-Seite" /></nav>
<main>
	<Logos size={4} />
	<h1>Scheibe einrichten</h1>
	<p class="muted">Einmal pro iPad. Danach zeigt das iPad automatisch immer das nächste Spiel dieser Scheibe.</p>

	<form onsubmit={start}>
		<fieldset>
			<legend>Welche Scheibe steht hier?</legend>
			<div class="boards">
				{#each Array.from({ length: BOARD_COUNT }, (_, i) => i + 1) as b (b)}
					<button type="button" class="pick num" class:on={board === b} aria-pressed={board === b} onclick={() => (board = b)}>
						{b}
					</button>
				{/each}
			</div>
		</fieldset>

		<label for="key">Board-Schlüssel</label>
		<input id="key" type="password" autocomplete="off" bind:value={key} placeholder="von der Turnierleitung" />

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<button class="btn primary go" type="submit" disabled={busy || !key.trim()}>
			{busy ? 'Prüfe …' : board ? `Scheibe ${board} starten` : 'Scheibe starten'}
		</button>
	</form>

	<p class="tip muted">
		Tipp: In Safari über „Teilen → Zum Home-Bildschirm“ als App ablegen und mit „Geführter Zugriff“ sperren, damit niemand
		die Seite verlässt.
	</p>
</main>

<style>
	.top {
		max-width: 34rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 0;
	}
	main {
		max-width: 34rem;
		margin: 0 auto;
		padding: 1rem 1.25rem 2.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	h1 {
		margin-top: 1.5rem;
	}
	form {
		width: 100%;
		text-align: left;
		margin-top: 1rem;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0 0 1.25rem;
	}
	legend {
		font-weight: 600;
		margin-bottom: 0.5rem;
	}
	.boards {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.75rem;
	}
	.pick {
		height: 5.5rem;
		font-size: 3rem;
		font-weight: 700;
		border-radius: var(--r-lg);
		border: 2px solid var(--line-strong);
		background: var(--navy-850);
		color: var(--text);
		cursor: pointer;
	}
	.pick.on {
		border-color: var(--blue);
		background: var(--blue-strong);
	}
	.go {
		width: 100%;
		margin-top: 1.25rem;
		padding: 0.9rem;
		font-size: 1.15rem;
	}
	.error {
		color: #ff9aa0;
		margin: 0.75rem 0 0;
	}
	.tip {
		margin-top: 2rem;
		font-size: 0.9rem;
	}
</style>
