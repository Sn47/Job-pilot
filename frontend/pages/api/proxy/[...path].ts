import type { NextApiRequest, NextApiResponse } from 'next';

// The browser never sees API_TOKEN: this route adds it server-side and forwards to the backend.
export const config = { api: { bodyParser: false, responseLimit: false } };

function readBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
  const token = process.env.API_TOKEN || '';
  const { path, ...query } = req.query;
  const segs = Array.isArray(path) ? path : path ? [path] : [];
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.append(k, v);
  }
  const url = `${backend}/api/${segs.map(encodeURIComponent).join('/')}${qs.toString() ? `?${qs}` : ''}`;
  const method = req.method || 'GET';
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await readBody(req);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (req.headers['content-type']) headers['Content-Type'] = String(req.headers['content-type']);
  try {
    const upstream = await fetch(url, { method, headers, body: body && body.length ? new Uint8Array(body) : undefined });
    res.status(upstream.status);
    for (const h of ['content-type', 'content-disposition']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ detail: 'Backend unreachable: is it running on port 8001?' });
  }
}
