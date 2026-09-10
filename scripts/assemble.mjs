import fs from 'node:fs';
const parts={STYLE:'style.css',ECONOMY:'economy.js',AUDIO:'audio.js',STAGE:'stage.js',GAME:'game.js'};
let html=fs.readFileSync('prototype/shell.html','utf8');
for(const [key,file] of Object.entries(parts)){const text=fs.readFileSync(`prototype/${file}`,'utf8');html=html.replace(`/*__${key}__*/`,()=>text);}
fs.mkdirSync('public',{recursive:true});fs.writeFileSync('public/prototype.html',html);
console.log('Assembled self-contained prototype:',html.length,'bytes');
