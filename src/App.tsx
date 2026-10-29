import { CalendarDays, Dumbbell, ScanLine, Settings, Utensils } from 'lucide-react';
import { useState } from 'react';
import { AiRecipeView } from './ai/AiRecipeBuilder';
import { FirebaseAnalytics } from './analytics/FirebaseAnalytics';
import { CalendarView } from './calendar/CalendarView';
import { localDate } from './data/db';
import { ExerciseLibrary } from './exercises/ExerciseLibrary';
import { RecipeView } from './recipes/RecipeView';
import { ScanView, type ScanMode } from './scanner/ScanView';
import { SettingsView } from './settings/SettingsView';

export type View = 'exercises' | 'calendar' | 'recipes' | 'scan' | 'ai' | 'settings';
type PrimaryView = Exclude<View, 'ai' | 'settings'>;

const navigation: Array<{ id: PrimaryView; label: string; icon: typeof Dumbbell }> = [
  { id: 'exercises', label: 'Muscles', icon: Dumbbell },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'recipes', label: 'Recipes', icon: Utensils },
  { id: 'scan', label: 'Scan', icon: ScanLine },
];

export function App() {
  const [view, setView] = useState<View>('exercises');
  const [calendarDate, setCalendarDate] = useState(localDate());
  const [calendarMode, setCalendarMode] = useState<'workout' | 'food'>('workout');
  const [recipeIngredients, setRecipeIngredients] = useState<string[]>([]);
  const [recipeDate, setRecipeDate] = useState(localDate());
  const [aiIngredients, setAiIngredients] = useState<string[]>([]);
  const [aiDate, setAiDate] = useState(localDate());
  const [aiReturnView, setAiReturnView] = useState<'recipes' | 'scan'>('recipes');
  const [scanDate, setScanDate] = useState(localDate());
  const [scanMode, setScanMode] = useState<ScanMode>('photo');

  const activePrimary: PrimaryView | null = view === 'ai' ? aiReturnView : view === 'settings' ? null : view;

  const showView = (next: PrimaryView) => {
    if (next === 'calendar') {
      setCalendarDate(localDate());
      setCalendarMode('workout');
    }
    if (next === 'recipes') setRecipeIngredients([]);
    if (next === 'scan') {
      setScanDate(localDate());
      setScanMode('photo');
    }
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showCalendar = (date: string, mode: 'workout' | 'food') => {
    setCalendarDate(date);
    setCalendarMode(mode);
    setView('calendar');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showRecipes = (ingredients: string[] = [], date = localDate()) => {
    setRecipeIngredients(ingredients);
    setRecipeDate(date);
    setView('recipes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showAi = (ingredients: string[] = [], returnView: 'recipes' | 'scan' = 'recipes', date = localDate()) => {
    setAiIngredients(ingredients);
    setAiDate(date);
    setAiReturnView(returnView);
    setView('ai');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showProductScanner = (date: string) => {
    setScanDate(date);
    setScanMode('barcode');
    setView('scan');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showSettings = () => {
    setView('settings');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <FirebaseAnalytics />
      <header className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => showView('exercises')} aria-label="Eat and Fit home">
            <span className="brand-mark"><Dumbbell size={19} /></span>
            <span>EAT AND FIT</span>
          </button>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button key={id} className={activePrimary === id ? 'active' : ''} onClick={() => showView(id)}>
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <button className={`icon-button settings-button ${view === 'settings' ? 'active' : ''}`} onClick={showSettings} aria-label="Open settings">
            <Settings size={19} />
          </button>
        </div>
      </header>

      <main className="page">
        {view === 'exercises' && <ExerciseLibrary onWorkoutAdded={(date) => showCalendar(date, 'workout')} />}
        {view === 'calendar' && (
          <CalendarView
            initialDate={calendarDate}
            initialMode={calendarMode}
            onBrowse={() => showView('exercises')}
            onRecipes={(date) => showRecipes([], date)}
            onProduct={showProductScanner}
          />
        )}
        {view === 'recipes' && (
          <RecipeView
            key={recipeIngredients.join('\0')}
            initialDate={recipeDate}
            initialIngredients={recipeIngredients}
            onOpenAi={() => showAi([], 'recipes', recipeDate)}
            onAdded={(date) => showCalendar(date, 'food')}
          />
        )}
        {view === 'scan' && (
          <ScanView
            key={`${scanDate}-${scanMode}`}
            initialDate={scanDate}
            initialMode={scanMode}
            onChooseRecipes={showRecipes}
            onOpenAi={(ingredients) => showAi(ingredients, 'scan', scanDate)}
            onAdded={(date) => showCalendar(date, 'food')}
          />
        )}
        {view === 'ai' && (
          <AiRecipeView
            initialDate={aiDate}
            initialRequiredIngredients={aiIngredients}
            backDestination={aiReturnView}
            onBack={() => setView(aiReturnView)}
            onAdded={(date) => showCalendar(date, 'food')}
          />
        )}
        {view === 'settings' && <SettingsView />}
      </main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activePrimary === id ? 'active' : ''} onClick={() => showView(id)}>
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
