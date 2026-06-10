import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './styles.css';

// no StrictMode: the Pixi canvas must mount exactly once
createRoot(document.getElementById('root')!).render(<App />);
