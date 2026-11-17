// Loads a running page in jsdom (scripts on, fetch polyfilled), waits for data, writes a self-contained HTML
// with the built CSS inlined and scripts removed, for screenshot review. Dev-only helper.
const { JSDOM, ResourceLoader } = require('jsdom');
const fs = require('fs');

const [, , url, out, cssPath, width = '1280'] = process.argv;
const css = fs.readFileSync(cssPath, 'utf8');

class Loader extends ResourceLoader {
  fetch(u, options) {
    if (u.endsWith('.css') || u.includes('fonts.googleapis')) return Promise.resolve(Buffer.from(''));
    return super.fetch(u, options);
  }
}

(async () => {
  const dom = await JSDOM.fromURL(url, {
    runScripts: 'dangerously', resources: new Loader(), pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = (u, o) => fetch(new URL(u, url).toString(), o);
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.scrollTo = () => {};
      Object.defineProperty(window, 'innerWidth', { value: Number(width) });
    },
  });
  await new Promise((r) => setTimeout(r, 6000));
  const doc = dom.window.document;
  doc.querySelectorAll('script, link[rel=stylesheet], link[rel=preload], noscript').forEach((n) => n.remove());
  const style = doc.createElement('style');
  style.textContent = css + `\nhtml{width:${width}px}`;
  doc.head.appendChild(style);
  fs.writeFileSync(out, '<!doctype html>\n' + doc.documentElement.outerHTML);
  console.log('wrote', out, doc.body.textContent.slice(0, 80).replace(/\s+/g, ' '));
  dom.window.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
