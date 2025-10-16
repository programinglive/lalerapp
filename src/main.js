const { invoke } = window.__TAURI__.core;

let dumpContainer;
const openDumpIds = new Set();
let hasRenderedOnce = false;
const innerOpenSet = new Set();
let refreshLockUntil = 0;

function createDumpId(dump, index) {
  const parts = [dump.timestamp, dump.file ?? "", dump.line ?? "", index];
  return parts.join("|");
}

function formatLaravelLabel(text) {
  if (!text) return '';
  let t = String(text).trim();
  // remove Laravel object id anywhere e.g., {#959} or #959
  t = t.replace(/\s*(?:\{?#\d+\}?)/g, '');
  // also remove (#959) pattern just in case
  t = t.replace(/\s*\(#\d+\)/g, '');
  // normalize array header: "array:10 [" -> "array 10"
  t = t.replace(/array:(\d+)\s*\[/g, 'array $1');
  // in case there is a colon before array count like '#items: array:10 [' keep key and normalize
  t = t.replace(/(#\w+:\s*)array:(\d+)\s*\[/g, '$1array $2');
  // remove any trailing opening bracket after array count
  t = t.replace(/(array\s+\d+)\s*\[$/, '$1');
  // remove any trailing structural characters
  t = t.replace(/[\[\]{}]+$/, '');
  // collapse multiple spaces and trim
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

async function loadDumps(force = false) {
  if (!force && Date.now() <= refreshLockUntil) {
    return;
  }
  try {
    const dumps = await invoke("get_dumps");
    displayDumps(dumps);
  } catch (error) {
    console.error("Failed to load dumps:", error);
  }
}

async function clearDumps() {
  try {
    await invoke("clear_dumps");
    displayDumps([]);
  } catch (error) {
    console.error("Failed to clear dumps:", error);
  }
}

function displayDumps(dumps) {
  if (!dumps || dumps.length === 0) {
    dumpContainer.innerHTML = '<p id="no-dumps" class="no-dumps">No dumps available</p>';
    openDumpIds.clear();
    hasRenderedOnce = false;
    return;
  }

  const currentIds = new Set();
  const prevInnerOpen = new Set();
  if (dumpContainer) {
    dumpContainer.querySelectorAll('details[data-node-path]').forEach((d) => {
      if (d.open && d.dataset.nodePath) {
        prevInnerOpen.add(d.dataset.nodePath);
      }
    });
  }
  const dumpsHtml = dumps
    .map((dump, index) => `
      ${(() => {
        const id = createDumpId(dump, index);
        currentIds.add(id);
        const isOpen = openDumpIds.has(id) || (!hasRenderedOnce && index === 0);
        const output = dump.output ?? "";
        const lineCount = output.length ? output.split(/\r?\n/).length : 0;
        const metaItems = [
          dump.file ? `${dump.file}${dump.line ? `:${dump.line}` : ""}` : null,
          lineCount ? `${lineCount} line${lineCount === 1 ? "" : "s"}` : null,
          `${output.length} chars`
        ].filter(Boolean);
        const metaHtml = metaItems
          .map((item) => `<span class="dump-meta-item">${escapeHtml(item)}</span>`)
          .join('<span class="dump-meta-separator">•</span>');

        return `
        <details class="dump-item"${isOpen ? " open" : ""} data-dump-id="${escapeHtml(id)}">
          <summary class="dump-summary">
            <div class="dump-summary-content">
              <div class="dump-summary-row primary">
                <span class="dump-timestamp">${new Date(dump.timestamp).toLocaleString()}</span>
                ${dump.type ? `<span class="dump-type">${escapeHtml(dump.type)}</span>` : ""}
              </div>
              <div class="dump-summary-row meta">
                ${metaHtml || '<span class="dump-meta-item">No additional info</span>'}
              </div>
            </div>
          </summary>
          <div class="dump-output">${formatDumpOutput(output)}</div>
        </details>
        `;
      })()}
    `).join("");

  dumpContainer.innerHTML = dumpsHtml;
  // wire Symfony VarDumper interactions if present
  wireSfDumpInteractions(dumpContainer);
  // restore inner open states
  if (prevInnerOpen.size) {
    innerOpenSet.clear();
    prevInnerOpen.forEach((k) => innerOpenSet.add(k));
  }
  dumpContainer.querySelectorAll('details[data-node-path]').forEach((d) => {
    const key = d.dataset.nodePath;
    if (!key) return;
    if (innerOpenSet.has(key)) d.open = true;
    d.addEventListener('toggle', () => {
      if (d.open) innerOpenSet.add(key);
      else innerOpenSet.delete(key);
      refreshLockUntil = Date.now() + 4000; // pause refresh 4s after user interaction
    });
  });
  // Any details toggle (outer or inner) pauses refresh briefly
  dumpContainer.querySelectorAll('details').forEach((d) => {
    d.addEventListener('toggle', () => {
      refreshLockUntil = Date.now() + 4000;
    });
  });
  hasRenderedOnce = true;

  Array.from(openDumpIds).forEach((id) => {
    if (!currentIds.has(id)) {
      openDumpIds.delete(id);
    }
  });

  dumpContainer.querySelectorAll('.dump-item').forEach((item) => {
    const id = item.dataset.dumpId;
    if (!id) {
      return;
    }

    item.addEventListener('toggle', () => {
      if (item.open) {
        openDumpIds.add(id);
      } else {
        openDumpIds.delete(id);
      }
    });

    if (item.open) {
      openDumpIds.add(id);
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isValidJSON(str) {
  if (!str || typeof str !== 'string') return false;
  
  const trimmed = str.trim();
  if (!trimmed) return false;
  
  // Check if it starts and ends with JSON object/array markers
  const startsWithBrace = trimmed.startsWith('{') && trimmed.endsWith('}');
  const startsWithBracket = trimmed.startsWith('[') && trimmed.endsWith(']');
  
  if (!startsWithBrace && !startsWithBracket) {
    return false;
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

function renderJSONValue(value, depth = 0, path = '') {
  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);
  
  if (value === null) {
    return '<span class="json-null">null</span>';
  }
  
  if (typeof value === 'boolean') {
    return `<span class="json-boolean">${value}</span>`;
  }
  
  if (typeof value === 'number') {
    return `<span class="json-number">${value}</span>`;
  }
  
  if (typeof value === 'string') {
    return `<span class="json-string">"${escapeHtml(value)}"</span>`;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="json-bracket">[]</span>';
    }
    
    const items = value.map((item, index) => {
      const itemPath = `${path}[${index}]`;
      const renderedItem = renderJSONValue(item, depth + 1, itemPath);
      return `${nextIndent}${renderedItem}`;
    }).join(',\n');
    
    return `<span class="json-bracket">[</span>\n${items}\n${indent}<span class="json-bracket">]</span>`;
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return '<span class="json-bracket">{}</span>';
    }
    
    const items = keys.map((key, index) => {
      const keyPath = path ? `${path}.${key}` : key;
      const renderedValue = renderJSONValue(value[key], depth + 1, keyPath);
      const comma = index < keys.length - 1 ? ',' : '';
      return `${nextIndent}<span class="json-key">"${escapeHtml(key)}"</span><span class="json-colon">:</span> ${renderedValue}${comma}`;
    }).join('\n');
    
    return `<span class="json-bracket">{</span>\n${items}\n${indent}<span class="json-bracket">}</span>`;
  }
  
  return escapeHtml(String(value));
}

function renderJSONCollapsible(jsonObj, depth = 0, path = '', isRoot = false) {
  const indent = '  '.repeat(depth);
  
  if (typeof jsonObj !== 'object' || jsonObj === null) {
    return renderJSONValue(jsonObj, depth, path);
  }
  
  if (Array.isArray(jsonObj)) {
    if (jsonObj.length === 0) {
      return '<span class="json-bracket">[]</span>';
    }
    
    if (jsonObj.length <= 3 && depth > 0) {
      return renderJSONValue(jsonObj, depth, path);
    }
    
    const summary = `<span class="json-bracket">[</span> <span class="json-summary">${jsonObj.length} items</span> <span class="json-bracket">]</span>`;
    const items = jsonObj.map((item, index) => {
      const itemPath = `${path}[${index}]`;
      if (typeof item === 'object' && item !== null) {
        return `<div class="json-item">${renderJSONCollapsible(item, depth + 1, itemPath)}</div>`;
      }
      return `<div class="json-item"><span class="json-indent">${'  '.repeat(depth + 1)}</span>${renderJSONValue(item, depth + 1, itemPath)}</div>`;
    }).join('');
    
    return `<details class="json-collapsible" ${isRoot ? 'open' : ''} data-node-path="json:${escapeHtml(path || 'root')}"><summary class="json-toggle">${summary}</summary><div class="json-content">${items}</div></details>`;
  }
  
  const keys = Object.keys(jsonObj);
  if (keys.length === 0) {
    return '<span class="json-bracket">{}</span>';
  }
  
  if (keys.length <= 2 && depth > 0) {
    return renderJSONValue(jsonObj, depth, path);
  }
  
  const summary = `<span class="json-bracket">{</span> <span class="json-summary">${keys.length} properties</span> <span class="json-bracket">}</span>`;
  const items = keys.map(key => {
    const keyPath = path ? `${path}.${key}` : key;
    const value = jsonObj[key];
    if (typeof value === 'object' && value !== null) {
      return `<div class="json-item"><span class="json-key">"${escapeHtml(key)}"</span><span class="json-colon">:</span> ${renderJSONCollapsible(value, depth + 1, keyPath)}</div>`;
    }
    return `<div class="json-item"><span class="json-indent">${'  '.repeat(depth + 1)}</span><span class="json-key">"${escapeHtml(key)}"</span><span class="json-colon">:</span> ${renderJSONValue(value, depth + 1, keyPath)}</div>`;
  }).join('');
  
  return `<details class="json-collapsible" ${isRoot ? 'open' : ''} data-node-path="json:${escapeHtml(path || 'root')}"><summary class="json-toggle">${summary}</summary><div class="json-content">${items}</div></details>`;
}

function isLaravelDump(text) {
  const patterns = [
    /Illuminate\\[\w\\]+/,
    /#items: array:\d+/,
    /#\w+: [\w\\:]+/,
    /^\s*\d+ => /m
  ];
  
  return patterns.some(pattern => pattern.test(text));
}

function parseLaravelDump(text) {
  const lines = text.split('\n').map(line => line.trimEnd());
  const result = { type: 'laravel-dump', children: [] };
  
  let stack = [result];
  let lastIndent = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    if (!content) continue; // skip truly empty content
    // skip pure bracket/brace lines from Laravel dumps (opening or closing, optional comma)
    if (/^[\]}]+,?$/.test(content)) continue;
    if (/^[\[{]+$/.test(content)) continue;
    // skip lines that are just whitespace or structural noise
    if (/^\s*$/.test(content)) continue;
    
    // Determine the depth based on indentation (every 2 spaces = 1 level)
    const depth = Math.floor(indent / 2);
    
    // Adjust stack to current depth
    while (stack.length > depth + 1) {
      stack.pop();
    }
    
    const parent = stack[stack.length - 1];
    
    // Check if next lines are indented (indicating this item has children)
    const hasChildren = i < lines.length - 1 && 
      lines[i + 1].trim() && 
      (lines[i + 1].length - lines[i + 1].trimStart().length) > indent;
    
    // Parse different line types
    if (content.match(/^\w+\\[\w\\]+/)) {
      // Class name line
      const item = {
        type: 'class',
        content: content,
        children: [],
        collapsible: true
      };
      parent.children.push(item);
      stack.push(item);
    } else if (content.match(/^#\w+:/)) {
      // Property line - only collapsible if it has children
      const item = {
        type: 'property',
        content: content,
        children: [],
        collapsible: hasChildren
      };
      parent.children.push(item);
      if (hasChildren) {
        stack.push(item);
      }
    } else if (content.match(/^\d+ =>/)) {
      // Array item - only collapsible if it has children
      const item = {
        type: 'array-item',
        content: content,
        children: [],
        collapsible: hasChildren
      };
      parent.children.push(item);
      if (hasChildren) {
        stack.push(item);
      }
    } else if (content.match(/^"\w+" =>/)) {
      // Object property
      const item = {
        type: 'object-property',
        content: content,
        children: [],
        collapsible: hasChildren
      };
      parent.children.push(item);
      if (hasChildren) {
        stack.push(item);
      }
    } else {
      // Generic content
      const item = {
        type: 'content',
        content: content,
        children: [],
        collapsible: hasChildren
      };
      parent.children.push(item);
      if (hasChildren) {
        stack.push(item);
      }
    }
    
    lastIndent = indent;
  }
  
  return result;
}

function renderLaravelDumpItem(item, depth = 0, path = 'root') {
  const indent = '  '.repeat(depth);
  const displayContent = formatLaravelLabel(item.content);
  const escapedContent = stylizeLaravelSummary(displayContent);
  
  let className = 'laravel-dump-item';
  let summaryClass = '';
  
  switch (item.type) {
    case 'class':
      className += ' laravel-class';
      summaryClass = 'laravel-class';
      break;
    case 'property':
      className += ' laravel-property';
      summaryClass = 'laravel-property';
      break;
    case 'array-item':
      className += ' laravel-array-item';
      summaryClass = 'laravel-array-item';
      break;
    case 'object-property':
      className += ' laravel-object-property';
      summaryClass = 'laravel-object-property';
      break;
  }
  
  // Check if item actually has children to determine if it should be collapsible
  const hasChildren = item.children && item.children.length > 0;
  
  if (item.collapsible && hasChildren) {
    const childrenHtml = item.children
      .map((child, i) => renderLaravelDumpItem(child, depth + 1, `${path}.${i}`))
      .join('');
    
    // Only open by default for top-level items
    const isOpen = depth === 0 ? 'open' : '';
    
    return `<details class="laravel-collapsible" ${isOpen} data-node-path="laravel:${escapeHtml(path)}"><summary class="${summaryClass}">${escapedContent}</summary><div class="laravel-content">${childrenHtml}</div></details>`;
  }
  
  // For items without children, use simple div without caret
  const nonCollapsibleClass = className + ' laravel-no-children';
  return `<div class="${nonCollapsibleClass}">${escapedContent}</div>`;
}

function stylizeLaravelSummary(text) {
  // escape first, then add spans safely
  let t = escapeHtml(text);
  // highlight leading keys like #items:
  t = t.replace(/^#([A-Za-z_][\w]*)\s*:/, '<span class="dd-key">#$1</span>:');
  // highlight array count
  t = t.replace(/\barray\s+(\d+)\b/, '<span class="dd-note">array</span> <span class="dd-count">$1</span>');
  // highlight class path e.g., App\\Models\\User
  t = t.replace(/([A-Za-z_][\w]*(?:\\[A-Za-z_][\w]*)+)/, '<span class="dd-class">$1</span>');
  // dim arrows and equals
  t = t.replace(/=&gt;/g, '<span class="dd-arrow">=&gt;</span>');
  return t;
}

function tryParseAsJSON(text) {
  // Try direct JSON parsing first
  if (isValidJSON(text)) {
    try {
      return JSON.parse(text.trim());
    } catch {
      return null;
    }
  }
  
  return null;
}

function formatDumpOutput(output) {
  if (!output || typeof output !== 'string') {
    return `<pre>${escapeHtml(String(output || ''))}</pre>`;
  }
  
  const trimmed = output.trim();
  // Detect Symfony VarDumper HTML output
  const isSfDumpHtml = /<pre[^>]*class=["'][^"']*sf-dump[^"']*["'][^>]*>/i.test(trimmed);
  if (isSfDumpHtml) {
    return `<div class="sf-dump-wrapper">${trimmed}</div>`;
  }
  
  // Debug logging
  console.log('Processing output:', {
    length: trimmed.length,
    startsWithBrace: trimmed.startsWith('{'),
    endsWithBrace: trimmed.endsWith('}'),
    startsWithBracket: trimmed.startsWith('['),
    endsWithBracket: trimmed.endsWith(']'),
    isValidJSON: isValidJSON(trimmed),
    isLaravelDump: isLaravelDump(trimmed)
  });
  
  // Try Laravel dump format first
  if (isLaravelDump(trimmed)) {
    console.log('Detected Laravel dump format');
    const parsed = parseLaravelDump(trimmed);
    const rendered = parsed.children
      .map((child, i) => renderLaravelDumpItem(child, 0, String(i)))
      .join('');
    return `<div class="laravel-dump-viewer">${rendered}</div>`;
  }
  
  // Try JSON format
  const parsedJSON = tryParseAsJSON(trimmed);
  if (parsedJSON !== null) {
    console.log('Successfully parsed JSON:', parsedJSON);
    return `<div class="json-viewer">${renderJSONCollapsible(parsedJSON, 0, '', true)}</div>`;
  }
  
  console.log('Not recognized format, displaying as plain text');
  return `<pre>${escapeHtml(output)}</pre>`;
}

function wireSfDumpInteractions(root) {
  if (!root) return;
  root.querySelectorAll('.sf-dump-wrapper pre.sf-dump').forEach((pre) => {
    // Toggle behavior for anchors
    pre.querySelectorAll('a.sf-dump-ref.sf-dump-toggle').forEach((a) => {
      // remove numeric id text but keep arrow span
      const spans = Array.from(a.querySelectorAll('span'));
      a.textContent = '';
      spans.forEach((s) => a.appendChild(s));
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const anchor = e.currentTarget;
        let sib = anchor.nextElementSibling;
        while (sib && sib.tagName !== 'SAMP') sib = sib.nextElementSibling;
        if (!sib) return;
        const open = sib.classList.contains('sf-dump-expanded');
        if (open) {
          sib.classList.remove('sf-dump-expanded');
          sib.classList.add('sf-dump-compact');
          const arrow = anchor.querySelector('span');
          if (arrow) arrow.textContent = '▶';
        } else {
          sib.classList.remove('sf-dump-compact');
          sib.classList.add('sf-dump-expanded');
          const arrow = anchor.querySelector('span');
          if (arrow) arrow.textContent = '▼';
        }
        // Ctrl+click expands/collapses all nested
        if (e.ctrlKey) {
          sib.querySelectorAll('samp').forEach((inner) => {
            if (open) {
              inner.classList.remove('sf-dump-expanded');
              inner.classList.add('sf-dump-compact');
            } else {
              inner.classList.remove('sf-dump-compact');
              inner.classList.add('sf-dump-expanded');
            }
          });
          sib.parentElement?.querySelectorAll('a.sf-dump-ref.sf-dump-toggle span').forEach((sp) => {
            sp.textContent = open ? '▶' : '▼';
          });
        }
        refreshLockUntil = Date.now() + 4000; // avoid refresh after interaction
      });
    });
  });
}

// Auto-refresh dumps every 2 seconds
let autoRefreshInterval;

function startAutoRefresh() {
  autoRefreshInterval = setInterval(() => {
    if (Date.now() > refreshLockUntil) {
      loadDumps();
    }
  }, 2000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  dumpContainer = document.querySelector("#dump-container");

  document
    .querySelector("#refresh-dumps")
    .addEventListener("click", loadDumps);
  document
    .querySelector("#clear-dumps")
    .addEventListener("click", clearDumps);

  loadDumps();
  startAutoRefresh();
});

// Clean up interval when page unloads
window.addEventListener("beforeunload", stopAutoRefresh);
