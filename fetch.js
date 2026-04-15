const http = require('http');
http.get('http://localhost:5000/api/students', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => console.log(d));
});
