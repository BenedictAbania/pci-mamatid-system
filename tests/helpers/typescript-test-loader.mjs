import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const urls=new Map();
export async function moduleUrl(file) {
  file=path.resolve(file); if(urls.has(file))return urls.get(file);
  let code=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const imports=[...code.matchAll(/from ['"]([^'"]+)['"]/g)];
  for(const m of imports) if(m[1].startsWith('.'))code=code.replaceAll(JSON.stringify(m[1]),JSON.stringify(await moduleUrl(path.resolve(path.dirname(file),m[1])))).replaceAll("'"+m[1]+"'",JSON.stringify(await moduleUrl(path.resolve(path.dirname(file),m[1]))));
  const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');urls.set(file,url);return url;
}
