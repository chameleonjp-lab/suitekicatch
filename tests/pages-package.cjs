'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.join(__dirname,'..');
const entry=path.join(root,'scripts/package-pages.cjs');
const expected=["index.html","languages.js","i18n.js","audio.js","normal-score-ack8.js"];
if(!fs.existsSync(entry)){
  test('explicit runtime packager is available',()=>assert.fail('missing scripts/package-pages.cjs'));
}else{
  const {stageRuntime,packageForRunner}=require(entry);
  function fixture(options={}){
    const base=fs.mkdtempSync(path.join(os.tmpdir(),'pages-package-test-'));
    const source=path.join(base,'source'),output=path.join(base,'output');
    fs.mkdirSync(source);fs.mkdirSync(output);
    for(const name of expected){
      if(options.omit===name)continue;
      const bytes=name==='index.html'?Buffer.from('<!doctype html>\n'+expected.filter(x=>x!=='index.html').map(x=>'<script src="./'+x+'"></script>').join('\n')+'\n'+(options.extra||'')):Buffer.from('throw new Error("runtime must not execute");\n');
      fs.writeFileSync(path.join(source,name),bytes,{flag:'wx'});
    }
    fs.writeFileSync(path.join(source,'README.md'),'not a runtime asset',{flag:'wx'});
    return {base,source,output};
  }
  test('actual game packaging contains only exact runtime files with unchanged bytes',()=>{
    const output=fs.mkdtempSync(path.join(os.tmpdir(),'pages-actual-test-'));
    const result=stageRuntime(root,output);
    assert.deepEqual(fs.readdirSync(result).sort(),[...expected].sort());
    for(const name of expected)assert.deepEqual(fs.readFileSync(path.join(result,name)),fs.readFileSync(path.join(root,name)));
  });
  test('packaging copies scripts as inert bytes and excludes unrelated files',()=>{
    const f=fixture();const result=stageRuntime(f.source,f.output);
    assert.deepEqual(fs.readdirSync(result).sort(),[...expected].sort());
    assert.equal(fs.existsSync(path.join(result,'README.md')),false);
    for(const name of expected)assert.deepEqual(fs.readFileSync(path.join(result,name)),fs.readFileSync(path.join(f.source,name)));
  });
  test('missing runtime file fails before creating an artifact directory',()=>{
    const f=fixture({omit:expected.at(-1)});
    assert.throws(()=>stageRuntime(f.source,f.output));
    assert.deepEqual(fs.readdirSync(f.output),[]);
  });
  test('undeclared local asset fails even when the repository contains it',()=>{
    const f=fixture({extra:'<img src="extra.png">'});fs.writeFileSync(path.join(f.source,'extra.png'),'not allowed',{flag:'wx'});
    assert.throws(()=>stageRuntime(f.source,f.output),/undeclared/);
    assert.deepEqual(fs.readdirSync(f.output),[]);
  });
  test('symlink runtime input is rejected without following it',()=>{
    const omitted=expected.at(-1),f=fixture({omit:omitted});
    const target=path.join(f.base,'target');fs.writeFileSync(target,'private sentinel',{flag:'wx'});fs.symlinkSync(target,path.join(f.source,omitted));
    assert.throws(()=>stageRuntime(f.source,f.output),/regular file/);
    assert.deepEqual(fs.readdirSync(f.output),[]);
  });
  test('successive builds create distinct artifacts and preserve earlier output',()=>{
    const f=fixture(),a=stageRuntime(f.source,f.output);fs.writeFileSync(path.join(a,'sentinel'),'keep',{flag:'wx'});
    const b=stageRuntime(f.source,f.output);assert.notEqual(a,b);
    assert.equal(fs.readFileSync(path.join(a,'sentinel'),'utf8'),'keep');
    assert.deepEqual(fs.readdirSync(b).sort(),[...expected].sort());
  });
  test('runner integration appends only the generated artifact path without replacing output',()=>{
    const f=fixture(),file=path.join(f.base,'runner-output');fs.writeFileSync(file,'previous=keep\n',{flag:'wx'});
    const artifact=packageForRunner({RUNNER_TEMP:f.output,GITHUB_OUTPUT:file},f.source);
    assert.equal(fs.readFileSync(file,'utf8'),'previous=keep\npath='+artifact+'\n');
    assert.deepEqual(fs.readdirSync(artifact).sort(),[...expected].sort());
  });
  test('missing or multiline runner environment fails before staging',()=>{
    const f=fixture();
    assert.throws(()=>packageForRunner({},f.source));
    assert.throws(()=>packageForRunner({RUNNER_TEMP:f.output+'\ninvalid',GITHUB_OUTPUT:path.join(f.base,'out')},f.source));
    assert.deepEqual(fs.readdirSync(f.output),[]);
  });
  test('runner output cannot append inside the repository',()=>{
    const f=fixture();
    assert.throws(()=>packageForRunner({RUNNER_TEMP:f.output,GITHUB_OUTPUT:path.join(f.source,'unexpected.txt')},f.source),/outside/);
    assert.equal(fs.existsSync(path.join(f.source,'unexpected.txt')),false);
    assert.deepEqual(fs.readdirSync(f.output),[]);
  });
  test('dangling runner output symlink is rejected before artifact creation',()=>{
    const f=fixture(),output=path.join(f.base,'runner-output-link'),target=path.join(f.source,'unexpected.txt');
    fs.symlinkSync(target,output);
    assert.throws(()=>packageForRunner({RUNNER_TEMP:f.output,GITHUB_OUTPUT:output},f.source),/regular file/);
    assert.equal(fs.existsSync(target),false);
    assert.deepEqual(fs.readdirSync(f.output),[]);
  });
}
