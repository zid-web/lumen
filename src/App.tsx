import { lazy, Suspense } from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

const Landing = lazy(() => import('./routes/Landing'));
const AppLayout = lazy(() => import('./routes/AppLayout'));
const Library = lazy(() => import('./routes/Library'));
const Reader = lazy(() => import('./routes/Reader'));
const Settings = lazy(() => import('./routes/Settings'));
const Install = lazy(() => import('./routes/Install'));
const Privacy = lazy(() => import('./routes/Privacy'));
const NotFound = lazy(() => import('./routes/NotFound'));

function Fallback() {
  return (
    <div role="status" aria-live="polite" className="grid min-h-dvh place-items-center">
      <span className="size-8 animate-spin rounded-full border-2 border-line border-t-amber" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Library />} />
              <Route path="read/:bookId" element={<Reader />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="/installer" element={<Install />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  );
}
