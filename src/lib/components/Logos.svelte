<script lang="ts">
	interface Props {
		/** Höhe der Logos in rem */
		size?: number;
	}
	let { size = 3.5 }: Props = $props();
</script>

<!-- SCF-Wappen frei stehend (ohne Kreis), Milchhäusle-Stern auf weißem Kreis -->
<div class="logos" style="--s: {size}rem">
	<img class="scf" src="/logos/scf.png" alt="SC 1947 Fornsbach e.V." />
	<span class="x" aria-hidden="true">×</span>
	<span class="star"><img src="/logos/milchhaeusle.png" alt="Milchhäusle" /></span>
</div>

<style>
	.logos {
		display: flex;
		align-items: center;
		gap: calc(var(--s) * 0.18);
		flex-shrink: 0;
	}
	.scf {
		height: var(--s);
		width: auto;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
	}
	.x {
		color: var(--muted);
		font-size: calc(var(--s) * 0.35);
		line-height: 1;
	}
	.star {
		display: grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		padding: calc(var(--s) * 0.12);
		background: #fff;
		border-radius: 50%;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}
	.star img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
</style>
