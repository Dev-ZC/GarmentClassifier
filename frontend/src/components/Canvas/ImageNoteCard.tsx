import { useEffect, useRef, useState } from 'react';
import type { ImageItem } from '../../types';
import { stopWheelIfScrollable } from '../../utils/scrollChain';
import type { ImageDetails } from './ImagePanels';

// Per-placement note, rendered as a small sticky note that slides out
// beside the cluster. Saves itself (debounced while typing, flushed on
// unmount/close) like a standalone board note.
export function ImageNoteCard({
  image,
  onUpdateDetails,
}: {
  image: ImageItem;
  onUpdateDetails: (id: string, details: ImageDetails) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(image.note ?? '');
  const savedNote = useRef(image.note ?? '');
  const draftRef = useRef(noteDraft);
  draftRef.current = noteDraft;

  useEffect(() => {
    if (noteDraft === savedNote.current) return;
    const timer = setTimeout(() => {
      savedNote.current = noteDraft;
      onUpdateDetails(image.id, { note: noteDraft });
    }, 500);
    return () => clearTimeout(timer);
  }, [noteDraft, image.id, onUpdateDetails]);

  useEffect(
    () => () => {
      if (draftRef.current !== savedNote.current) {
        onUpdateDetails(image.id, { note: draftRef.current });
      }
    },
    [image.id, onUpdateDetails],
  );

  return (
    <div className="image-card-note">
      <span className="image-card-note__label">Note</span>
      <textarea
        className="image-card-note__text"
        value={noteDraft}
        placeholder="Add a note..."
        onChange={(e) => setNoteDraft(e.target.value)}
        onWheel={stopWheelIfScrollable}
      />
    </div>
  );
}
