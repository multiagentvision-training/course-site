/* Shared Markdown policy for the encrypted viewer, author preview and Vite renderer. */
(() => {
  'use strict';
  const SAFE_TAGS = new Set(('a p div span h1 h2 h3 h4 h5 h6 ul ol li pre code em strong b i s del '
    + 'blockquote hr br table thead tbody tfoot tr th td img details summary dl dt dd kbd samp sub sup').split(' '));
  const SAFE_ATTRS = {
    a: new Set(['href', 'title']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    code: new Set(['class']),
    ol: new Set(['start']),
    th: new Set(['colspan', 'rowspan', 'align']),
    td: new Set(['colspan', 'rowspan', 'align']),
    details: new Set(['open']),
  };

  function isSafeUrl(value, { image = false } = {}) {
    if (typeof value !== 'string' || /[\u0000-\u0020\u007f-\u009f\\]/.test(value)
      || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return false;
    if (!value || value.startsWith('//')) return false;
    if (/^https?:\/\//i.test(value)) {
      try { const url = new URL(value); return Boolean(url.hostname) && !url.username && !url.password; }
      catch { return false; }
    }
    if (!image && /^mailto:[^:]+$/i.test(value)) return true;
    // Relative and fragment links are inert URLs; any scheme-like first segment is rejected.
    return !/^[^/?#]*:/.test(value);
  }

  function sanitizeHtmlTree(doc) {
    function sanitizeNode(node) {
      if (node.nodeType === 3) return;
      if (node.nodeType !== 1) { node.remove(); return; }
      const tag = node.localName;
      // Remove the entire unsupported subtree, including foreign namespaces and templates.
      if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !SAFE_TAGS.has(tag)) {
        node.remove();
        return;
      }
      for (const attr of [...node.attributes]) {
        const name = attr.name;
        const allowed = SAFE_ATTRS[tag] && SAFE_ATTRS[tag].has(name);
        const safe = allowed
          && (!(name === 'href' || name === 'src') || isSafeUrl(attr.value, { image: tag === 'img' }))
          && (name !== 'class' || /^language-[a-z0-9_-]+$/i.test(attr.value))
          && (!['width', 'height', 'colspan', 'rowspan', 'start'].includes(name) || /^\d{1,4}$/.test(attr.value))
          && (name !== 'align' || /^(left|center|right)$/.test(attr.value));
        if (!safe) node.removeAttribute(name);
      }
      if (tag === 'a' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      for (const child of [...node.childNodes]) sanitizeNode(child);
    }
    for (const node of [...doc.body.childNodes]) sanitizeNode(node);
    return doc;
  }

  globalThis.MvtSanitizer = Object.freeze({ isSafeUrl, sanitizeHtmlTree });
})();
