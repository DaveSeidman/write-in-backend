import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import canvasPkg from 'canvas';
const { createCanvas, Path2D } = canvasPkg; import archiver from 'archiver';
import { getStroke } from 'perfect-freehand';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');
const PORT = process.env.PORT || 8000;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 680;

// --- Ensure submissions directory exists ---
if (!fs.existsSync(SUBMISSIONS_DIR)) {
  fs.mkdirSync(SUBMISSIONS_DIR);
  console.log('📁 Created submissions directory.');
}

// --- Load existing submissions ---
let allSubmissions = [];
const files = fs.readdirSync(SUBMISSIONS_DIR).filter(f => f.endsWith('.json'));
for (const file of files) {
  const content = fs.readFileSync(path.join(SUBMISSIONS_DIR, file), 'utf8');
  try {
    const json = JSON.parse(content);
    allSubmissions.push(json);
  } catch (e) {
    console.warn(`⚠️ Failed to parse submission ${file}`);
  }
}
console.log(`📄 Loaded ${allSubmissions.length} existing submissions.`);

// --- Express & Socket.IO ---
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'https://daveseidman.github.io',
    methods: ['GET', 'POST']
  }
});

app.use(cors({
  origin: ['http://localhost:8080', 'https://daveseidman.github.io'],
  methods: ['GET', 'POST'],
}));

app.get('/', (req, res) => {
  res.send('Socket server running.');
});

// 🆕 Utility for rendering paths
function ptsToSvgPath(points) {
  if (!points.length) return '';
  const d = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`
  );
  return `${d.join(' ')} Z`;
}

// 🆕 Render and zip all submissions
app.get('/rendered-submissions.zip', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="rendered-submissions.zip"');
  res.setHeader('Content-Type', 'application/zip');

  const downloadDirectory = path.join(__dirname, 'downloaded-submissions');

  const archive = archiver('zip');
  archive.pipe(res);

  const files = fs.readdirSync(downloadDirectory).filter(f => f.endsWith('.json'));

  files.forEach(file => {
    const json = JSON.parse(fs.readFileSync(path.join(downloadDirectory, file), 'utf8'));
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = 'black';

    if (Array.isArray(json.data)) {
      json.data.forEach(stroke => {
        const strokeInput = stroke.map(p => [p.x, p.y, p.pressure]);
        const outline = getStroke(strokeInput);
        ctx.beginPath();
        outline.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill(); ctx.fill(path);
      });
    }

    const buffer = canvas.toBuffer('image/png');
    // Parse timestamp from filename: "submission-1753998091489.json"
    const timestampMatch = file.match(/submission-(\d+)\.json/);
    const timestamp = timestampMatch ? Number(timestampMatch[1]) : null;

    let formattedName = 'unknown';

    if (timestamp) {
      const date = new Date(timestamp);
      const options = { month: 'long', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const formatted = formatter.format(date)
        .toLowerCase()
        .replace(',', '')
        .replace(/ /g, '-')
        .replace(/:/g, '-')    // replace colons with dashes
        .replace(/--/g, '-')
        .replace('-at-', '_')

      formattedName = formatted;
    }

    // Add approval status suffix
    const suffix = json.approved === true
      ? '_approved'
      : json.approved === false
        ? '_denied'
        : '';

    const filename = `${formattedName}${suffix}.png`;

    archive.append(buffer, { name: filename });
    console.log('appended', file)
  });

  archive.finalize();
});

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);
  socket.join('beauty1');

  const role = socket.handshake.query?.role;
  console.log(`🔍 Role: ${role}`);

  if (role === 'question') {
    socket.on('submit', (data) => {
      const timestamp = Date.now();
      const submission = { timestamp, data };

      console.log('📥 Received submission:', timestamp);
      io.to('beauty1').emit('submission', submission);

      const filename = `submission-${timestamp}.json`;
      const filepath = path.join(SUBMISSIONS_DIR, filename);
      fs.writeFile(filepath, JSON.stringify(submission, null, 2), (err) => {
        if (err) {
          console.error('❌ Failed to save submission:', err);
        } else {
          console.log(`💾 Saved submission to ${filename}`);
          allSubmissions.push(submission);
        }
      });
    });
  }

  if (role === 'admin') {
    console.log('📤 Sending all submissions to admin');
    socket.emit('allsubmissions', allSubmissions);

    socket.on('approve', (timestamp) => {
      updateApprovalStatus(timestamp, { approved: true });
    });

    socket.on('deny', (timestamp) => {
      updateApprovalStatus(timestamp, { approved: false });
    });

    socket.on('deleteAll', () => {
      console.log('🧹 Deleting all submissions...');
      const files = fs.readdirSync(SUBMISSIONS_DIR).filter(f => f.endsWith('.json'));
      files.forEach(file => {
        const filepath = path.join(SUBMISSIONS_DIR, file);
        try {
          fs.unlinkSync(filepath);
          console.log(`🗑️ Deleted ${file}`);
        } catch (err) {
          console.error(`❌ Failed to delete ${file}:`, err);
        }
      });

      allSubmissions = [];
      io.to('beauty1').emit('allsubmissions', []);
      console.log('✅ All submissions cleared and update broadcasted.');
    });

    socket.on('clear', () => {
      console.log('clearing walls');
      io.to('beauty1').emit('clear');
    });

    socket.on('start', () => {
      console.log('starting');
      io.to('beauty1').emit('start');
    });
  }

  if (role === 'results') {
    socket.emit('allsubmissions', allSubmissions);
  }

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// --- Removed '/saved' route ---

function updateApprovalStatus(timestamp, { approved }) {
  const filename = `submission-${timestamp}.json`;
  const filepath = path.join(SUBMISSIONS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    console.warn(`⚠️ Submission file not found: ${filename}`);
    return;
  }

  fs.readFile(filepath, 'utf8', (err, content) => {
    if (err) {
      console.error('❌ Error reading file:', err);
      return;
    }

    try {
      const submission = JSON.parse(content);
      submission.approved = approved;

      fs.writeFile(filepath, JSON.stringify(submission, null, 2), (err) => {
        if (err) {
          console.error('❌ Failed to update submission:', err);
        } else {
          console.log(`✅ Updated ${filename}: approved=${approved}`);
          const index = allSubmissions.findIndex(s => s.timestamp === submission.timestamp);
          if (index !== -1) {
            allSubmissions[index] = submission;
          }
          io.to('beauty1').emit('submission-updated', submission);
        }
      });
    } catch (e) {
      console.error('❌ Failed to parse submission JSON:', e);
    }
  });
}

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
