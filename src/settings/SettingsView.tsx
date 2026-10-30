import { ChevronDown, Download, ExternalLink, KeyRound, ShieldCheck, Trash2, Upload, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { APP_EDITION_LABEL } from '../config/edition';
import { clearData, exportBackup, importBackup, isBackup } from '../data/db';
import { ProfileForm } from '../profile/ProfileForm';
import { legalSources } from './legal';
import {
  getRecognitionKeyStatus,
  removeRecognitionKey,
  RECOGNITION_KEYS_CHANGED,
  saveRecognitionKey,
  setActiveRecognitionProvider,
  type RecognitionKeyStatus,
  type RecognitionProvider,
} from './secureKeys';

export function SettingsView() {
  const input = useRef<HTMLInputElement>(null);
  const [keyStatus, setKeyStatus] = useState<RecognitionKeyStatus>();
  const [metaKey, setMetaKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [keyMessage, setKeyMessage] = useState('');
  const [profileMessage, setProfileMessage] = useState('');

  useEffect(() => {
    if (!__SMART_SCANNER__) return;
    const refresh = () => void getRecognitionKeyStatus().then(setKeyStatus).catch(() => setKeyMessage('Secure key storage is unavailable in this browser.'));
    refresh();
    window.addEventListener(RECOGNITION_KEYS_CHANGED, refresh);
    return () => window.removeEventListener(RECOGNITION_KEYS_CHANGED, refresh);
  }, []);

  const download = async () => {
    const backup = await exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `eat-and-fit-backup-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file?: File) => {
    if (!file) return;
    const value = JSON.parse(await file.text());
    if (!isBackup(value)) throw new Error('Invalid backup file.');
    await importBackup(value);
    window.alert('Backup imported.');
  };

  const remove = async () => {
    if (!window.confirm('Delete all locally stored workouts, meals, and products?')) return;
    await clearData();
    window.dispatchEvent(new Event('eatfit-data-change'));
    window.alert('Local history deleted.');
  };

  const saveKey = async (provider: RecognitionProvider) => {
    const value = provider === 'META' ? metaKey : geminiKey;
    try {
      await saveRecognitionKey(provider, value);
      if (provider === 'META') setMetaKey(''); else setGeminiKey('');
      setKeyMessage('API key set');
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : 'The key could not be saved.');
    }
  };

  const removeKey = async (provider: RecognitionProvider) => {
    const label = provider === 'META' ? 'Meta' : 'Google Gemini';
    if (!window.confirm(`Remove the encrypted ${label} key from this device?`)) return;
    await removeRecognitionKey(provider);
    setKeyMessage(`${label} key removed.`);
  };

  const selectProvider = async (provider: RecognitionProvider) => {
    try {
      await setActiveRecognitionProvider(provider);
      setKeyMessage(`${provider === 'META' ? 'Meta' : 'Google Gemini'} selected for AI features.`);
    } catch (error) {
      setKeyMessage(error instanceof Error ? error.message : 'The provider could not be selected.');
    }
  };

  const hasAnyKey = Boolean(keyStatus?.metaConfigured || keyStatus?.geminiConfigured);

  return (
    <section className="settings">
      <div className="calendar-heading"><div><p className="eyebrow">{APP_EDITION_LABEL}</p><h2>Settings</h2></div></div>
      <article className="settings-card profile-settings">
        <h3><UserRound size={20} /> Personal profile</h3>
        <p>Sex selects matching exercise demonstrations. Weight and height are used for more accurate calorie calculations. We don’t save your personal data, it stays in your own browser.</p>
        <ProfileForm onSaved={() => setProfileMessage('Profile saved.')} />
        {profileMessage && <p className="key-message" role="status">{profileMessage}</p>}
      </article>
      {__SMART_SCANNER__ && (
        <article className="settings-card api-key-settings">
          <h3><KeyRound size={20} /> AI provider keys</h3>
          <p>Smart Scan and AI recipe generation are enabled when the selected provider has a saved key. Your provider may charge your account for API requests.</p>
          <div className="key-security-note">
            <ShieldCheck size={20} />
            <p>Keys are encrypted.</p>
          </div>
          <div className="provider-key-grid">
            <ProviderKeyField label="Meta API key" configured={Boolean(keyStatus?.metaConfigured)} value={metaKey} onChange={setMetaKey} onSave={() => void saveKey('META')} onRemove={() => void removeKey('META')} />
            <ProviderKeyField label="Google Gemini API key" configured={Boolean(keyStatus?.geminiConfigured)} value={geminiKey} onChange={setGeminiKey} onSave={() => void saveKey('GEMINI')} onRemove={() => void removeKey('GEMINI')} />
          </div>
          <label className="active-provider">AI provider
            <select value={hasAnyKey ? keyStatus?.activeProvider : ''} disabled={!hasAnyKey} onChange={(event) => void selectProvider(event.target.value as RecognitionProvider)}>
              {!hasAnyKey && <option value="">No key configured</option>}
              <option value="META" disabled={!keyStatus?.metaConfigured}>Meta{keyStatus?.metaConfigured ? '' : ' · add key first'}</option>
              <option value="GEMINI" disabled={!keyStatus?.geminiConfigured}>Google Gemini{keyStatus?.geminiConfigured ? '' : ' · add key first'}</option>
            </select>
          </label>
          {keyMessage && <p className="key-message" role="status">{keyMessage}</p>}
        </article>
      )}
      <article className="settings-card">
        <h3>Local data</h3>
        <p>Your workout and food history stays in this browser unless you export it.{__SMART_SCANNER__ ? ' API keys are intentionally excluded from backups.' : ''}</p>
        <div className="settings-actions">
          <button className="text-button" onClick={() => void download()}><Download size={17} /> Export backup</button>
          <button className="text-button" onClick={() => input.current?.click()}><Upload size={17} /> Import backup</button>
          <input ref={input} hidden type="file" accept="application/json" onChange={(event) => void upload(event.target.files?.[0]).catch((error: Error) => window.alert(error.message))} />
          <button className="danger-button" onClick={() => void remove()}><Trash2 size={17} /> Delete local history</button>
        </div>
      </article>
      <details className="settings-card legal-disclosure">
        <summary><span><ShieldCheck size={20} /><strong>Legal, data sources &amp; safety</strong><small>Attributions, licenses, AI processing, and safety information</small></span><ChevronDown size={18} /></summary>
        <div className="legal-content">
          <div className="legal-list">
            {legalSources.map((source) => (
              <section key={source.title}>
                <header><h4>{source.title}</h4><span>{source.license}</span></header>
                <p>{source.body}</p>
                <a href={source.href} target="_blank" rel="noreferrer">View source and terms <ExternalLink size={14} /></a>
              </section>
            ))}
          </div>
          <section className="safety">
            <h4>Safety</h4>
            <p>Eat & Fit provides educational exercise and nutrition information, not medical advice. Stop exercising if you experience pain, and consult a qualified healthcare or fitness professional when appropriate.</p>
          </section>
        </div>
      </details>
    </section>
  );
}

function ProviderKeyField({ label, configured, value, onChange, onSave, onRemove }: {
  label: string;
  configured: boolean;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <section className="provider-key-field">
      <header><strong>{label}</strong><span className={configured ? 'configured' : ''}>{configured ? 'Saved' : 'Not set'}</span></header>
      <input type="password" value={value} autoComplete="off" spellCheck={false} placeholder={configured ? 'Enter a replacement key' : 'Paste API key'} aria-label={label} onChange={(event) => onChange(event.target.value)} />
      <div><button className="text-button" disabled={!value.trim()} onClick={onSave}>{configured ? 'Replace key' : 'Save key'}</button>{configured && <button className="danger-button" onClick={onRemove}>Remove</button>}</div>
    </section>
  );
}
