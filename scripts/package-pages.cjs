'use strict';
const fs=require('node:fs'),path=require('node:path');
const RUNTIME_FILES=Object.freeze(["index.html","languages.js","i18n.js","audio.js","normal-score-ack8.js"]);
function inside(root,target){
  const relative=path.relative(root,target);
  return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
}
function absolute(value,label){
  if(typeof value!=='string'||!path.isAbsolute(value)||/[\r\n]/.test(value))throw new Error(label+' must be an absolute single-line path');
  return path.resolve(value);
}
function stageRuntime(repositoryRoot,outputParent){
  const root=fs.realpathSync(absolute(repositoryRoot,'repositoryRoot'));
  const parent=fs.realpathSync(absolute(outputParent,'outputParent'));
  if(inside(root,parent))throw new Error('outputParent must be outside the repository');
  if(!fs.statSync(parent).isDirectory())throw new Error('outputParent must be a directory');
  const files=RUNTIME_FILES.map(name=>{
    const source=path.join(root,name),stat=fs.lstatSync(source);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error(name+' must be a regular file');
    const bytes=fs.readFileSync(source);
    if(bytes.length===0)throw new Error(name+' must not be empty');
    return {name,bytes};
  });
  const html=files.find(file=>file.name==='index.html').bytes.toString('utf8');
  const refs=[...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(match=>match[1]);
  for(const match of html.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi))refs.push(match[1]);
  for(const ref of refs){
    if(/^(?:https?:|data:|mailto:|tel:|\/\/|#)/i.test(ref))continue;
    const name=ref.split(/[?#]/,1)[0].replace(/^\.\//,'');
    if(!RUNTIME_FILES.includes(name))throw new Error('undeclared local runtime asset: '+ref);
  }
  const destination=fs.mkdtempSync(path.join(parent,'pages-runtime-'));
  for(const file of files)fs.writeFileSync(path.join(destination,file.name),file.bytes,{flag:'wx',mode:0o644});
  return destination;
}
function packageForRunner(environment,repositoryRoot){
  const root=fs.realpathSync(absolute(repositoryRoot,'repositoryRoot'));
  const parent=absolute(environment.RUNNER_TEMP,'RUNNER_TEMP');
  const output=absolute(environment.GITHUB_OUTPUT,'GITHUB_OUTPUT');
  const outputDirectory=fs.realpathSync(path.dirname(output));
  if(inside(root,path.join(outputDirectory,path.basename(output))))throw new Error('GITHUB_OUTPUT must be outside the repository');
  let stat;
  try{stat=fs.lstatSync(output);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw new Error('GITHUB_OUTPUT must be a regular file');
  if(typeof fs.constants.O_NOFOLLOW!=='number')throw new Error('No-follow file output is required');
  const artifact=stageRuntime(root,parent);
  const fd=fs.openSync(output,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW,0o600);
  try{
    if(!fs.fstatSync(fd).isFile())throw new Error('GITHUB_OUTPUT must be a regular file');
    fs.writeSync(fd,'path='+artifact+'\n');
  }finally{fs.closeSync(fd);}
  return artifact;
}
module.exports={stageRuntime,packageForRunner};
if(require.main===module)packageForRunner(process.env,path.resolve(__dirname,'..'));
