import { CalendarDays, Dumbbell, ScanLine, Settings, Utensils } from 'lucide-react';
import { useState } from 'react';
import { ExerciseLibrary } from './exercises/ExerciseLibrary';
import { CalendarView } from './calendar/CalendarView';
import { RecipeView } from './recipes/RecipeView';
import { ScanView } from './scanner/ScanView';
import { SettingsView } from './settings/SettingsView';
import { FirebaseAnalytics } from './analytics/FirebaseAnalytics';

export type View = 'exercises' | 'calendar' | 'recipes' | 'scan' | 'settings';

const navigation: Array<{ id: View; label: string; icon: typeof Dumbbell }> = [
  { id: 'exercises', label: 'Exercises', icon: Dumbbell },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'recipes', label: 'Recipes', icon: Utensils },
  { id: 'scan', label: 'Scan', icon: ScanLine },
];

export function App() {
  const [view, setView] = useState<View>('exercises');

  return (
    <div className="app-shell">
      <FirebaseAnalytics />
      <header className="topbar">
        <button className="brand" onClick={() => setView('exercises')} aria-label="Eat and Fit home">
          <span className="brand-mark">E&F</span>
          <span>Eat & Fit</span>
        </button>
        <button className="icon-button" onClick={() => setView('settings')} aria-label="Open settings">
          <Settings size={21} />
        </button>
      </header>

      <main className="page">
        {view !== 'settings' && <section className="hero">
          <p className="eyebrow">MOVE WELL · EAT WELL</p>
          <h1>{view === 'exercises' ? 'Build a stronger routine' : navigation.find((item) => item.id === view)?.label ?? 'Settings'}</h1>
          <p>Simple tools for thoughtful training and everyday nutrition.</p>
        </section>}
        {view === 'exercises' ? <ExerciseLibrary /> : view === 'calendar' ? <CalendarView /> : view === 'recipes' ? <RecipeView /> : view === 'scan' ? <ScanView onRecipes={() => setView('recipes')} /> : <SettingsView />}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

