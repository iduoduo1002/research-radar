import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('dist/research-radar',{recursive:true});
await build({entryPoints:['src/main.js'],bundle:true,platform:'node',target:'es2022',format:'cjs',loader:{'.md':'text'},external:['obsidian','electron'],outfile:'dist/research-radar/main.js',logLevel:'info'});
for(const n of ['manifest.json','styles.css'])await fs.copyFile(n,'dist/research-radar/'+n);
