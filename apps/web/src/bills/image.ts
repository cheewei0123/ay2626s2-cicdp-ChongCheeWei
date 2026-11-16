// iPhone photos are several MB and the API accepts at most 5 MB (JPEG or PNG).
// Drawing the photo onto a smaller canvas gives a JPEG of a few hundred KB,
// which uploads faster on mobile data and is still easy for the AI to read.

const MAX_SIDE = 1600; // pixels on the longer side

export async function shrinkImage(file: File): Promise<Blob> {
  const photo = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(photo.width, photo.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(photo.width * scale);
  canvas.height = Math.round(photo.height * scale);
  canvas.getContext('2d')!.drawImage(photo, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('no image'))),
      'image/jpeg',
      0.85,
    ),
  );
}
