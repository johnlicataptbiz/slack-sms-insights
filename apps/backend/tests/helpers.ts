import { mock } from 'node:test';
import { type AckFn, LogLevel, type SayFn } from '@slack/bolt';
import { WebClient } from '@slack/web-api';

export const fakeLogger = {
  debug: mock.fn(),
  info: mock.fn(),
  warn: mock.fn(),
  error: mock.fn(),
  setLevel: mock.fn(),
  getLevel: mock.fn(() => LogLevel.DEBUG),
  setName: mock.fn(),
  resetCalls(): void {
    fakeLogger.debug.mock.resetCalls();
    fakeLogger.info.mock.resetCalls();
    fakeLogger.warn.mock.resetCalls();
    fakeLogger.error.mock.resetCalls();
    fakeLogger.setLevel.mock.resetCalls();
    fakeLogger.getLevel.mock.resetCalls();
    fakeLogger.setName.mock.resetCalls();
  },
};

export const fakeAck = mock.fn<AckFn<void>>();
export const fakeClient = new WebClient('xoxb_example');
export const fakeSay = mock.fn<SayFn>();
