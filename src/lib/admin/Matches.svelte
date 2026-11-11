<script lang="ts">
	import { store } from '$lib/data/store.svelte';
	import { matchState, nameOf, roundLabel } from '$lib/logic/derive';
	import { BOARD_COUNT } from '$lib/logic/plans';
	import type { MatchRow } from '$lib/db-types';
	import { ui } from './ui.svelte';

	let filter = $state<'open' | 'live' | 'finished' | 'all'>('open');
	let boardFilter = $state<number | 0>(0);
	let editing = $state<string | null>(null);
	let legsA = $state(0);
	let legsB = $state(0);

	const names = $derived(store.view.players);
	const list = $derived(
		store.data.matches
			.filter((m) => {
				if (boardFilter && m.board !== boardFilter) return false;
				if (filter === 'open') return m.status !== 'finished';
				if (filter === 'all') return true;
				return m.status === filter;
			})
			.sort(
				(a, b) =>
					(a.stage === b.stage ? 0 : a.stage === 'group' ? -1 : 1) ||
					(a.queue_index ?? 0) - (b.queue_index ?? 0) ||
					(a.board ?? 0) - (b.board ?? 0)
			)
	);

	function statusText(m: MatchRow) {
		if (m.status === 'live') {
			if (!m.first_thrower_set) return 'Ausbullen';
			const s = matchState(m, store.data.dartsByMatch[m.id]);
			return `läuft · ${s.remaining[0]} / ${s.remaining[1]}`;
		}
		if (m.status === 'finished') return 'beendet';
		if (!m.player_a || !m.player_b) return 'wartet auf Spieler';
		const r = [m.ready_a && nameOf(names, m.player_a), m.ready_b && nameOf(names, m.player_b)].filter(Boolean);
		return r.length ? `bereit: ${r.join(', ')}` : 'geplant';
	}

	function setBoard(m: MatchRow, e: Event) {
		const v = Number((e.target as HTMLSelectElement).value);
		void ui.run(() => store.backend.updateMatch(m.id, { board: v || null }), `${m.id} auf Scheibe ${v}`);
	}

	function reset(m: MatchRow) {
		if (!confirm(`Spiel ${nameOf(names, m.player_a)} – ${nameOf(names, m.player_b)} komplett zurücksetzen? Alle Darts werden gelöscht.`))
			return;
		void ui.run(() => store.backend.resetMatch(m.id), 'Spiel zurückgesetzt');
	}

	function startEdit(m: MatchRow) {
		editing = m.id;
		legsA = m.legs_a;
		legsB = m.legs_b;
	}

	async function saveResult(m: MatchRow) {
		const max = m.legs_to_win;
		if (legsA === legsB || Math.max(legsA, legsB) !== max || Math.min(legsA, legsB) < 0) {
			ui.notify(`Ungültiges Ergebnis: Der Sieger braucht genau ${max} Legs.`, 'error');
			return;
		}
		const ok = await ui.run(
			() =>
				store.backend.updateMatch(m.id, {
					legs_a: legsA,
					legs_b: legsB,
					status: 'finished',
					winner_id: legsA > legsB ? m.player_a : m.player_b,
					finished_at: new Date().toISOString()
				}),
			'Ergebnis eingetragen'
		);
		if (ok) editing = null;
	}
</script>

<section class="panel">
	<div class="filters">
		<div class="seg" role="group" aria-label="Status">
			{#each [['open', 'Offen'], ['live', 'Laufend'], ['finished', 'Beendet'], ['all', 'Alle']] as [v, l] (v)}
				<button class:on={filter === v} aria-pressed={filter === v} onclick={() => (filter = v as typeof filter)}>{l}</button>
			{/each}
		</div>
		<select bind:value={boardFilter} aria-label="Scheibe">
			<option value={0}>Alle Scheiben</option>
			{#each Array.from({ length: BOARD_COUNT }, (_, i) => i + 1) as b (b)}<option value={b}>Scheibe {b}</option>{/each}
		</select>
	</div>

	{#if list.length === 0}
		<p class="muted">Keine Spiele in dieser Ansicht.</p>
	{:else}
		<div class="scroll">
			<table class="data">
				<thead>
					<tr>
						<th>Runde</th>
						<th>Spiel</th>
						<th class="n">Legs</th>
						<th>Status</th>
						<th>Scheibe</th>
						<th><span class="sr-only">Aktionen</span></th>
					</tr>
				</thead>
				<tbody>
					{#each list as m (m.id)}
						<tr class={m.status}>
							<td class="r">{roundLabel(m)}</td>
							<td>{nameOf(names, m.player_a, 'offen')} – {nameOf(names, m.player_b, 'offen')}</td>
							<td class="n">{m.legs_a}:{m.legs_b}</td>
							<td>
								{#if m.status === 'live'}<span class="live-dot"></span>{/if}
								{statusText(m)}
							</td>
							<td>
								<select value={m.board ?? 0} onchange={(e) => setBoard(m, e)} disabled={m.status !== 'scheduled' || ui.busy} aria-label="Scheibe">
									{#each Array.from({ length: BOARD_COUNT }, (_, i) => i + 1) as b (b)}<option value={b}>{b}</option>{/each}
								</select>
							</td>
							<td class="actions">
								{#if editing === m.id}
									<span class="edit">
										<input type="number" min="0" max={m.legs_to_win} bind:value={legsA} aria-label="Legs links" />
										:
										<input type="number" min="0" max={m.legs_to_win} bind:value={legsB} aria-label="Legs rechts" />
										<button class="btn small primary" onclick={() => saveResult(m)} disabled={ui.busy}>Speichern</button>
										<button class="btn small" onclick={() => (editing = null)}>Abbrechen</button>
									</span>
								{:else}
									{#if m.player_a && m.player_b}
										<button class="btn small" onclick={() => startEdit(m)} disabled={ui.busy}>Ergebnis eintragen</button>
									{/if}
									{#if m.status !== 'scheduled' || m.ready_a || m.ready_b}
										<button class="btn small danger" onclick={() => reset(m)} disabled={ui.busy}>Zurücksetzen</button>
									{/if}
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
	<p class="muted note">
		„Ergebnis eintragen“ ist für den Notfall (z. B. iPad ausgefallen): Es zählt für die Tabelle, ohne Darts für die
		Statistik. „Zurücksetzen“ löscht alle Darts eines Spiels, danach startet es an der Scheibe neu.
	</p>
</section>

<style>
	.filters {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.filters select {
		width: auto;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--line-strong);
		border-radius: var(--r-md);
		overflow: hidden;
	}
	.seg button {
		background: none;
		border: 0;
		padding: 0.5rem 0.9rem;
		color: var(--text-2);
		cursor: pointer;
		font-weight: 600;
	}
	.seg button.on {
		background: var(--blue-strong);
		color: var(--text);
	}
	.scroll {
		overflow-x: auto;
	}
	td select {
		width: 4.2rem;
		padding: 0.3em 0.4em;
	}
	.r {
		white-space: nowrap;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.actions {
		white-space: nowrap;
		text-align: right;
	}
	.actions .btn + .btn {
		margin-left: 0.35rem;
	}
	.edit input {
		width: 3.6rem;
		padding: 0.3em 0.4em;
	}
	tr.finished td {
		color: var(--text-2);
	}
	.note {
		font-size: 0.85rem;
		margin-bottom: 0;
	}
</style>
