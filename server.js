import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');
const PORT = process.env.PORT || 8000;

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
  origin: ['https://daveseidman.github.io'],
  methods: ['GET', 'POST'],
}));

app.get('/', (req, res) => {
  res.send('Socket server running.');
});

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);
  socket.join('beauty1');

  const role = socket.handshake.query?.role;
  console.log(`🔍 Role: ${role}`);

  // question client
  if (role === 'question') {
    socket.on('submit', (data) => {
      const timestamp = Date.now();
      const submission = {
        timestamp,
        data,
      };

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

  // admin client
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

      // Broadcast to all connected roles
      io.to('beauty1').emit('allsubmissions', []);
      // io.to('beauty1').emit('approvedsubmissions', []);

      console.log('✅ All submissions cleared and update broadcasted.');
    });

    socket.on('clear', () => {
      console.log('clearing walls');
      io.to('beauty1').emit('clear')
    })

    socket.on('start', () => {
      console.log('starting');
      io.to('beauty1').emit('start');
    })


  }
  // results client
  if (role === 'results') {
    // const approved = allSubmissions.filter(s => s.approved);
    socket.emit('allsubmissions', allSubmissions);
  }


  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// --- Helper to update approval/denial status ---
function updateApprovalStatus(timestamp, { approved, denied }) {
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
      // submission.denied = denied;

      fs.writeFile(filepath, JSON.stringify(submission, null, 2), (err) => {
        if (err) {
          console.error('❌ Failed to update submission:', err);
        } else {
          console.log(`✅ Updated ${filename}: approved=${approved}`);

          // update in-memory cache
          const index = allSubmissions.findIndex(s => s.timestamp === submission.timestamp);
          if (index !== -1) {
            allSubmissions[index] = submission;
          }

          // notify clients
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
