#!/usr/bin/env node

import { exec } from 'child_process';
import { config } from 'dotenv';
import path from 'path';
import os from 'os';

config();

const { SSH_USER, SSH_HOST, SSH_KEY, REMOTE_PATH, LOCAL_PATH } = process.env;

if (!SSH_USER || !SSH_HOST || !SSH_KEY || !REMOTE_PATH || !LOCAL_PATH) {
  console.error('❌ Missing required environment variables. Check your .env file.');
  process.exit(1);
}

const resolvedKeyPath = SSH_KEY.replace(/^~(?=$|\/|\\)/, os.homedir());
const scpCommand = `scp -i "${resolvedKeyPath}" ${SSH_USER}@${SSH_HOST}:"${REMOTE_PATH}/*.json" "${LOCAL_PATH}"`;

console.log(`📥 Downloading submissions from ${SSH_USER}@${SSH_HOST}...`);

exec(scpCommand, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Error during SCP: ${stderr}`);
    process.exit(1);
  } else {
    console.log(`✅ Submissions downloaded to ${LOCAL_PATH}`);
    console.log(stdout);
  }
});
