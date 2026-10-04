const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'moxiu-game-'));
try {
  const bundle = path.join(temp,'engine.js');
  execFileSync(process.env.ESBUILD || 'esbuild', [path.join(root,'src/core/game-engine.js'),'--bundle','--format=esm','--platform=neutral','--minify',`--outfile=${bundle}`], {stdio:'inherit'});
  const files = [
    {name:'index.ts',content:fs.readFileSync(path.join(root,'supabase/functions/moxiu-game/index.ts'),'utf8')},
    {name:'game/core/game-engine.js',content:fs.readFileSync(bundle,'utf8')},
  ];
  if (!process.argv[2]) throw new Error('Pass an output JSON path outside the project');
  fs.writeFileSync(process.argv[2],JSON.stringify(files));
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
