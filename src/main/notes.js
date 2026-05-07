'use strict';

const { randomUUID } = require('crypto');
const Store = require('electron-store');

const store = new Store({ name: 'notes' });

/**
 * Note shape:
 * {
 *   id:        string   — stable UUID
 *   text:      string   — note body (multi-line allowed)
 *   done:      boolean  — ticked / completed
 *   createdAt: number   — Unix timestamp ms
 *   doneAt:    number   — Unix ms when ticked, or null
 * }
 */

function getNotes() {
  return store.get('notes', []);
}

function addNote(text) {
  const id   = randomUUID();
  const note = { id, text: String(text || ''), done: false, createdAt: Date.now(), doneAt: null };
  const list = getNotes();
  list.push(note);
  store.set('notes', list);
  return id;
}

function toggleNote(id) {
  const list = getNotes();
  const idx  = list.findIndex(n => n.id === id);
  if (idx === -1) return;
  const done = !list[idx].done;
  list[idx]  = { ...list[idx], done, doneAt: done ? Date.now() : null };
  store.set('notes', list);
}

function removeNote(id) {
  store.set('notes', getNotes().filter(n => n.id !== id));
}

function updateNote(id, patch) {
  const list = getNotes();
  const idx  = list.findIndex(n => n.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  store.set('notes', list);
}

module.exports = { getNotes, addNote, toggleNote, removeNote, updateNote };
