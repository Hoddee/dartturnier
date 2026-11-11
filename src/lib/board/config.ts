/** Einstellungen des iPads (bleiben auf dem Gerät gespeichert). */
const KEY = 'dart-board-key';

export function loadBoardKey(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

export function saveBoardKey(value: string) {
	try {
		localStorage.setItem(KEY, value);
	} catch {
		/* privater Modus */
	}
}

export function clearBoardKey() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* ignorieren */
	}
}
