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
        <div className="topbar-inner">
          <button className="brand" onClick={() => setView('exercises')} aria-label="Eat and Fit home">
            <span className="brand-mark"><Dumbbell size={19} /></span>
            <span>EAT AND FIT</span>
          </button>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
                <Icon size={16} />
                <span>{id === 'exercises' ? 'Muscles' : label}</span>
              </button>
            ))}
          </nav>
          <button className={`icon-button settings-button ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')} aria-label="Open settings">
            <Settings size={19} />
          </button>
        </div>
      </header>

      <main className="page">
        {view === 'exercises' ? <ExerciseLibrary /> : view === 'calendar' ? <CalendarView /> : view === 'recipes' ? <RecipeView /> : view === 'scan' ? <ScanView onRecipes={() => setView('recipes')} /> : <SettingsView />}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
            <Icon size={20} />
            <span>{id === 'exercises' ? 'Muscles' : label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

