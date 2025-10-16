# lalerapp

This template should help get you started developing with Tauri in vanilla HTML, CSS and Javascript.

## Laravel Dump Viewer

A Tauri desktop application for viewing Laravel dump output with enhanced features:

- **Collapsible dump sections** - Only items with children show caret arrows
- **Syntax highlighting** - JSON and Laravel dump format support  
- **dd() function support** - Symfony VarDumper HTML output rendering
- **Auto-refresh** - Updates every 2 seconds with interaction pause
- **Dark/Light themes** - Automatic theme detection

## Development

### Styling with Tailwind CSS

This project uses Tailwind CSS for utility-first styling:

```bash
# Build CSS (development with watch mode)
npm run build-css

# Build CSS (production, minified)
npm run build-css-prod
```

The source CSS is in `src/input.css` and builds to `src/styles.css`.

### Features

- **Smart collapsing**: Items without children show no caret, items with children are collapsible
- **Ultra-compact layout**: Minimal spacing and clean presentation
- **State persistence**: Collapsible states maintained across refreshes
- **Laravel compatibility**: Handles both text dumps and VarDumper HTML

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
