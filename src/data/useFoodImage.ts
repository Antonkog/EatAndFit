import { useEffect, useState } from 'react';
import { getRecipeImage, type FoodEntry } from './db';

export function useFoodImage(entry: Pick<FoodEntry, 'imageUrl' | 'localImageId'>) {
  const [source, setSource] = useState(entry.imageUrl ?? '');

  useEffect(() => {
    if (entry.imageUrl) {
      setSource(entry.imageUrl);
      return;
    }
    if (!entry.localImageId) {
      setSource('');
      return;
    }
    let disposed = false;
    let objectUrl = '';
    void getRecipeImage(entry.localImageId).then((image) => {
      if (!image || disposed) return;
      objectUrl = URL.createObjectURL(image.blob);
      setSource(objectUrl);
    }).catch(() => { if (!disposed) setSource(''); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry.imageUrl, entry.localImageId]);

  return source;
}

