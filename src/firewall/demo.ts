import { ToolCallEvent } from './types.js';

export const DEMO_EVENTS: ToolCallEvent[] = [
  {
    server: 'filesystem',
    tool: 'read_file',
    arguments: { path: 'src/index.ts' },
  },
  {
    server: 'filesystem',
    tool: 'write_file',
    arguments: {
      path: 'package.json',
      content: '{ "name": "my-app", "scripts": { "start": "node index.js" } }',
    },
  },
  {
    server: 'filesystem',
    tool: 'write_file',
    arguments: {
      path: '.env',
      content: 'API_KEY=example-not-a-real-key',
    },
  },
  {
    server: 'shell',
    tool: 'execute_command',
    arguments: { command: 'rm -rf /tmp/build-artifacts' },
  },
  {
    server: 'browser',
    tool: 'http_request',
    arguments: {
      url: 'https://api.example.com/data',
      token: 'fake_token_for_demo_only',
    },
  },
];

export const DEMO_LABELS = [
  'Safe file read',
  'Risky package.json write',
  'Critical .env write',
  'Dangerous shell command',
  'Network request with token-like argument',
];
