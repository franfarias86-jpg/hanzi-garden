import { render } from 'preact';
import { App } from './app.jsx';
import { settingsReady } from './lib/store.js';
import './styles.css';

settingsReady.finally(() => render(<App />, document.getElementById('app')));
