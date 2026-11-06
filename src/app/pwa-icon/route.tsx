import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ALLOWED = new Set([180, 192, 512]);

/** The Home Screen icon: the TripleA shield on black. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const wanted = Number(params.get('size'));
  const size = ALLOWED.has(wanted) ? wanted : 512;
  const maskable = params.get('maskable') === '1';

  const file = await readFile(path.join(process.cwd(), 'public', 'images', 'triplea-shield.png'));
  const src = `data:image/png;base64,${file.toString('base64')}`;
  // The shield is 84x98; keep its shape and leave a safe margin (a larger one for maskable icons)
  const height = Math.round(size * (maskable ? 0.5 : 0.62));
  const width = Math.round((height * 84) / 98);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={width} height={height} alt="" />
      </div>
    ),
    { width: size, height: size }
  );
}
