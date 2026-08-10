'use client';
import { useState, useEffect, KeyboardEvent } from 'react';
import { User } from 'firebase/auth';
import { supabase } from '@/lib/supabase';
import { formatModelName, detectProvider, MODEL_DISPLAY_NAMES, type ModelEntry } from '@/lib/types';

const PRESET_MODELS = Object.keys(MODEL_DISPLAY_NAMES);

interface Props {
  user: User | null;
  model: ModelEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ModelModal({ user, model, onClose, onSaved }: Props) {
  const isEdit = !!model;

  const [modelId, setModelId] = useState(model?.model_id || '');
  const [customModelId, setCustomModelId] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [customName, setCustomName] = useState(model?.custom_name || '');
  const [description, setDescription] = useState(model?.description || '');
  const [tags, setTags] = useState<string[]>(model?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [quotaPct, setQuotaPct] = useState<string>(model?.quota_percentage?.toString() || '');
  const [resetTime, setResetTime] = useState(model?.reset_time || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resolvedModelId = useCustom ? customModelId : modelId;
  const resolvedProvider = detectProvider(resolvedModelId);

  useEffect(() => {
    if (model) {
      const isPreset = PRESET_MODELS.includes(model.model_id);
      if (!isPreset) {
        setUseCustom(true);
        setCustomModelId(model.model_id);
      }
    }
  }, [model]);

  const addTag = () => {
    const trimmed = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!resolvedModelId) {
      setError('Please select or enter a Model ID.');
      return;
    }

    setSaving(true);
    setError('');

    const pctNum = quotaPct !== '' ? parseFloat(quotaPct) : null;
    if (pctNum !== null && (pctNum < 0 || pctNum > 100)) {
      setError('Quota percentage must be between 0 and 100.');
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.uid,
      model_id: resolvedModelId,
      custom_name: customName.trim() || null,
      description: description.trim() || null,
      tags,
      quota_percentage: pctNum,
      reset_time: resetTime || null,
      provider: resolvedProvider,
      display_name: formatModelName(resolvedModelId),
      last_updated: new Date().toISOString(),
    };

    let result;
    if (isEdit && model) {
      result = await supabase
        .from('model_quota_entries')
        .update(payload)
        .eq('id', model.id);
    } else {
      result = await supabase
        .from('model_quota_entries')
        .insert([{ ...payload, created_at: new Date().toISOString() }]);
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    onSaved();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal fade-in">
        <div className="modal-header">
          <h3>{isEdit ? '✏ EDIT MODEL' : '+ ADD MODEL'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Model ID */}
          <div className="form-group">
            <label className="label">MODEL ID *</label>
            {!useCustom ? (
              <select
                className="select"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={isEdit}
              >
                <option value="">— Select a model —</option>
                {PRESET_MODELS.map((id) => (
                  <option key={id} value={id}>{MODEL_DISPLAY_NAMES[id]} ({id})</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                placeholder="e.g. gemini-custom-v2"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                disabled={isEdit}
              />
            )}
            {!isEdit && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 6 }}
                onClick={() => { setUseCustom((p) => !p); setModelId(''); setCustomModelId(''); }}
              >
                {useCustom ? '← USE PRESET' : 'CUSTOM ID →'}
              </button>
            )}
          </div>

          {/* Provider badge */}
          {resolvedModelId && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="label" style={{ marginBottom: 0 }}>PROVIDER:</span>
              <span className={`provider-badge ${resolvedProvider === 'anthropic' ? 'provider-anthropic' : 'provider-google'}`}>
                {resolvedProvider === 'anthropic' ? 'ANTHROPIC' : 'GOOGLE'}
              </span>
            </div>
          )}

          {/* Custom Name */}
          <div className="form-group">
            <label className="label">CUSTOM NAME</label>
            <input
              className="input"
              placeholder="e.g. My Flash Account #1"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="label">DESCRIPTION</label>
            <textarea
              className="textarea"
              placeholder="Optional notes about this model..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div className="form-group">
            <label className="label">TAGS</label>
            <div className="tag-input-wrap">
              {tags.map((tag) => (
                <span key={tag} className="tag tag-removable" onClick={() => removeTag(tag)}>
                  {tag} ✕
                </span>
              ))}
              <input
                className="tag-input"
                placeholder="Type tag + Enter..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
              />
            </div>
            <p style={{ fontSize: '0.7rem', color: '#999', marginTop: 4 }}>Press Enter or comma to add tags</p>
          </div>

          {/* Quota % (manual override) */}
          <div className="form-group">
            <label className="label">QUOTA % (MANUAL OVERRIDE)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                placeholder="0–100"
                value={quotaPct}
                onChange={(e) => setQuotaPct(e.target.value)}
                style={{ width: 100 }}
              />
              <span style={{ fontWeight: 700 }}>%</span>
              <span style={{ fontSize: '0.75rem', color: '#888' }}>
                (Auto-filled on Refresh)
              </span>
            </div>
          </div>

          {/* Reset Time */}
          <div className="form-group">
            <label className="label">RESET TIME</label>
            <input
              className="input"
              type="datetime-local"
              value={resetTime ? resetTime.slice(0, 16) : ''}
              onChange={(e) => setResetTime(e.target.value ? new Date(e.target.value).toISOString() : '')}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>CANCEL</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'SAVING...' : isEdit ? '✓ SAVE CHANGES' : '+ ADD MODEL'}
          </button>
        </div>
      </div>
    </div>
  );
}
