import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),source=path.resolve(root,'dist'),target=path.resolve(root,'docs');
if(path.dirname(target)!==root||path.basename(target)!=='docs')throw Error('Unexpected Pages target');
await fs.mkdir(target,{recursive:true});await fs.cp(source,target,{recursive:true,force:true});
await fs.writeFile(path.join(target,'.nojekyll'),'');
console.log('GitHub Pages output prepared in docs/');
