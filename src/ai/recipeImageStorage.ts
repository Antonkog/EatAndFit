const MAX_SAVED_IMAGE_BYTES = 1_000_000;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressRecipeImage(blob: Blob) {
  const image = await loadImage(blob);
  for (const maximum of [1024, 768, 640]) {
    const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot save the generated recipe photo.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const compressed = await canvasBlob(canvas, 'image/webp', quality) ?? await canvasBlob(canvas, 'image/jpeg', quality);
      if (compressed && compressed.size <= MAX_SAVED_IMAGE_BYTES) return compressed;
    }
  }
  throw new Error('The generated recipe photo is too large to save locally.');
}

