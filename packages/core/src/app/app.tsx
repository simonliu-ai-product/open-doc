import config from 'virtual:open-doc/config';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AssetsPage } from './routes/assets';
import { Doc } from './routes/doc';
import { DocPreview } from './routes/doc-preview';
import { Home } from './routes/home';
import { HomeShell } from './routes/home-shell';
import { ThemeDetailPage, ThemesGalleryPage } from './routes/themes';

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {config.build.showDocBrowser ? (
          <Route element={<HomeShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/themes" element={<ThemesGalleryPage />} />
            <Route path="/themes/:themeId" element={<ThemeDetailPage />} />
            <Route path="/assets" element={<AssetsPage />} />
          </Route>
        ) : (
          <Route path="/" element={<NotFound />} />
        )}
        <Route path="/d/:docId" element={<Doc />} />
        <Route path="/d/:docId/preview" element={<DocPreview />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="grid h-screen place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">404</p>
        <h1 className="mt-2 font-medium text-xl tracking-tight">Nothing here</h1>
        <Link to="/" className="mt-4 inline-block text-muted-foreground text-xs underline">
          Back to documents
        </Link>
      </div>
    </div>
  );
}
