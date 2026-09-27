import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../api/client';
import type { BoardItem } from '../../types';
import { IconChevronDown, IconLayers, IconPencil, IconPlus, IconTrash } from '../icons';
import './BoardsMenu.css';

interface BoardsMenuProps {
  boards: BoardItem[];
  activeBoardId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function BoardsMenu({
  boards,
  activeBoardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  // Close on any click outside the dropdown.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const commitRename = () => {
    if (editingId && draftName.trim()) onRename(editingId, draftName.trim());
    setEditingId(null);
  };

  return (
    <div className="boards-menu" ref={menuRef}>
      <button
        type="button"
        className="boards-menu__trigger"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <IconLayers size={15} />
        <span className="boards-menu__label">{activeBoard?.name ?? 'Boards'}</span>
        <IconChevronDown size={13} />
      </button>

      {isOpen && (
        <div className="boards-menu__dropdown">
          <div className="boards-menu__list">
            {boards.map((board) => (
              <div
                key={board.id}
                className={`boards-menu__item ${
                  board.id === activeBoardId ? 'boards-menu__item--active' : ''
                }`}
              >
                {board.preview_urls[0] ? (
                  <img
                    className="boards-menu__thumb"
                    src={`${API_BASE_URL}${board.preview_urls[0]}`}
                    alt=""
                  />
                ) : (
                  <span className="boards-menu__thumb boards-menu__thumb--empty" />
                )}

                {editingId === board.id ? (
                  <input
                    className="boards-menu__rename"
                    value={draftName}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="boards-menu__name"
                    onClick={() => {
                      onSelect(board.id);
                      setIsOpen(false);
                    }}
                  >
                    <span>{board.name}</span>
                    <span className="boards-menu__count">
                      {board.image_count} {board.image_count === 1 ? 'image' : 'images'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  className="boards-menu__action"
                  title="Rename board"
                  onClick={() => {
                    setEditingId(board.id);
                    setDraftName(board.name);
                  }}
                >
                  <IconPencil size={13} />
                </button>
                <button
                  type="button"
                  className="boards-menu__action boards-menu__action--delete"
                  title="Delete board (images stay in your library)"
                  onClick={() => onDelete(board.id)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="boards-menu__new"
            onClick={() => {
              onCreate();
              setIsOpen(false);
            }}
          >
            <IconPlus size={13} />
            New board
          </button>
        </div>
      )}
    </div>
  );
}
