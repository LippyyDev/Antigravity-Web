'use client';
import { useState, useEffect, useRef } from 'react';
import { AntigravityAccount, UserTag } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface EditFields {
  custom_name: string;
  description: string;
  tags: string[];
  deadline_date: string;
}

interface AccountEditModalProps {
  account: AntigravityAccount;
  ownerUid: string;
  onSave: (fields: EditFields) => Promise<void>;
  onClose: () => void;
}

const TAG_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

export function AccountEditModal({ account, ownerUid, onSave, onClose }: AccountEditModalProps) {
  const [fields, setFields] = useState<EditFields>({
    custom_name: account.custom_name || '',
    description: account.description || '',
    tags: account.tags || [],
    deadline_date: account.deadline_date
      ? new Date(account.deadline_date).toISOString().slice(0, 16)
      : '',
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [allTags, setAllTags] = useState<UserTag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagRef = useRef<HTMLInputElement>(null);

  // Load user's tag library on mount
  useEffect(() => {
    supabase
      .from('user_tags')
      .select('*')
      .eq('owner_uid', ownerUid)
      .order('name')
      .then(({ data }) => { if (data) setAllTags(data as UserTag[]); });
  }, [ownerUid]);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const addTag = async (tagName?: string) => {
    const raw = (tagName ?? tagInput).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!raw || fields.tags.includes(raw) || fields.tags.length >= 10) {
      setTagInput('');
      return;
    }

    // Add to current account's tags
    setFields((f) => ({ ...f, tags: [...f.tags, raw] }));
    setTagInput('');
    setShowSuggestions(false);

    // Save to user_tags library if not already there
    const exists = allTags.find((t) => t.name === raw);
    if (!exists) {
      const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
      const { data } = await supabase
        .from('user_tags')
        .upsert({ owner_uid: ownerUid, name: raw, color }, { onConflict: 'owner_uid,name' })
        .select()
        .single();
      if (data) setAllTags((prev) => [...prev, data as UserTag].sort((a, b) => a.name.localeCompare(b.name)));
    }

    tagRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    setFields((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const deleteTagFromLibrary = async (e: React.MouseEvent, tag: UserTag) => {
    e.stopPropagation();
    await supabase.from('user_tags').delete().eq('id', tag.id);
    setAllTags((prev) => prev.filter((t) => t.id !== tag.id));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && fields.tags.length > 0) {
      removeTag(fields.tags[fields.tags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave(fields);
    setSaving(false);
  };

  // Filtered suggestions based on input
  const filtered = allTags.filter(
    (t) => !fields.tags.includes(t.name) &&
      (tagInput === '' || t.name.includes(tagInput.toLowerCase()))
  );

  const getTagColor = (name: string) =>
    allTags.find((t) => t.name === name)?.color ?? '#6366f1';

  return (
    <div className="modal-overlay" onClick={handleBackdrop}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: '#aaa', letterSpacing: '0.08em' }}>
              EDIT ACCOUNT
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 2 }}>
              {account.email}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#666', lineHeight: 1 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Custom Name */}
            <div className="form-group">
              <label className="label">Custom Name</label>
              <input
                className="input"
                placeholder={account.email || 'My Account'}
                value={fields.custom_name}
                onChange={(e) => setFields((f) => ({ ...f, custom_name: e.target.value }))}
                maxLength={60}
                autoFocus
              />
              <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>
                Replaces the email as card title
              </div>
            </div>

            {/* Description */}
            <div className="form-group">
              <label className="label">Description</label>
              <textarea
                className="textarea"
                placeholder="E.g. Work account for client projects..."
                value={fields.description}
                onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
                maxLength={200}
                rows={3}
              />
              <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>
                {fields.description.length}/200
              </div>
            </div>

            {/* Tags */}
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="label">
                Tags
                <span style={{ fontSize: '0.65rem', fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                  {allTags.length} saved in library
                </span>
              </label>
              <div className="tag-input-wrap">
                {fields.tags.map((tag) => (
                  <span
                    key={tag}
                    className="tag tag-removable"
                    style={{ background: getTagColor(tag) + '22', borderColor: getTagColor(tag), color: getTagColor(tag) }}
                    onClick={() => removeTag(tag)}
                  >
                    {tag} ✕
                  </span>
                ))}
                <input
                  ref={tagRef}
                  className="tag-input"
                  placeholder={fields.tags.length === 0 ? 'Type or pick a tag...' : ''}
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onKeyDown={handleTagKeyDown}
                  disabled={fields.tags.length >= 10}
                />
              </div>

              {/* Tag suggestions dropdown */}
              {showSuggestions && filtered.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'white', border: '2px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                  maxHeight: 200, overflowY: 'auto', marginTop: 4,
                }}>
                  {filtered.map((tag) => (
                    <div
                      key={tag.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', cursor: 'pointer', transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
                      onClick={() => addTag(tag.name)}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: tag.color, display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{tag.name}</span>
                      </span>
                      <button
                        onClick={(e) => deleteTagFromLibrary(e, tag)}
                        style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}
                        title="Remove from library"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>
                Press Enter or comma to add new. {fields.tags.length}/10 tags. New tags auto-saved to library.
              </div>
            </div>

            {/* Deadline */}
            <div className="form-group">
              <label className="label">⏰ Deadline / Reset Date</label>
              <input
                className="input"
                type="datetime-local"
                value={fields.deadline_date}
                onChange={(e) => setFields((f) => ({ ...f, deadline_date: e.target.value }))}
              />
              <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: 4 }}>
                Shows a countdown timer on the card. Leave empty to disable.
              </div>
              {fields.deadline_date && (
                <div style={{ marginTop: 6, fontSize: '0.8rem', fontWeight: 700, color: getDeadlineColor(fields.deadline_date) }}>
                  ⏱ {formatCountdown(fields.deadline_date)}
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              CANCEL
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'SAVING...' : '✓ SAVE CHANGES'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Countdown helpers ────────────────────────────────────────

export function formatCountdown(dateStr: string): string {
  if (!dateStr) return '';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'DEADLINE PASSED';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export function getDeadlineColor(dateStr: string): string {
  if (!dateStr) return '#666';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'var(--red)';
  if (diff < 1000 * 60 * 60 * 24) return 'var(--red)';
  if (diff < 1000 * 60 * 60 * 24 * 3) return 'var(--orange)';
  return 'var(--green)';
}
