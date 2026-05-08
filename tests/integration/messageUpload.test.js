/**
 * Replicates the inline Multer fileFilter logic from routes/messageRoutes.js
 * to verify acceptance of allowed types and rejection of dangerous types.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const allowedMsgExt = /\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|mp4|webm|mp3|wav)$/i;

function fileFilter(file) {
  const okMime = /^(image\/|application\/pdf|application\/zip|application\/vnd\.|text\/plain|video\/|audio\/)/.test(file.mimetype || '');
  const okExt = allowedMsgExt.test(file.originalname || '');
  if (okMime || okExt) return { ok: true };
  return { ok: false, err: 'Định dạng file không được phép' };
}

const accepted = [
  { originalname: 'photo.jpg', mimetype: 'image/jpeg' },
  { originalname: 'doc.pdf', mimetype: 'application/pdf' },
  { originalname: 'report.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { originalname: 'sheet.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { originalname: 'archive.zip', mimetype: 'application/zip' },
  { originalname: 'note.txt', mimetype: 'text/plain' },
  { originalname: 'clip.mp4', mimetype: 'video/mp4' },
  { originalname: 'song.mp3', mimetype: 'audio/mpeg' },
];

for (const f of accepted) {
  test('messageUpload accepts ' + f.originalname, () => {
    assert.equal(fileFilter(f).ok, true);
  });
}

const rejected = [
  { originalname: 'shell.sh', mimetype: 'application/x-sh' },
  { originalname: 'binary.exe', mimetype: 'application/octet-stream' },
  { originalname: 'page.html', mimetype: 'text/html' },
  { originalname: 'evil.php', mimetype: 'application/x-php' },
  { originalname: 'archive.tar.gz', mimetype: 'application/gzip' },
];

for (const f of rejected) {
  test('messageUpload rejects ' + f.originalname, () => {
    const r = fileFilter(f);
    assert.equal(r.ok, false);
    assert.match(r.err, /không được phép/);
  });
}