/**
 * Verkleinert ein Foto im Browser auf ein quadratisches JPEG (Mitte ausgeschnitten).
 * 320 × 320 Pixel mit Qualität 0,82 ergibt meist 15–35 KB – wenig Datenverkehr für Supabase.
 */
export async function shrinkPhoto(file: File, size = 320, quality = 0.82): Promise<Blob> {
	if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen');
	const url = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const i = new Image();
			i.onload = () => resolve(i);
			i.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden (Format z. B. HEIC nicht unterstützt)'));
			i.src = url;
		});
		const side = Math.min(img.naturalWidth, img.naturalHeight);
		const sx = (img.naturalWidth - side) / 2;
		// Bei Hochformat etwas weiter oben ansetzen, damit der Kopf drin bleibt
		const sy = img.naturalHeight > img.naturalWidth ? (img.naturalHeight - side) * 0.25 : (img.naturalHeight - side) / 2;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Bildbearbeitung wird von diesem Browser nicht unterstützt');
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', quality)
		);
	} finally {
		URL.revokeObjectURL(url);
	}
}
