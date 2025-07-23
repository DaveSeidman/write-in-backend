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
  socket.join('beauty1');

  socket.on('submit', (data) => {
    console.log('Received submission:', data);
    io.to('beauty1').emit('submit', data);
  });

  socket.on('approve', (data) => {
    console.log('Approved data:', data);
    io.to('beauty1').emit('approved', data);
  });

  socket.on('replay-test', (data) => {
    console.log('Replay test event received:', data);
    io.to('beauty1').emit('replay-test', data); // forward it for testing
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
