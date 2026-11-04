/* Modified 2026-11-04: iduoduo public beta, owner-window preview and feedback. */
import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('dist/research-radar',{recursive:true});
const legal = ['LICENSE','NOTICE','THIRD-PARTY-NOTICES.md'];
const notice = (await Promise.all(legal.map(n => fs.readFile(n,'utf8')))).join('\n\n');
if(notice.includes('*/')) throw Error('Unsafe legal notice comment');
await build({banner:{js:'/*!\n'+notice+'\n*/'},entryPoints:['src/main.js'],bundle:true,platform:'node',target:'es2022',format:'cjs',loader:{'.md':'text'},external:['obsidian','electron'],outfile:'dist/research-radar/main.js',logLevel:'info'});
for(const n of ['manifest.json','styles.css'])await fs.copyFile(n,'dist/research-radar/'+n);
