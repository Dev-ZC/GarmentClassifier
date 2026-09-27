import type {
  BoardElementItem,
  BoardElementKind,
  BoardElementUpdate,
  BoardImageItem,
  BoardItem,
  BoardNoteItem,
  BoardNoteUpdate,
  FacetItem,
  ImageItem,
  SearchRequest,
  SearchResult,
} from '../types';

// The FastAPI backend runs locally on a fixed port (see backend/run.py).
export const API_BASE_URL = 'http://127.0.0.1:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      message = JSON.parse(body).detail ?? body;
    } catch {
      // Body wasn't JSON; fall back to the raw text.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function resolveImageUrl(image: ImageItem): string {
  return `${API_BASE_URL}${image.url}`;
}

export function listImages(): Promise<ImageItem[]> {
  return request<ImageItem[]>('/api/images');
}

export function uploadImage(file: File, x: number, y: number): Promise<ImageItem> {
  const form = new FormData();
  form.append('file', file);
  form.append('x', String(x));
  form.append('y', String(y));
  return request<ImageItem>('/api/images', { method: 'POST', body: form });
}

export function updateImageSize(id: string, width: number, height: number): Promise<ImageItem> {
  return request<ImageItem>(`/api/images/${id}/size`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ width, height }),
  });
}

export function updateImageTags(id: string, tags: string[]): Promise<ImageItem> {
  return request<ImageItem>(`/api/images/${id}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
}

export function deleteImage(id: string): Promise<void> {
  return request<void>(`/api/images/${id}`, { method: 'DELETE' });
}

export function retagImage(id: string): Promise<ImageItem> {
  return request<ImageItem>(`/api/images/${id}/retag`, { method: 'POST' });
}

export function searchImages(payload: SearchRequest): Promise<SearchResult[]> {
  return request<SearchResult[]>('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getFacets(): Promise<FacetItem[]> {
  const response = await request<{ attribute_tags: FacetItem[] }>('/api/facets');
  return response.attribute_tags;
}

// ---- Fabric swatch bank (separate from the main image library) ----

export function uploadSwatch(file: File): Promise<ImageItem> {
  const form = new FormData();
  form.append('file', file);
  return request<ImageItem>('/api/swatches', { method: 'POST', body: form });
}

export function searchSwatches(payload: SearchRequest): Promise<SearchResult[]> {
  return request<SearchResult[]>('/api/swatches/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getSwatchFacets(): Promise<FacetItem[]> {
  const response = await request<{ attribute_tags: FacetItem[] }>('/api/swatches/facets');
  return response.attribute_tags;
}

export function listBoards(): Promise<BoardItem[]> {
  return request<BoardItem[]>('/api/boards');
}

export function createBoard(name: string): Promise<BoardItem> {
  return request<BoardItem>('/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function renameBoard(id: string, name: string): Promise<BoardItem> {
  return request<BoardItem>(`/api/boards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function deleteBoard(id: string): Promise<void> {
  return request<void>(`/api/boards/${id}`, { method: 'DELETE' });
}

export function listBoardImages(boardId: string): Promise<BoardImageItem[]> {
  return request<BoardImageItem[]>(`/api/boards/${boardId}/images`);
}

export function addImagesToBoard(
  boardId: string,
  imageIds: string[],
  x: number,
  y: number,
): Promise<BoardImageItem[]> {
  return request<BoardImageItem[]>(`/api/boards/${boardId}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_ids: imageIds, x, y }),
  });
}

export function updatePlacementPosition(
  boardId: string,
  imageId: string,
  x: number,
  y: number,
): Promise<BoardImageItem> {
  return request<BoardImageItem>(`/api/boards/${boardId}/images/${imageId}/position`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  });
}

export function updatePlacementDetails(
  boardId: string,
  imageId: string,
  details: { note?: string; info_open?: boolean },
): Promise<BoardImageItem> {
  return request<BoardImageItem>(`/api/boards/${boardId}/images/${imageId}/details`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  });
}

export function removeImageFromBoard(boardId: string, imageId: string): Promise<void> {
  return request<void>(`/api/boards/${boardId}/images/${imageId}`, { method: 'DELETE' });
}

export function listBoardNotes(boardId: string): Promise<BoardNoteItem[]> {
  return request<BoardNoteItem[]>(`/api/boards/${boardId}/notes`);
}

export function createBoardNote(boardId: string, x: number, y: number): Promise<BoardNoteItem> {
  return request<BoardNoteItem>(`/api/boards/${boardId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  });
}

export function updateBoardNote(
  boardId: string,
  noteId: string,
  update: BoardNoteUpdate,
): Promise<BoardNoteItem> {
  return request<BoardNoteItem>(`/api/boards/${boardId}/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
}

export function deleteBoardNote(boardId: string, noteId: string): Promise<void> {
  return request<void>(`/api/boards/${boardId}/notes/${noteId}`, { method: 'DELETE' });
}

// ---- Floating elements (text labels, shapes, arrows) ----

export function listBoardElements(boardId: string): Promise<BoardElementItem[]> {
  return request<BoardElementItem[]>(`/api/boards/${boardId}/elements`);
}

export function createBoardElement(
  boardId: string,
  kind: BoardElementKind,
  x: number,
  y: number,
): Promise<BoardElementItem> {
  return request<BoardElementItem>(`/api/boards/${boardId}/elements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, x, y }),
  });
}

export function updateBoardElement(
  boardId: string,
  elementId: string,
  update: BoardElementUpdate,
): Promise<BoardElementItem> {
  return request<BoardElementItem>(`/api/boards/${boardId}/elements/${elementId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
}

export function deleteBoardElement(boardId: string, elementId: string): Promise<void> {
  return request<void>(`/api/boards/${boardId}/elements/${elementId}`, { method: 'DELETE' });
}
