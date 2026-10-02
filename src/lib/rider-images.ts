/**
 * Kamen Rider Choice Images Mapping
 * Maps Kamen Rider names to their respective character images in /choices/
 * Source: C:\Desktop\gamegakgak\Choice_pic\choice_pic
 */

export const RIDER_IMAGE_MAP: Record<string, string> = {
  'Kamen Rider Kuuga': '/choices/kuuga.jpg',
  'Kamen Rider Agito': '/choices/agito.jpg',
  'Kamen Rider Ryuki': '/choices/ryuki.jpg',
  'Kamen Rider 555': '/choices/faiz.jpg',
  'Kamen Rider Faiz': '/choices/faiz.jpg',
  'Kamen Rider Blade': '/choices/blade.jpg',
  'Kamen Rider Hibiki': '/choices/hibiki.jpg',
  'Kamen Rider Kabuto': '/choices/kabuto.jpg',
  'Kamen Rider Den-O': '/choices/den-o.jpg',
  'Kamen Rider Kiva': '/choices/kiva.jpg',
  'Kamen Rider Decade': '/choices/decade.jpg',
  'Kamen Rider W': '/choices/w.jpg',
  'Kamen Rider OOO': '/choices/ooo.jpg',
  'Kamen Rider Fourze': '/choices/fourze.jpg',
  'Kamen Rider Wizard': '/choices/wizard.jpg',
  'Kamen Rider Gaim': '/choices/gaim.jpg',
  'Kamen Rider Drive': '/choices/drive.jpg',
  'Kamen Rider Ghost': '/choices/ghost.jpg',
  'Kamen Rider Ex-Aid': '/choices/ex-aid.jpg',
  'Kamen Rider Build': '/choices/build.jpg',
  'Kamen Rider Zi-O': '/choices/Zi-o.jpg',
  'Kamen Rider Zero-One': '/choices/Zero-One.jpg',
  'Kamen Rider Saber': '/choices/Saber.jpg',
  'Kamen Rider Revice': '/choices/Revice.jpg',
  'Kamen Rider Geats': '/choices/Geats.jpg',
  'Kamen Rider Gotchard': '/choices/Gotchard.jpg',
  'Kamen Rider Gavv': '/choices/Gavv.jpg',
  'Kamen Rider Zeztz': '/choices/ZEZTZ.jpg',
  'Kamen Rider My-Th': '/choices/MY-TH.png',
};

/**
 * Get the rider image URL for a given choice/series name
 */
export function getRiderImage(name: string): string | undefined {
  if (!name) return undefined;
  if (RIDER_IMAGE_MAP[name]) return RIDER_IMAGE_MAP[name];

  const clean = name.toLowerCase().replace(/^kamen\s*rider\s*/i, '').trim();
  for (const [key, val] of Object.entries(RIDER_IMAGE_MAP)) {
    const keyClean = key.toLowerCase().replace(/^kamen\s*rider\s*/i, '').trim();
    if (keyClean === clean) return val;
  }
  return undefined;
}
