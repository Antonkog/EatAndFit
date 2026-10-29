import { Download, ExternalLink, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clearData, exportBackup, importBackup, isBackup } from '../data/db';
import { legalSources } from './legal';

type AiHealth = { provider: string; model: string; configured: boolean };

function configurationLabel(value?: AiHealth) {
  return value ? `${value.provider} · ${value.model}${value.configured ? '' : ' · not configured'}` : 'Unavailable';
}

export function SettingsView() {
  const input = useRef<HTMLInputElement>(null);
  const [recipeAi, setRecipeAi] = useState<AiHealth>();
  const [recognition, setRecognition] = useState<AiHealth>();

  useEffect(() => {
    void fetch('/api/ai/recipes/meta')
      .then((response) => response.ok ? response.json() as Promise<AiHealth> : undefined)
      .then(setRecipeAi)
      .catch(() => undefined);
    void fetch('/api/ai/ingredients/healthz')
      .then((response) => response.ok ? response.json() as Promise<AiHealth> : undefined)
      .then(setRecognition)
      .catch(() => undefined);
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

  return (
    <section className="settings">
      <div className="calendar-heading"><div><p className="eyebrow">Your app</p><h2>Settings</h2></div></div>
      <article className="settings-card">
        <h3>Local data</h3>
        <p>Your workout and food history stays in this browser unless you export it.</p>
        <div className="settings-actions">
          <button className="text-button" onClick={() => void download()}><Download size={17} /> Export backup</button>
          <button className="text-button" onClick={() => input.current?.click()}><Upload size={17} /> Import backup</button>
          <input ref={input} hidden type="file" accept="application/json" onChange={(event) => void upload(event.target.files?.[0]).catch((error: Error) => window.alert(error.message))} />
          <button className="danger-button" onClick={() => void remove()}><Trash2 size={17} /> Delete local history</button>
        </div>
      </article>
      <article className="settings-card">
        <h3><ShieldCheck size={20} /> Legal, data sources, and AI</h3>
        <div className="legal-list">
          {legalSources.map((source) => (
            <section key={source.title}>
              <header><h4>{source.title}</h4><span>{source.license}</span></header>
              <p>{source.body}</p>
              <a href={source.href} target="_blank" rel="noreferrer">View source and terms <ExternalLink size={14} /></a>
            </section>
          ))}
        </div>
        <section className="ai-disclosure">
          <h4>AI services</h4>
          <p>AI inference costs are paid by the application author. Recipe text is sent to the configured recipe model. Compressed photos leave the app for the selected ingredient-recognition provider. Generated recipes and recognized ingredients require user review.</p>
          <p><strong>Recipe generation:</strong> {configurationLabel(recipeAi)}</p>
          <p><strong>Ingredient recognition:</strong> {configurationLabel(recognition)}</p>
        </section>
        <section className="safety">
          <h4>Safety</h4>
          <p>Eat & Fit provides educational exercise and nutrition information, not medical advice. Stop exercising if you experience pain, and consult a qualified healthcare or fitness professional when appropriate.</p>
        </section>
      </article>
    </section>
  );
}
