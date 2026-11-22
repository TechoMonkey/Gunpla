import { createRoot } from 'react-dom/client';
import { Lobby } from './pages/Lobby';
import { MatchPage } from './pages/MatchPage';
import { TableView } from './pages/TableView';
import { usePath, useToasts } from './net';
import './styles.css';

function App() {
  const path = usePath();
  const table = path.match(/^\/m\/([^/]+)\/table\/?$/);
  const match = path.match(/^\/m\/([^/]+)\/?$/);
  return (
    <>
      {table ? <TableView key={table[1]} matchId={table[1]} /> : match ? <MatchPage key={match[1]} matchId={match[1]} /> : <Lobby />}
      <Toasts />
    </>
  );
}

function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
