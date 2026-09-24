"use client";
import { useState } from "react";
import { useBoard } from "@/hooks/useBoard";
import { useBoardStore } from "@/store/boardStore";

interface Props {
  boardId: string;
}

export default function CreateListForm({ boardId }: Props) {
  const { createList } = useBoard();
  const isViewer = useBoardStore((s) => s.currentBoard?.role) === "viewer";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (isViewer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createList(boardId, name.trim());
      setName("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-[272px] sm:w-72 flex-shrink-0 h-12 flex items-center gap-2 px-4 bg-white/70 hover:bg-white rounded-xl text-gray-600 hover:text-gray-900 text-sm font-medium transition border-2 border-dashed border-gray-300 hover:border-gray-400"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Add list
      </button>
    );
  }

  return (
    <div className="w-[272px] sm:w-72 flex-shrink-0 bg-gray-100 rounded-xl p-3">
      <form onSubmit={handleSubmit}>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setName("");
            }
          }}
          placeholder="List name..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60"
          >
            Add List
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setName("");
            }}
            className="p-1.5 text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
