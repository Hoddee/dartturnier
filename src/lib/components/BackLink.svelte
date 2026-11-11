<script lang="ts">
	interface Props {
		/** Ziel, falls es keinen Verlauf gibt (z. B. direkt geöffneter Link) */
		fallback: string;
		label?: string;
	}
	let { fallback, label = 'Zurück' }: Props = $props();

	function back(e: MouseEvent) {
		// Innerhalb der Seite zurück; wurde der Link direkt geöffnet, zur Ersatzseite
		if (history.length > 1 && document.referrer.startsWith(location.origin)) {
			e.preventDefault();
			history.back();
		}
	}
</script>

<a class="back" href={fallback} onclick={back}>
	<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"
		><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg
	>
	{label}
</a>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--text-2);
		text-decoration: none;
		font-weight: 600;
		padding: 0.35rem 0.6rem 0.35rem 0.35rem;
		margin-left: -0.35rem;
		border-radius: var(--r-md);
	}
	.back:hover {
		color: var(--text);
		background: var(--navy-800);
	}
</style>
