import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { DEFAULT_SETTINGS, type Change } from '../db-types';
import { deriveAll, toData, type Data } from '../logic/derive';
import { applyChange } from './apply';
import type { Backend } from './backend';
import { MemoryBackend } from './memory-backend';
import { SupabaseBackend } from './supabase-backend';

const DEMO_FLAG = 'dart-turnier-force-demo';

function wantsDemo(): boolean {
	if (!browser) return false;
	try {
		const q = new URLSearchParams(location.search).get('demo');
		if (q === '1') localStorage.setItem(DEMO_FLAG, '1');
		if (q === '0') localStorage.removeItem(DEMO_FLAG);
		return localStorage.getItem(DEMO_FLAG) === '1';
	} catch {
		return false;
	}
}

let backend: Backend | null = null;

/**
 * Supabase, wenn URL und Key gesetzt sind; sonst Demo-Modus im Browser.
 * Mit ?demo=1 lässt sich der Demo-Modus erzwingen, mit ?demo=0 wieder abschalten.
 */
export function getBackend(): Backend {
	if (backend) return backend;
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_ANON_KEY;
	backend = url && key && !wantsDemo() ? new SupabaseBackend(url, key) : new MemoryBackend();
	return backend;
}

const EMPTY: Data = {
	players: [],
	groupPlayers: [],
	matches: [],
	dartsByMatch: {},
	settings: DEFAULT_SETTINGS,
	overrides: []
};

/** Reaktiver Turnierstand für alle Ansichten, live gehalten über Realtime. */
class TournamentStore {
	data = $state.raw<Data>(EMPTY);
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	error = $state<string | null>(null);
	connected = $state(false);
	/** Zeitpunkt der letzten Änderung (für "zuletzt aktualisiert"). */
	updatedAt = $state<Date | null>(null);

	view = $derived(deriveAll(this.data));

	private started = false;
	private loading: Promise<void> | null = null;
	private buffer: Change[] | null = null;

	get backend(): Backend {
		return getBackend();
	}

	get demo(): boolean {
		return this.backend.mode === 'demo';
	}

	start() {
		if (this.started || !browser) return;
		this.started = true;
		this.status = 'loading';
		this.backend.subscribe(
			(c) => this.receive(c),
			(connected) => {
				this.connected = connected;
				// Nach jedem (Wieder-)Verbinden komplett nachladen, damit nichts verpasst wird
				if (connected) void this.reload();
			}
		);
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.reload();
		});
		// Sofort laden, auch falls die Live-Verbindung (WebSocket) länger braucht oder blockiert ist
		void this.reload();
		// Rückfallebene ohne Live-Verbindung: alle 10 Sekunden nachladen
		setInterval(() => {
			if (!this.connected && document.visibilityState === 'visible') void this.reload();
		}, 10_000);
	}

	reload(): Promise<void> {
		if (this.loading) return this.loading;
		this.buffer = [];
		this.loading = (async () => {
			try {
				const snap = await this.backend.loadAll();
				let data = toData(snap);
				for (const c of this.buffer ?? []) if (c.kind !== 'reload') data = applyChange(data, c);
				this.data = data;
				this.status = 'ready';
				this.error = null;
				this.updatedAt = new Date();
			} catch (e) {
				this.error = e instanceof Error ? e.message : String(e);
				if (this.status !== 'ready') this.status = 'error';
			} finally {
				this.buffer = null;
				this.loading = null;
			}
		})();
		return this.loading;
	}

	private receive(c: Change) {
		if (c.kind === 'reload') {
			void this.reload();
			return;
		}
		if (this.buffer) this.buffer.push(c);
		this.applyLocal(c);
	}

	/** Änderung sofort lokal übernehmen (z. B. nach erfolgreichem Speichern am iPad). */
	applyLocal(c: Change) {
		this.data = applyChange(this.data, c);
		this.updatedAt = new Date();
	}
}

export const store = new TournamentStore();
