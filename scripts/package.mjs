import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
// Always rebuild the embedded help and program together before packaging.
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});
const m=JSON.parse(await readFile('manifest.json','utf8')),out=`release/research-radar-${m.version}.zip`;
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(pkg.version!==m.version)throw Error('manifest.json 与 package.json 版本不一致，拒绝打包。');
await mkdir('release',{recursive:true});
const files=['main.js','manifest.json','styles.css','README.md','AGENT.md','example-profile.json','THIRD-PARTY-NOTICES.md','docs/USER-GUIDE.md','docs/SECURITY.md','docs/STATUS.md','docs/ZOTERO.md','LICENSE','NOTICE','RIGHTS.md','README.en.md','CHANGELOG.md','CONTRIBUTING.md','docs/PUBLISHING.md','docs/images/radar-desktop.png','docs/images/agent-handoff.png'];
const code=`import zipfile,sys,json,re,posixpath\nfrom pathlib import Path\nfiles=json.loads(sys.argv[2])\nwith zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:\n for n in files:\n  p=(Path('dist/research-radar')/n) if n in ['main.js','manifest.json','styles.css'] else Path(n)\n  data=p.read_bytes()\n  assert len(data)>100, (n,'empty or incomplete file')\n  if n.endswith('.md'):\n   text=data.decode('utf8')\n   assert len(text.strip())>200,(n,'incomplete documentation')\n   for link in re.findall(r'\\]\\(([^)]+)\\)',text):\n    if '://' not in link and not link.startswith('#'):\n     target=posixpath.normpath(posixpath.join(posixpath.dirname(n),link.split('#')[0]))\n     assert target in files,(n,'unpackaged link',link)\n  z.writestr('research-radar/'+n,data)\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert set(z.namelist())==set('research-radar/'+n for n in files)\n print('PASS: all files nonempty, documentation links resolved, allowlist exact')\n`;
execFileSync('python3',['-c',code,out,JSON.stringify(files)],{stdio:'inherit'});
const sha=createHash('sha256').update(await readFile(out)).digest('hex');await writeFile(out+'.sha256',`${sha}  research-radar-${m.version}.zip\n`);console.log(`${out}\nSHA256 ${sha}`);
