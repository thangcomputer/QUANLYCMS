const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) results = results.concat(walk(file));
        else if (file.endsWith('.js') || file.endsWith('.jsx')) results.push(file);
    });
    return results;
}

const files = walk('client/src');
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // Fix: const API = ... || 'http://localhost:5000'
    if (content.includes("'http://localhost:5000'")) {
        content = content.replace(/'http:\/\/localhost:5000'/g, '(import.meta.env.VITE_API_URL || "")');
        changed = true;
    }

    // Fix: `http://localhost:5000${...}`
    if (content.includes('http://localhost:5000')) {
        // This is trickier. We want to find it inside backticks.
        // Or just replace all remaining occurrences with a safe template string if they are in a backtick context.
        // A simpler way: replace it with ${import.meta.env.VITE_API_URL || ""} 
        // BUT only if the character before is a backtick.
        
        // Actually, if it's NOT inside quotes now (we handled '...' above), it's likely inside `...`
        content = content.replace(/http:\/\/localhost:5000/g, '${import.meta.env.VITE_API_URL || ""}');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(file, content);
        console.log('Fixed:', file);
    }
});
