import { store } from '../data/store.svelte';

/** Rückmeldungen im Admin-Bereich. */
class AdminUi {
	message = $state<{ text: string; tone: 'ok' | 'error' } | null>(null);
	busy = $state(false);
	private timer: ReturnType<typeof setTimeout> | undefined;

	notify(text: string, tone: 'ok' | 'error' = 'ok') {
		this.message = { text, tone };
		clearTimeout(this.timer);
		this.timer = setTimeout(() => (this.message = null), tone === 'error' ? 8000 : 3500);
	}

	/** Führt eine Aktion aus, lädt danach den Stand neu und meldet Erfolg oder Fehler. */
	async run(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
		this.busy = true;
		try {
			await fn();
			await store.reload();
			if (success) this.notify(success);
			return true;
		} catch (e) {
			this.notify(e instanceof Error ? e.message : String(e), 'error');
			await store.reload();
			return false;
		} finally {
			this.busy = false;
		}
	}
}

export const ui = new AdminUi();
