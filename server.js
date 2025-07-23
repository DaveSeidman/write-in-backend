import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Change to your frontend origin if needed
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.get('/', (req, res) => {
  res.send('Socket server running.');
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Handle room join based on query param
  const { role } = socket.handshake.query;

  if (role === 'question') {
    socket.join('question');
  } else if (role === 'admin') {
    socket.join('admin');
  } else if (role === 'results') {
    socket.join('results');
  }

  // Handle submissions from /question clients
  socket.on('submit', (data) => {
    console.log('Received submission:', data);
    io.to('admin').emit('submit', data); // Forward to /admin clients
  });

  // Handle approvals from /admin clients
  socket.on('approve', (data) => {
    console.log('Approved data:', data);
    io.to('results').emit('approved', data); // Forward to /results clients
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
