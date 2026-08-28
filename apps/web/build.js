// Copies the two workspace packages next to the compiled app, and writes the
// import map that points at them.
//
// No bundler. The domain and the API client both compile to ordinary ESM with
// relative `./x.js` imports, which every browser this product cares about
// loads natively, and the only thing missing is a name for the two bare
// specifiers. An import map is that, in nine lines of JSON.
//
// The reason to care: a bundler here would be a build step between a reviewer
// and the thing being reviewed, and this console is small enough that the step
// buys nothing. If it ever grows a hundred modules and the waterfall starts to
// hurt, the answer is a bundler and this file is what it replaces.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');

await mkdir(join(dist, 'vendor'), { recursive: true });

for (const name of ['domain', 'api']) {
  await cp(join(here, '..', '..', 'packages', name, 'dist'), join(dist, 'vendor', name), {
    recursive: true,
  });
}

await cp(join(here, 'public'), dist, { recursive: true });

const html = await readFile(join(here, 'index.html'), 'utf8');
await writeFile(join(dist, 'index.html'), html);

console.log('apps/web/dist — open index.html from a static server');
