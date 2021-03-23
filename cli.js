#!/usr/bin / env node
import * as module from 'module';
import * as path from 'path';

import puppeteer from 'puppeteer'
import { createServer } from 'vite'

import mochaProtocolRunner from './mochaProtocolRunner.js';
import { MochaProtocolPlayer } from './mochaProtocolPlayer.js';

// Note: eventually turn into args with default values
const port = 3001;
const root = '.'; // Note: relative to cwd
const entry = 'test.html'; // Note: relative to root
const reporter = (process.argv[2] === '--reporter' && process.argv[3]) || 'spec';
const verbose = false;
const debug = false;
const mochaProtocolPrefix = 'mocha$protocol:';
// ----

// Note: https://mochajs.org/#running-mocha-in-the-browser
const mochaAbsolutePath = module.createRequire(import.meta.url).resolve('mocha/mocha.js');
const server = await createServer({
  resolve: {
    alias: {
      'mocha': mochaAbsolutePath
    }
  },
  server: {
    port: port,
  },
}, false);
await server.listen();

const mochaProtocolPlayer = new MochaProtocolPlayer(reporter);

const browser = await puppeteer.launch();
const page = await browser.newPage();
const address = `http://localhost:${port}/${entry}`;

try {
  // Note: forward console output from the page (from Mocha and tests and code)
  page.on('console', (msg) => {
    const { _text } = msg;
    if (_text.startsWith(mochaProtocolPrefix)) {
      mochaProtocolPlayer.play(_text.substr(mochaProtocolPrefix.length));
    } else {
      console.log.apply(console, msg.args().map((arg) => {
        // Note: this works only for arguments that are primitive values
        return arg._remoteObject.value;
      }));
    }
  });
  page.on('requestfailed', (request) => {
    throw new Error(request.url() + ' ' + request.failure().errorText);
  });
  if (verbose) {
    page.on('requestfinished', (request) => {
      console.log(request.url());
    });
  }
  page.on('pageerror', ({ message }) => {
    throw new Error(message);
  });
  page.on('error', (err) => {
    throw err;
  });
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  const failureCount = await page.evaluate(mochaProtocolRunner, { prefix: mochaProtocolPrefix });
  process.exit(failureCount);
} finally {
  await browser.close();
  if (!debug) {
    await server.close();
  }
}
