<script lang="ts">
	import type { Dart, Multiplier } from '$lib/engine/types';

	interface Props {
		disabled?: boolean;
		onDart: (d: Dart) => void;
		onUndo: () => void;
		canUndo: boolean;
	}
	let { disabled = false, onDart, onUndo, canUndo }: Props = $props();

	let mult = $state<Multiplier>(1);
	const numbers = Array.from({ length: 20 }, (_, i) => i + 1);

	function toggle(m: Multiplier) {
		mult = mult === m ? 1 : m;
	}

	function hit(segment: number) {
		if (disabled) return;
		if (segment === 25 && mult === 3) return;
		onDart({ segment, multiplier: segment === 0 ? 1 : mult });
		mult = 1;
	}

	function prefix(n: number) {
		return mult === 3 ? `T${n}` : mult === 2 ? `D${n}` : String(n);
	}
</script>

<div class="pad" class:disabled class:double={mult === 2} class:triple={mult === 3}>
	<div class="mods">
		<button class="mod d" class:on={mult === 2} aria-pressed={mult === 2} onclick={() => toggle(2)} {disabled}>Double</button>
		<button class="mod t" class:on={mult === 3} aria-pressed={mult === 3} onclick={() => toggle(3)} {disabled}>Triple</button>
	</div>
	<div class="nums">
		{#each numbers as n (n)}
			<button class="key num" onclick={() => hit(n)} {disabled}>{prefix(n)}</button>
		{/each}
	</div>
	<div class="extra">
		<button class="key num bull" onclick={() => hit(25)} disabled={disabled || mult === 3}>
			{mult === 2 ? 'Bull 50' : '25'}
		</button>
		<button class="key num miss" onclick={() => hit(0)} {disabled}>0 Fehlwurf</button>
		<button class="key undo" onclick={onUndo} disabled={!canUndo}>Rückgängig</button>
	</div>
</div>

<style>
	.pad {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		height: 100%;
		user-select: none;
		-webkit-user-select: none;
	}
	button {
		font: inherit;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		cursor: pointer;
		border-radius: var(--r-md);
		border: 1px solid var(--line-strong);
		color: var(--text);
		min-height: 3.2rem;
	}
	button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	button:active:not(:disabled) {
		transform: scale(0.97);
		filter: brightness(1.25);
	}
	.mods {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.mod {
		font-weight: 700;
		font-size: 1.3rem;
		background: var(--navy-800);
	}
	.mod.d.on {
		background: #1e7d4d;
		border-color: var(--green);
	}
	.mod.t.on {
		background: #a3161f;
		border-color: var(--red);
	}
	.nums {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		grid-auto-rows: 1fr;
		gap: 0.5rem;
	}
	.key {
		background: var(--navy-800);
		font-size: 2rem;
		font-weight: 700;
	}
	.double .nums .key {
		background: rgba(34, 168, 101, 0.22);
		border-color: rgba(34, 168, 101, 0.6);
	}
	.triple .nums .key {
		background: rgba(236, 35, 48, 0.2);
		border-color: rgba(236, 35, 48, 0.55);
	}
	.extra {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.5rem;
	}
	.extra .key {
		font-size: 1.4rem;
	}
	.bull {
		background: #1e7d4d;
	}
	.double .bull {
		background: #a3161f;
	}
	.undo {
		background: transparent;
		font-weight: 700;
		font-size: 1.3rem;
		border-color: var(--gold);
		color: var(--gold);
	}
</style>
