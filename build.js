const fs = require('fs'), path = require('path');
const eng = fs.readFileSync(path.join(__dirname, 'src/engine.js'), 'utf8');
if (/<\/script/i.test(eng)) throw new Error('engine contém </script>');
const tpl = fs.readFileSync(path.join(__dirname, 'src/template.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'index.html'), tpl.replace('/*ENGINE*/', () => eng));
console.log('index.html gerado,', fs.statSync(path.join(__dirname, 'index.html')).size, 'bytes');
